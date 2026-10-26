import * as THREE from 'three';
import { LAYOUT, addObstacleBox } from './Gallery.js';
import { sound } from './Sound.js';

/**
 * A mailbox in the lobby. Write a postcard to the other one and post it: it waits in the box and only
 * shows up when they next open the mailbox. A small light on the box tells you when there is
 * something for you. Postcards are kept by the relay, so they are still there next time.
 */

const STAMPS = ['\u{1F48C}', '\u{1F339}', '☕', '✨', '\u{1F319}'];

export function createMailbox({ scene, interactions, controls, getNet, getLocal, showToast, myName, role }) {
  const foyer = LAYOUT.byId.foyer;
  // against the east wall of the lobby, on a free spot
  let at = null;
  for (const z of [4.5, 6.5, 2.5, 8.5, 3.5]) { const x = foyer.x2 - 0.55; if (LAYOUT.canWalk(x - 0.5, z) && LAYOUT.canWalk(x - 1, z)) { at = { x, z }; break; } }
  at ||= { x: foyer.x2 - 0.55, z: 4.5 };

  /* ── a slim, modern post box ── */
  const body = new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: 0.4, metalness: 0.65 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.3, metalness: 0.85 });
  const grp = new THREE.Group(); grp.position.set(at.x, 0, at.z); grp.rotation.y = -Math.PI / 2; scene.add(grp);   // faces into the room
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
  part(new THREE.BoxGeometry(0.46, 1.2, 0.3), body, 0, 0.8, 0);                       // the box
  part(new THREE.BoxGeometry(0.5, 0.05, 0.34), steel, 0, 1.425, 0);                    // cap
  part(new THREE.BoxGeometry(0.34, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x050506 }), 0, 1.14, 0.152);     // the slot
  part(new THREE.BoxGeometry(0.3, 0.2, 0.01), steel, 0, 0.78, 0.155);                  // name plate
  part(new THREE.BoxGeometry(0.06, 0.2, 0.06), steel, 0.14, 0.1, 0.05); part(new THREE.BoxGeometry(0.06, 0.2, 0.06), steel, -0.14, 0.1, 0.05);
  const plate = document.createElement('canvas'); plate.width = 256; plate.height = 100;
  { const g = plate.getContext('2d'); g.fillStyle = '#cfd2d6'; g.fillRect(0, 0, 256, 100); g.fillStyle = '#1d1e22'; g.textAlign = 'center'; g.font = '600 46px Inter, sans-serif'; g.fillText('POST', 128, 48); g.font = '400 22px Inter, sans-serif'; g.fillText('for the two of us', 128, 82); }
  const pt = new THREE.CanvasTexture(plate); pt.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.11), new THREE.MeshBasicMaterial({ map: pt, toneMapped: false })); label.position.set(0, 0.78, 0.162); grp.add(label);
  addObstacleBox({ x: at.x, z: at.z, hx: 0.3, hz: 0.3 });

  // a soft light that glows when something is waiting for you
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5a74, toneMapped: false })); lamp.position.set(0, 1.5, 0); grp.add(lamp);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,120,150,0.9)'); gr.addColorStop(1, 'rgba(255,120,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9); halo.position.set(0, 1.5, 0); grp.add(halo);

  /* ── the postcards ── */
  let mail = [...(getNet()?.data?.mail || [])];
  const mine = role;                                             // 'boy' or 'girl'
  const partnerName = mine === 'boy' ? 'Sam' : 'Alex';
  const unread = () => mail.filter(m => m.to === mine && !m.read);
  const fmt = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let open = false;

  const panel = document.createElement('div');
  panel.className = 'modal mail-modal'; panel.hidden = true;
  panel.innerHTML = `<div class="mail-card">
      <h2>The mailbox</h2>
      <div class="mail-in"></div>
      <h3>Write to ${partnerName}</h3>
      <div class="mail-stamps"></div>
      <textarea maxlength="400" rows="4" placeholder="A few words for ${partnerName}. They will find it the next time they open the mailbox."></textarea>
      <div class="mail-row"><span class="mail-count">0 / 400</span><button class="mail-post">Post it</button></div>
      <div class="mail-out"></div>
      <button class="mail-close">${document.body.classList.contains('touch') ? 'Close' : 'Close · Esc'}</button>
    </div>`;
  document.body.appendChild(panel);
  const $ = s => panel.querySelector(s);
  const ta = $('textarea'); let stamp = STAMPS[0];
  STAMPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s; if (!i) b.classList.add('on'); b.addEventListener('click', () => { stamp = s; panel.querySelectorAll('.mail-stamps button').forEach(x => x.classList.toggle('on', x === b)); }); $('.mail-stamps').appendChild(b); });
  ta.addEventListener('input', () => { $('.mail-count').textContent = `${ta.value.length} / 400`; });

  function render() {
    const inEl = $('.mail-in'); inEl.innerHTML = '';
    const forMe = mail.filter(m => m.to === mine).sort((a, b) => b.ts - a.ts);
    const fresh = forMe.filter(m => !m.read), old = forMe.filter(m => m.read);
    if (!forMe.length) { const e = document.createElement('p'); e.className = 'mail-empty'; e.textContent = 'Nothing for you yet.'; inEl.appendChild(e); }
    for (const m of [...fresh, ...old]) {
      const c = document.createElement('div'); c.className = 'postcard' + (m.read ? ' read' : '');
      const head = document.createElement('b'); head.textContent = `${m.stamp || '\u{1F48C}'}  From ${m.fromName}  ·  ${fmt(m.ts)}`;
      const txt = document.createElement('span'); txt.textContent = m.text;
      c.append(head, txt);
      if (!m.read) { const k = document.createElement('button'); k.textContent = 'Keep it'; k.addEventListener('click', () => { getNet()?.send({ t: 'mail-read', id: m.id }); m.read = true; render(); }); c.appendChild(k); }
      inEl.appendChild(c);
    }
    const out = $('.mail-out'); out.innerHTML = '';
    const sent = mail.filter(m => m.from === mine).sort((a, b) => b.ts - a.ts).slice(0, 4);
    if (sent.length) { const h = document.createElement('h3'); h.textContent = 'Sent'; out.appendChild(h); }
    for (const m of sent) { const d = document.createElement('div'); d.className = 'sent'; d.textContent = `${m.stamp || ''} ${m.text.slice(0, 60)}${m.text.length > 60 ? '...' : ''}  —  ${m.read ? 'opened ' + fmt(m.readTs || m.ts) : 'waiting to be opened'}`; out.appendChild(d); }
  }

  const close = () => { if (!open) return; open = false; panel.hidden = true; interactions.swallowE = true; controls.requestLock(); };
  const show = () => {
    if (!getNet()?.connected) { showToast('Postcards need the connection to the relay, so they can reach each other', 4000); return; }
    open = true; panel.hidden = false; controls.releaseLock(); render(); sound.sparkle();
  };
  $('.mail-close').addEventListener('click', close);
  window.addEventListener('keydown', e => { if (open && e.code === 'Escape') close(); });
  $('.mail-post').addEventListener('click', () => {
    const text = ta.value.trim(); if (!text) return;
    if (!getNet()?.send({ t: 'mail-add', text, stamp })) {           // keep what you wrote if the connection is down
      showToast('The connection dropped, so the postcard was not sent. Your words are still here: try again in a moment.', 5000);
      return;
    }
    ta.value = ''; $('.mail-count').textContent = '0 / 400';
    showToast(`Posted. ${partnerName} will find it next time they open the mailbox.`, 4000);
    sound.whoosh();
  });

  const n = getNet();
  n?.on?.('mail', m => { mail.push(m.rec); if (open) render(); showToast('A postcard just arrived in the mailbox', 4500); sound.sparkle(); });
  n?.on?.('mail-sent', m => { if (!mail.some(x => x.id === m.rec.id)) mail.push(m.rec); if (open) render(); });
  n?.on?.('mail-read', m => { const r = mail.find(x => x.id === m.id); if (r) { r.read = true; r.readTs = m.readTs; if (open) render(); showToast(`${partnerName} opened your postcard`, 3500); } });
  setTimeout(() => { const k = unread().length; if (k) showToast(`You have ${k === 1 ? 'a postcard' : k + ' postcards'} in the mailbox in the lobby`, 6000); }, 5000);

  interactions.extras.push({
    pos: new THREE.Vector3(at.x, 1.0, at.z), radius: 1.7,
    get prompt() { const k = unread().length; return k ? `You have mail <kbd>E</kbd>` : 'Open the mailbox <kbd>E</kbd>'; },
    visible: () => !open, onUse: show,
  });

  let t = 0;
  return {
    get busy() { return open; },
    update(dt) {
      t += dt;
      const has = unread().length > 0;
      lamp.visible = has; halo.visible = has;
      if (has) { halo.material.opacity = 0.55 + Math.sin(t * 3) * 0.35; lamp.position.y = 1.5 + Math.sin(t * 2) * 0.03; }
    },
  };
}
