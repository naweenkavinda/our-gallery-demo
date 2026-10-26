import { sound } from './Sound.js';
import * as THREE from 'three';
import { heartGeometry, NOTE_SPOTS, HEART_SPOTS, ROOM_DEFS, LAYOUT, addObstacleCircle } from './Gallery.js';
import config from '../config/gallery.json';
import { describeSpot } from './Hints.js';

/**
 * Love notes (found one at a time, each one hinting at the next) and eight hidden hearts.
 * Finding every heart opens the final question. Progress is saved in this browser.
 */

const clueFor = i => NOTE_SPOTS[i] ? `A note is waiting ${describeSpot(NOTE_SPOTS[i])}.` : '';

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('og-' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('og-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function chime(notes = [880, 1320]) {
  try {
    const ctx = (sound.unlock(), sound.ctx);
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (const f of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(sound.sfx); o.start(t); o.stop(t + 0.55);
      t += 0.12;
    }
  } catch { /* audio unavailable */ }
}

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,230,200,0.9)'); grad.addColorStop(0.4, 'rgba(255,170,190,0.35)'); grad.addColorStop(1, 'rgba(255,170,190,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function makeGlow(size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

function makeEnvelope() {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xfdf6e8, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.23), paper);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-0.17, 0.115); flapShape.lineTo(0.17, 0.115); flapShape.lineTo(0, -0.02); flapShape.closePath();
  const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), new THREE.MeshStandardMaterial({ color: 0xf1e4cf, roughness: 0.85, side: THREE.DoubleSide }));
  flap.rotation.x = -Math.PI / 2; flap.position.y = 0.008;
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 24), new THREE.MeshStandardMaterial({ color: 0xc23b54, roughness: 0.4, metalness: 0.2 }));
  seal.position.set(0, 0.016, -0.015);
  g.add(body, flap, seal);
  g.rotation.x = 0.35;
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export function createCollectibles({ scene, interactions, controls, showToast, onYes, requestGuide }) {
  const notes = config.notes;
  let foundNotes = store.get('notes', []);
  let foundHearts = store.get('hearts', []);
  let done = store.get('hunt-done', false);
  let modal = null;                        // 'letter' | 'surprise' | null
  let modalSince = 0;

  /* ── HUD chips ── */
  const hud = document.createElement('div');
  hud.className = 'quest-hud';
  hud.innerHTML = '<span id="chip-notes" title="Press N for a clue to the next note"></span><span id="chip-hearts"></span>';
  document.body.appendChild(hud);
  const chipN = hud.querySelector('#chip-notes'), chipH = hud.querySelector('#chip-hearts');
  const refreshHud = (bump) => {
    chipN.textContent = `Notes ${foundNotes.length}/${notes.length}`;
    chipH.textContent = `Hearts ${foundHearts.length}/${HEART_SPOTS.length}`;
    chipN.classList.toggle('done', foundNotes.length >= notes.length);
    chipH.classList.toggle('done', foundHearts.length >= HEART_SPOTS.length);
    if (bump) { bump.classList.remove('bump'); void bump.offsetWidth; bump.classList.add('bump'); }
  };
  refreshHud();

  /* ── Letter + surprise overlays ── */
  const letter = document.createElement('div');
  letter.className = 'modal'; letter.hidden = true;
  letter.innerHTML = `<div class="paper"><p class="paper-kicker"></p><h2 class="paper-title" hidden></h2><p class="paper-text"></p><p class="paper-sign"></p><button class="paper-close">${document.body.classList.contains('touch') ? 'Close' : 'Close · E'}</button></div>`;
  document.body.appendChild(letter);

  const surprise = document.createElement('div');
  surprise.className = 'modal'; surprise.hidden = true;
  const S = config.surprise;
  surprise.innerHTML = `<div class="surprise-card"><div class="hearts-burst"></div><h2>${S.title}</h2><p>${S.text}</p><p class="ask">${S.question}</p>
    <div class="surprise-actions"><button class="yes">${S.yes}</button><button class="no">${S.no}</button></div></div>`;
  document.body.appendChild(surprise);

  const open = (which) => { modal = which; modalSince = performance.now(); controls.releaseLock(); };
  const closeModal = () => { modal = null; letter.hidden = true; surprise.hidden = true; interactions.swallowE = true; controls.requestLock(); };

  /** show a letter: { kicker, title?, text (or paragraphs[]), sign? } */
  function readLetter({ kicker = '', title = '', text = '', paragraphs = null, sign = '' }) {
    letter.querySelector('.paper-kicker').textContent = kicker;
    const t = letter.querySelector('.paper-title'); t.textContent = title; t.hidden = !title;
    letter.querySelector('.paper-text').textContent = paragraphs ? paragraphs.join('\n\n') : text;
    letter.querySelector('.paper-sign').textContent = sign;
    letter.hidden = false; open('letter'); chime([660, 990, 1320]);
  }

  function openNote(i) {
    const n = notes[i];
    readLetter({ kicker: `A note for you  ·  ${i + 1} of ${notes.length}`, text: n.text, sign: `- ${config.signature}` });
    const wasDone = foundNotes.length >= notes.length;
    if (!foundNotes.includes(i)) { foundNotes.push(i); store.set('notes', foundNotes); }
    refreshHud(chipN);
    if (!wasDone && foundNotes.length >= notes.length) setTimeout(() => showToast('That was the last note. A sealed letter is waiting at the end of the red carpet.', 8000), 600);
    const next = notes[i + 1];
    if (next) setTimeout(() => showToast(`Next note: ${clueFor(i + 1)}`, 6500), 600);
  }
  letter.querySelector('.paper-close').addEventListener('click', closeModal);

  function openSurprise() {
    surprise.hidden = false; open('surprise');
    const no = surprise.querySelector('.no'), yes = surprise.querySelector('.yes');
    const dodge = () => { no.style.transform = `translate(${(Math.random() - 0.5) * 240}px, ${(Math.random() - 0.5) * 90}px)`; };
    no.onmouseenter = dodge; no.onclick = dodge; no.ontouchstart = e => { e.preventDefault(); dodge(); };
    yes.onclick = () => {
      store.set('hunt-done', true); done = true;
      const burst = surprise.querySelector('.hearts-burst');
      for (let i = 0; i < 28; i++) {
        const h = document.createElement('i');
        h.textContent = Math.random() < 0.5 ? '\u{1F497}' : '❤️';
        h.style.cssText = `left:${Math.random() * 100}%;font-size:${18 + Math.random() * 30}px;animation-delay:${Math.random() * 1.2}s`;
        burst.appendChild(h);
      }
      chime([523, 659, 784, 1046]);
      onYes?.();
      yes.textContent = 'Forever';
      yes.onclick = closeModal;
      no.style.display = 'none';
    };
  }

  window.addEventListener('keydown', e => {
    if (e.target?.closest?.('input,textarea')) return;
    if (modal === 'letter' && !e.repeat && performance.now() - modalSince > 500 && (e.code === 'KeyE' || e.code === 'Escape')) closeModal();
    if (e.code === 'KeyN' && !modal) {
      const next = notes[foundNotes.length];
      showToast(next ? `Next note: ${clueFor(foundNotes.length)}` : 'You found every note.', 5000);
    }
    if (e.code === 'KeyG' && !modal) requestGuide?.();
  });

  /* ── 3D objects ── */
  const noteItems = NOTE_SPOTS.map((p, i) => {
    const grp = new THREE.Group();
    const env = makeEnvelope(); env.position.y = 0.85;
    const glow = makeGlow(0.9); glow.position.y = 0.88;
    grp.add(env, glow); grp.position.set(p.x, 0, p.z);
    scene.add(grp);
    const item = { grp, env, glow, i, pos: new THREE.Vector3(p.x, 0.85, p.z) };
    interactions.extras.push({
      pos: item.pos, radius: 1.7, prompt: 'Read the note <kbd>E</kbd>',
      visible: () => !modal && i === foundNotes.length,
      onUse: () => openNote(i),
    });
    return item;
  });

  /* ── the sealed letter at the end of the red carpet: it opens once every love note is found ── */
  const FL = config.finalLetter;
  const end = LAYOUT.carpet.discs[1];
  const finalGrp = new THREE.Group(); finalGrp.position.set(end.x, 0, end.z); scene.add(finalGrp);
  const stone = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.35, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xeceae5, roughness: 0.35, metalness: 0.1 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.95, 36), stone); plinth.position.y = 0.475; plinth.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 36), gold); cap.position.y = 0.98;
  const finalEnv = makeEnvelope(); finalEnv.position.y = 1.17; finalEnv.scale.setScalar(1.25);
  const finalGlow = makeGlow(1.5); finalGlow.position.y = 1.2;
  finalGrp.add(plinth, cap, finalEnv, finalGlow);
  addObstacleCircle({ x: end.x, z: end.z, r: 0.6 });
  const unlocked = () => foundNotes.length >= notes.length;
  let finalOpened = store.get('final-opened', false);
  interactions.extras.push({
    pos: new THREE.Vector3(end.x, 1.0, end.z), radius: 1.9,
    get prompt() { return unlocked() ? (finalOpened ? 'Read the letter again <kbd>E</kbd>' : 'Open the sealed letter <kbd>E</kbd>') : `A sealed letter: find every love note first (${foundNotes.length}/${notes.length})`; },
    visible: () => !modal,
    onUse: () => {
      if (!unlocked()) { showToast(`The seal will not open yet. ${foundNotes.length} of ${notes.length} love notes found. Press N for a clue.`, 5000); return; }
      finalOpened = true; store.set('final-opened', true);
      readLetter({ kicker: FL.kicker, paragraphs: FL.paragraphs, sign: `${FL.sign}, ${config.signature}` });
      chime([523, 659, 784, 1046]);
    },
  });

  const heartMat = new THREE.MeshStandardMaterial({ color: 0xe0566e, roughness: 0.3, metalness: 0.2, emissive: 0x5a1020, emissiveIntensity: 0.9 });
  const heartItems = HEART_SPOTS.map((p, i) => {
    const grp = new THREE.Group();
    const h = new THREE.Mesh(heartGeometry(0.3), heartMat); h.position.y = 0.55;
    const glow = makeGlow(0.9); glow.position.y = 0.55;
    grp.add(h, glow); grp.position.set(p.x, 0, p.z);
    scene.add(grp);
    const item = { grp, h, glow, i, pos: new THREE.Vector3(p.x, 0.55, p.z) };
    interactions.extras.push({
      pos: item.pos, radius: 1.5, prompt: 'Catch the heart <kbd>E</kbd>',
      visible: () => !modal && !foundHearts.includes(i),
      onUse: () => {
        foundHearts.push(i); store.set('hearts', foundHearts); refreshHud(chipH);
        chime(); showToast(`A hidden heart! ${foundHearts.length} of ${HEART_SPOTS.length}`, 3500);
        if (foundHearts.length >= HEART_SPOTS.length && !done) setTimeout(openSurprise, 1400);
      },
    });
    return item;
  });

  function nextHeartSpot(from) {
    let best = null, bd = Infinity;
    HEART_SPOTS.forEach((p, i) => {
      if (foundHearts.includes(i)) return;
      const d = from ? Math.hypot(p.x - from.x, p.z - from.z) : 0;
      if (d < bd || !best) { bd = d; best = p; }
    });
    return best;
  }

  setTimeout(() => {
    if (!store.get('intro-seen', false)) {
      store.set('intro-seen', true);
      showToast('Psst... eight little hearts are hidden around the gallery. Ask the dog for a hint with G.', 8000);
      setTimeout(() => showToast(clueFor(foundNotes.length), 6500), 8500);
    }
  }, 4000);

  refreshHud();

  return {
    get modalOpen() { return modal !== null; },
    nextHeartSpot,
    readLetter,
    update(dt, t) {
      // the sealed letter: dull and quiet until it can be opened, then glowing gold
      const on = unlocked();
      finalEnv.position.y = 1.17 + Math.sin(t * 1.5) * (on ? 0.04 : 0.01);
      finalEnv.rotation.y += dt * (on ? 0.7 : 0.15);
      finalGlow.material.opacity = on ? 0.65 + Math.sin(t * 2.4) * 0.3 : 0.12;
      finalGlow.material.color.set(on ? 0xffd88a : 0xaab0c0);
      for (const n of noteItems) {
        const show = n.i === foundNotes.length && !modal;
        n.grp.visible = n.i === foundNotes.length;
        if (!n.grp.visible) continue;
        n.env.position.y = 0.85 + Math.sin(t * 1.6 + n.i) * 0.05;
        n.env.rotation.y += dt * 0.8;
        n.glow.material.opacity = (show ? 0.7 : 0.4) + Math.sin(t * 2.2) * 0.25;
      }
      for (const h of heartItems) {
        h.grp.visible = !foundHearts.includes(h.i);
        if (!h.grp.visible) continue;
        h.h.position.y = 0.55 + Math.sin(t * 1.8 + h.i * 2) * 0.06;
        h.h.rotation.y += dt * 1.1;
        const s = 1 + Math.sin(t * 3.4 + h.i) * 0.07;
        h.h.scale.setScalar(s);
        h.glow.material.opacity = 0.55 + Math.sin(t * 2.6 + h.i) * 0.3;
      }
    },
  };
}
