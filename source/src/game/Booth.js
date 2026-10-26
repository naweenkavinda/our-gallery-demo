import * as THREE from 'three';
import { addObstacleBox, LAYOUT } from './Gallery.js';
import { pbr } from './Materials.js';
import { sound } from './Sound.js';
import { createBoothEditor } from './BoothEditor.js';
import { OUT_W, OUT_H } from './BoothStickers.js';      // saved picture (3:4)

/**
 * A photo booth for two. Press E in front of it; your partner presses E too (a bubble shows
 * who is asking) and you both step in. Count down 3-2-1, strike a pose, flash: a full-length,
 * zoomed-in picture of the two of you is dressed up with a frame and stickers, then lands on the
 * "New Memories" wall (kept by the relay, or in this browser when offline). The frame and stickers
 * are baked into the saved image, so your partner sees the same strip. On your own it takes a picture of just you.
 */

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('og-' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('og-' + k, JSON.stringify(v)); } catch { /* storage full or private mode */ } },
};

const POSES = ['wave', 'blowKiss', 'dance2', 'dance1'];
const ASK_WAIT = 12;                  // seconds to wait for the other person before going solo
const T = { walk: 1.4, three: 1.6, pose: 2.6, flash: 4.6, end: 5.5 };   // the sequence timeline (seconds)
const wrapPi = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export function createBooth({ scene, interactions, tpCamera, controls, getNet, getLocal, getRemotes, showToast, myName, playLocal, social, bubbles, fx }) {
  const room = LAYOUT.byId.celebrations;
  const wallX = room.x2 - 0.15;                    // inner face of the east wall
  const cz = (room.z1 + room.z2) / 2;
  const wood = new THREE.MeshPhysicalMaterial({ ...pbr('oak_veneer_01', 1, 1, 0.8), color: 0x7a5233, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.5, metalness: 0.4 });
  void dark;
  const velvet = new THREE.MeshStandardMaterial({ ...pbr('velour_velvet', 3, 5, 0.6), color: 0xa02a40, roughness: 1, side: THREE.DoubleSide });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };

  const depth = 2.0, half = 1.45;                   // interior depth (x) and half-width (z)
  const front = wallX - depth;
  const subjectX = wallX - 1.0;                     // where you stand
  add(new THREE.BoxGeometry(depth + 0.2, 3.1, 0.12), wood, wallX - depth / 2, 1.55, cz - half - 0.06);
  add(new THREE.BoxGeometry(depth + 0.2, 3.1, 0.12), wood, wallX - depth / 2, 1.55, cz + half + 0.06);
  add(new THREE.BoxGeometry(depth + 0.25, 0.14, half * 2 + 0.5), wood, wallX - depth / 2, 3.17, cz);

  // backdrop: blush and cream stripes, like an old photo booth curtain
  const bd = document.createElement('canvas'); bd.width = 256; bd.height = 64;
  { const g = bd.getContext('2d'); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f6e4de' : '#efc9c6'; g.fillRect(i * 16, 0, 16, 64); } }
  const bdTex = new THREE.CanvasTexture(bd); bdTex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.BoxGeometry(0.04, 3.0, half * 2), new THREE.MeshStandardMaterial({ map: bdTex, roughness: 0.9 }), wallX - 0.03, 1.5, cz);
  add(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 24), velvet, wallX - 0.35, 0.25, cz + 1.2);   // a stool in the corner, out of the shot
  add(new THREE.BoxGeometry(0.03, 0.22, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }), front + 0.2, 2.7, cz);
  // soft warm light on the two of you
  const key = new THREE.PointLight(0xfff1de, 3.5, 7, 1.4);
  key.position.set(subjectX - 1.3, 2.5, cz);
  scene.add(key);
  // half-drawn curtain on the north side of the opening
  const curtain = add(new THREE.PlaneGeometry(1.1, 2.9), velvet, front - 0.02, 1.5, cz - half + 0.55);
  curtain.rotation.y = Math.PI / 2;
  // sign
  const sign = document.createElement('canvas'); sign.width = 512; sign.height = 128;
  { const g = sign.getContext('2d'); g.fillStyle = '#1b1b1e'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#ffe2a8'; g.font = '600 66px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.fillText('PHOTO BOOTH', 256, 84); }
  const signTex = new THREE.CanvasTexture(sign); signTex.colorSpace = THREE.SRGBColorSpace;
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.58), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
  signMesh.rotation.y = -Math.PI / 2; signMesh.position.set(front - 0.1, 3.5, cz); scene.add(signMesh);
  addObstacleBox({ x: wallX - depth / 2, z: cz - half - 0.06, hx: depth / 2 + 0.2, hz: 0.25 });
  addObstacleBox({ x: wallX - depth / 2, z: cz + half + 0.06, hx: depth / 2 + 0.2, hz: 0.25 });

  /* ── the New Memories wall (south wall of the room) ── */
  const wallZ = room.z2 - 0.15 - 0.03;
  const cols = [-2.6, 0, 2.6].map(d => 18 + d), rows = [1.75, 3.15];
  const slots = [];
  const fmtDate = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  for (const y of rows) for (const x of cols) {
    const g = new THREE.Group();
    g.position.set(x, y, wallZ); g.rotation.y = Math.PI; g.rotation.z = (Math.random() - 0.5) * 0.06;
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.34, 0.03), new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.8 }));
    const img = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.173), new THREE.MeshBasicMaterial({ color: 0xe9e2d6, toneMapped: false }));
    img.position.set(0, 0.025, 0.02);
    const capCanvas = document.createElement('canvas'); capCanvas.width = 440; capCanvas.height = 56;
    const capTex = new THREE.CanvasTexture(capCanvas); capTex.colorSpace = THREE.SRGBColorSpace;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.112), new THREE.MeshBasicMaterial({ map: capTex, transparent: true, toneMapped: false }));
    cap.position.set(0, -0.6, 0.02);
    g.add(card, img, cap); scene.add(g);
    slots.push({ img, capCanvas, capTex });
  }
  const title = document.createElement('canvas'); title.width = 800; title.height = 140;
  { const g = title.getContext('2d'); g.fillStyle = '#7a6a58'; g.font = '500 70px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.fillText('N E W   M E M O R I E S', 400, 90); }
  const titleTex = new THREE.CanvasTexture(title); titleTex.colorSpace = THREE.SRGBColorSpace;
  const titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.74), new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, toneMapped: false }));
  titleMesh.rotation.y = Math.PI; titleMesh.position.set(18, 4.15, wallZ); scene.add(titleMesh);

  function caption(s, text) {
    const g = s.capCanvas.getContext('2d');
    g.clearRect(0, 0, 440, 56);
    if (text) {
      g.fillStyle = '#5a4636'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '600 38px Caveat, "Cormorant Garamond", cursive';
      g.fillText(text, 220, 30);
    }
    s.capTex.needsUpdate = true;
  }

  let records = [];
  const loader = new THREE.TextureLoader();
  const roomKey = () => 'booth-' + (new URLSearchParams(location.search).get('room') || 'our');
  function refreshWall() {
    const latest = records.slice(-slots.length).reverse();
    slots.forEach((s, i) => {
      const r = latest[i];
      if (!r) { s.img.material.map = null; s.img.material.color.set(0xe9e2d6); s.img.material.needsUpdate = true; s.shown = null; caption(s, ''); return; }
      if (s.shown === r.id) return;
      s.shown = r.id;
      caption(s, `${r.who} · ${fmtDate(r.ts)}`);
      loader.load(r.img, tex => { tex.colorSpace = THREE.SRGBColorSpace; s.img.material.map = tex; s.img.material.color.set(0xffffff); s.img.material.needsUpdate = true; });
    });
  }
  function addRecord(rec) {
    if (records.some(r => r.id === rec.id)) return false;
    records.push(rec);
    if (records.length > 12) records.shift();
    if (!getNet()?.connected) { try { store.set(roomKey(), records); } catch { /* ignore */ } }
    refreshWall();
    return true;
  }

  /** the picture drops out of the booth in front of you */
  function showPolaroid(rec) {
    const el = document.createElement('div'); el.className = 'polaroid';
    const im = document.createElement('img'); im.src = rec.img; im.alt = '';
    const sp = document.createElement('span'); sp.textContent = `${rec.who} · ${fmtDate(rec.ts)}`;
    el.append(im, sp); document.body.appendChild(el);
    setTimeout(() => sound.whoosh(), 150);
    setTimeout(() => el.remove(), 5400);
  }

  const n0 = getNet();
  records = n0?.connected ? [...(n0.data?.booth || [])] : store.get(roomKey(), []);
  refreshWall();
  n0?.on?.('booth', m => {
    const fresh = addRecord(m.rec);
    if (fresh && Date.now() - m.rec.ts < 20000) showPolaroid(m.rec);
  });

  /* ── asking, then the picture ── */
  const count = document.createElement('div'); count.className = 'booth-count'; count.hidden = true; document.body.appendChild(count);
  let seq = null;                                 // the running photo sequence
  const ask = { mine: false, theirs: false, t: 0 };
  let capture = false, captureSolo = true;
  const net = () => getNet();
  const partnerPresent = () => { const n = net(); return !!(n?.connected && n.peerIds.size); };
  const partnerId = () => { const n = net(); return n ? [...n.peerIds][0] : null; };

  const editor = createBoothEditor({ showToast });
  const boothCam = new THREE.PerspectiveCamera(38, OUT_W / OUT_H, 0.1, 60);
  boothCam.position.set(subjectX - 3.1, 1.0, cz);
  boothCam.lookAt(subjectX, 0.93, cz);
  boothCam.updateMatrixWorld(true);

  const setAsk = v => { if (ask.mine === v) return; ask.mine = v; ask.t = performance.now() / 1000; net()?.send({ t: 'booth-ask', on: v ? 1 : 0 }); };

  function begin({ pose, solo }) {
    const me = getLocal();
    if (!me || seq || editor.isOpen) return;
    if (me.sitting || interactions.viewerOpen) { ask.mine = false; ask.theirs = false; return; }       // busy with something else: never drag you in
    ask.mine = false; ask.theirs = false;
    social.release?.();
    const n = net();
    const slotZ = solo ? cz : (n.id < partnerId() ? cz - 0.42 : cz + 0.42);
    seq = { t: 0, pose, solo, slotZ, walking: false, posed: false, flashed: false, lastCount: 0, lead: solo || n.id < partnerId() };
    controls.releaseLock();
    playLocal('idle');
    curtain.visible = false;                      // keep the view into the booth clear
    // watch from in front of the booth
    tpCamera.setFocus(new THREE.Vector3(subjectX - 3.6, 1.45, cz + 0.2), new THREE.Vector3(subjectX, 1.0, cz));
  }

  function finish() {
    count.hidden = true;
    curtain.visible = true;
    playLocal('idle');
    tpCamera.rotX = Math.PI / 2 + Math.PI;
    tpCamera.setFocus(null);
    seq = null;
    setTimeout(() => { if (!editor.isOpen) controls.requestLock(); }, 400);     // the result screen needs the cursor
  }

  function takePicture() {
    const me = getLocal();
    if (!me || seq) return;
    if (!partnerPresent()) { begin({ pose: POSES[Math.floor(Math.random() * POSES.length)], solo: true }); return; }
    if (ask.theirs) {                              // they asked first: say yes
      const pose = POSES[Math.floor(Math.random() * POSES.length)];
      net().send({ t: 'booth-go', pose });
      begin({ pose, solo: false });
      return;
    }
    if (ask.mine) {                                // pressed again while waiting: just me
      setAsk(false);
      begin({ pose: POSES[Math.floor(Math.random() * POSES.length)], solo: true });
      return;
    }
    setAsk(true);
    showToast('Asking for a photo together... press E again to go in alone', 4500);
  }

  n0?.on?.('booth-ask', m => {
    ask.theirs = !!m.on;
    ask.t = performance.now() / 1000;
    if (m.on && !seq) showToast('Your partner wants a photo together: step up to the booth and press E', 5500);
  });
  n0?.on?.('booth-go', m => {
    if (seq) return;
    ask.mine = false; ask.theirs = false;
    begin({ pose: m.pose, solo: false });
  });

  interactions.extras.push({
    pos: new THREE.Vector3(front + 0.2, 1.0, cz), radius: 1.9,
    get prompt() { return ask.theirs ? 'Join the photo <kbd>E</kbd>' : ask.mine ? 'Waiting for them... go in alone <kbd>E</kbd>' : 'Take a photo together <kbd>E</kbd>'; },
    visible: () => !seq, onUse: takePicture,
  });

  return {
    get busy() { return seq !== null || editor.isOpen; },
    /** for testing the framing without running the whole sequence */
    forceCapture(solo = false) { capture = true; captureSolo = solo; },
    update(dt) {
      const me = getLocal(), now = performance.now() / 1000;
      const p = getRemotes()[0];

      // bubbles over whoever is asking
      bubbles.set('booth-me', me?.wrapper, ask.mine && !seq ? '📸 Photo together?' : null);
      bubbles.set('booth-them', p?.wrapper, ask.theirs && !seq ? '📸 Photo together?' : null);
      if (ask.mine && !seq && now - ask.t > ASK_WAIT) {
        setAsk(false);
        const away = me ? Math.hypot(me.wrapper.position.x - front, me.wrapper.position.z - cz) > 6 : true;
        if (away) showToast('The photo request has timed out', 2500);            // you wandered off: do not drag you back
        else { showToast('No answer yet, so it is just you', 3000); begin({ pose: POSES[Math.floor(Math.random() * POSES.length)], solo: true }); }
      }
      if (ask.theirs && !p) ask.theirs = false;
      if (ask.theirs && now - ask.t > 45) ask.theirs = false;

      if (!seq || !me) return;
      seq.t += dt;
      const w = me.wrapper, t = seq.t;

      // 1. step into the booth and face the camera
      if (t < T.walk) {
        const k = 1 - Math.exp(-6 * dt);
        const tx = subjectX, tz = seq.slotZ;
        const dist = Math.hypot(tx - w.position.x, tz - w.position.z);
        w.position.x += (tx - w.position.x) * k; w.position.z += (tz - w.position.z) * k;
        w.rotation.y += wrapPi(-Math.PI / 2 - w.rotation.y) * k;
        if (dist > 0.15 && !seq.walking) { seq.walking = true; playLocal('walk'); }
        if (dist <= 0.15 && seq.walking) { seq.walking = false; playLocal('idle'); }
      } else {
        w.position.x = subjectX; w.position.z = seq.slotZ; w.rotation.y = -Math.PI / 2;
        if (seq.walking) { seq.walking = false; playLocal('idle'); }
      }

      // 2. 3 - 2 - 1
      const n = t >= T.three + 2 ? 1 : t >= T.three + 1 ? 2 : t >= T.three ? 3 : 0;
      if (n && n !== seq.lastCount) {
        seq.lastCount = n;
        count.innerHTML = `<span>${n}</span>`; count.hidden = false;
        sound.tick(n === 1);
        count.firstChild.style.animation = 'none'; void count.offsetWidth; count.firstChild.style.animation = '';
      }

      // 3. strike the pose (both of you, the same one)
      if (t >= T.pose && !seq.posed) { seq.posed = true; playLocal(seq.pose, true); }

      // 4. flash
      if (t >= T.flash && !seq.flashed) {
        seq.flashed = true;
        count.hidden = true;
        sound.shutter();
        const flash = document.createElement('div'); flash.className = 'flash'; document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 800);
        const partnerGone = !getRemotes()[0];                                 // the one who should take it left: do it ourselves
        if (seq.lead || partnerGone) { capture = true; captureSolo = seq.solo || partnerGone; }
        fx?.burst(subjectX, 1.0, cz, 16);
      }
      if (t >= T.end) finish();
    },
    /** call right after renderer.render: a second, fixed, zoomed-in render for the picture */
    afterRender(renderer, rScene) {
      if (!capture) return;
      capture = false;
      const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
      const cw = size.x, ch = size.y;
      const rh = cw >= ch * 0.75 ? ch : cw / 0.75, rw = rh * 0.75;
      const rx = (cw - rw) / 2, ry = (ch - rh) / 2;
      const vp = renderer.getViewport(new THREE.Vector4()), sc = renderer.getScissor(new THREE.Vector4()), st = renderer.getScissorTest();
      curtain.visible = false;
      renderer.setViewport(rx, ch - ry - rh, rw, rh); renderer.setScissor(rx, ch - ry - rh, rw, rh); renderer.setScissorTest(true);
      renderer.render(rScene, boothCam);
      const c = document.createElement('canvas'); c.width = OUT_W; c.height = OUT_H;
      c.getContext('2d').drawImage(renderer.domElement, rx * pr, ry * pr, rw * pr, rh * pr, 0, 0, OUT_W, OUT_H);
      curtain.visible = true;
      renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(st);

      // the result screen: pick a frame and stickers, then the finished strip goes to the wall
      const who = captureSolo ? myName() : 'Alex & Sam';
      controls.releaseLock();
      editor.open(c, Date.now(), strip => {
        let img = '';
        for (const q of [0.8, 0.65, 0.5, 0.4]) { img = strip.toDataURL('image/jpeg', q); if (img.length <= 115000) break; }
        const n = net();
        if (n?.connected) n.send({ t: 'booth-add', img, who });
        else { const rec = { id: 'l' + Date.now().toString(36), img, who, ts: Date.now() }; if (addRecord(rec)) showPolaroid(rec); }
        showToast('Saved to the New Memories wall', 3500);
        interactions.swallowE = true;
        controls.requestLock();
      });
    },
  };
}
