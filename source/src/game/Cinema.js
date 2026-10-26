import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import config from '../config/gallery.json';
import { LAYOUT, WALL_H, addObstacleBox } from './Gallery.js';
import { PHOTOS } from './Layout.js';
import { pbr } from './Materials.js';
import { sound } from './Sound.js';

/**
 * Movie night, just for two. Past the Memory Garden, a small modern cinema: a flush screen, a
 * starlit ceiling, warm wooden slats on the walls and a loveseat. Sit down (F), then press E to start
 * the film; both of you see the same thing. Put your videos in public/videos/ and list them under
 * "videos" in src/config/gallery.json. Until then the screen shows a slideshow of your photos.
 */

const W = 1280, H = 720;

export function createCinema({ scene, interactions, tpCamera, getNet, getLocal, showToast }) {
  const room = LAYOUT.byId.cinema;
  const hall = LAYOUT.byId.cinemaHall;
  const cz = (room.z1 + room.z2) / 2;
  const sofaX = room.x1 + 8.2;                         // the loveseat, about 10 m back from the screen
  const xs = room.x2 - 0.15;                         // inner face of the east wall (the screen wall)
  const north = room.z1 + 0.15, south = room.z2 - 0.15, west = room.x1 + 0.15;

  const matt = (color, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const glow = new THREE.MeshBasicMaterial({ color: 0xffeccc, toneMapped: false });

  /* ── floor, ceiling edge light, slat walls ── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.x2 - room.x1 - 0.3, room.z2 - room.z1 - 0.3),
    new THREE.MeshStandardMaterial({ ...pbr('velour_velvet', 10, 10, 0.4), color: 0x2a2c31, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((room.x1 + room.x2) / 2, 0.012, cz); floor.receiveShadow = true; scene.add(floor);
  // a thin warm line of light along the ceiling edge and the floor edge of both side walls
  for (const z of [north + 0.12, south - 0.12]) {
    add(new THREE.BoxGeometry(room.x2 - room.x1 - 1, 0.04, 0.05), glow, (room.x1 + room.x2) / 2, WALL_H - 0.12, z);
    add(new THREE.BoxGeometry(room.x2 - room.x1 - 1, 0.03, 0.04), glow, (room.x1 + room.x2) / 2, 0.14, z);
  }
  // oak slats over dark felt on the long walls
  const oak = new THREE.MeshStandardMaterial({ ...pbr('oak_veneer_01', 0.3, 2, 0.8), color: 0xb08a5e, roughness: 1 });
  const slatGeo = new THREE.BoxGeometry(0.06, 3.4, 0.07);
  const slatsX = []; for (let x = room.x1 + 1.2; x < room.x2 - 1.2; x += 0.14) slatsX.push(x);
  for (const [z, dir] of [[north, 1], [south, -1]]) {
    add(new THREE.BoxGeometry(room.x2 - room.x1 - 2, 3.4, 0.03), matt(0x1a1b1f, 1), (room.x1 + room.x2) / 2, 2.0, z + dir * 0.02);
    const inst = new THREE.InstancedMesh(slatGeo, oak, slatsX.length); const m4 = new THREE.Matrix4();
    slatsX.forEach((x, i) => inst.setMatrixAt(i, m4.makeTranslation(x, 2.0, z + dir * 0.07)));
    inst.castShadow = false; inst.receiveShadow = true; scene.add(inst);
  }

  let hallEffects = [];
  /* ── the entrance hall: short, wide and dim, with a few posters and a snack corner ── */
  {
    const hx1 = hall.x1 + 0.15, hx2 = hall.x2 - 0.15, hn = hall.z1 + 0.15, hs = hall.z2 - 0.15;
    const hf = new THREE.Mesh(new THREE.PlaneGeometry(hx2 - hx1, hs - hn), floor.material);
    hf.rotation.x = -Math.PI / 2; hf.position.set((hx1 + hx2) / 2, 0.012, (hn + hs) / 2); hf.receiveShadow = true; scene.add(hf);
    for (const x of [hx1 + 0.12, hx2 - 0.12]) add(new THREE.BoxGeometry(0.05, 0.04, hs - hn - 1), glow, x, WALL_H - 0.12, (hn + hs) / 2);
    const downlight = new THREE.MeshBasicMaterial({ color: 0xffe6c0, toneMapped: false });
    for (let z = -75; z <= -59; z += 4) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), downlight); d.rotation.x = Math.PI / 2; d.position.set(29, WALL_H - 0.02, z); scene.add(d); }

    // four "now showing" posters, on the west wall inside the cinema itself (the hall is narrow; this wall has room), in two pairs
    const postersAt = [[-67.4, -64.8], [-62.2, -59.6]];
    const frameMat = matt(0x0b0b0d, 0.5, 0.2);
    const picks = [2, 7, 14, 21].map(i => PHOTOS[Math.min(i, PHOTOS.length - 1)]);
    let pi = 0;
    for (const zs of postersAt) for (const z of zs) {
      add(new THREE.BoxGeometry(0.05, 1.46, 1.1), frameMat, west + 0.03, 2.1, z);
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400;
      const cg = cv.getContext('2d'); cg.fillStyle = '#1a1a1d'; cg.fillRect(0, 0, 300, 400);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const img = new Image(); img.src = `./photos/t/${picks[pi++ % picks.length].file}`;          // the small previews are plenty for a poster
      img.onload = () => {                              // fill the 3:4 poster with the middle of the photo
        const s = Math.max(300 / img.naturalWidth, 400 / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
        cg.drawImage(img, (300 - w) / 2, (400 - h) / 2, w, h); tex.needsUpdate = true;
      };
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      poster.rotation.y = Math.PI / 2; poster.position.set(west + 0.062, 2.1, z); scene.add(poster);
    }

    /* ── the snack corner, on the wall opposite the garden doorway ── */
    const face = new THREE.Vector3();                                    // both face west, into the hall
    const stripesTex = (a, b) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const sg = c.getContext('2d'); for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? a : b; sg.fillRect(i * 16, 0, 16, 64); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const lit = (w, h, draw) => {                                        // a glowing sign or panel painted on a canvas
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    const effects = [];                                                  // kernels that pop and cans that drop

    // popcorn stand: a counter, a glass popcorn machine, striped buckets and a glowing sign
    const stand = new THREE.Group(); stand.position.set(hx2 - 0.5, 0, -60.2); stand.rotation.y = -Math.PI / 2; scene.add(stand);   // local +z is the front
    const counterMat = matt(0x202226, 0.55, 0.3), topMat = new THREE.MeshStandardMaterial({ ...pbr('oak_veneer_01', 1.2, 0.3, 0.8), color: 0xb08a5e, roughness: 1 });
    add(new THREE.BoxGeometry(2.1, 1.0, 0.7), counterMat, 0, 0.5, 0, stand);
    add(new THREE.BoxGeometry(2.2, 0.06, 0.82), topMat, 0, 1.03, 0, stand);
    add(new THREE.BoxGeometry(2.0, 0.03, 0.02), glow, 0, 0.14, 0.36, stand);                      // light along the foot of the counter
    add(new THREE.BoxGeometry(0.76, 0.14, 0.62), matt(0x9d1f2b, 0.4, 0.2), -0.5, 1.13, 0, stand);    // the machine's red base
    const caseMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    add(new THREE.BoxGeometry(0.7, 0.95, 0.56), caseMat, -0.5, 1.7, 0, stand);                       // the glass case
    for (const [px, pz] of [[-0.85, -0.28], [-0.15, -0.28], [-0.85, 0.28], [-0.15, 0.28]]) add(new THREE.BoxGeometry(0.035, 0.97, 0.035), matt(0xd8dade, 0.25, 0.9), px, 1.7, pz, stand);
    add(new THREE.BoxGeometry(0.78, 0.1, 0.64), matt(0x9d1f2b, 0.4, 0.2), -0.5, 2.22, 0, stand);   // red top
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), matt(0xd8dade, 0.25, 0.9), -0.5, 2.32, 0, stand);
    const kernelMat = matt(0xf5e6b8, 0.95), kernelGeo = new THREE.IcosahedronGeometry(0.05, 0);
    const piled = new THREE.InstancedMesh(kernelGeo, kernelMat, 90); const km = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {                                                                     // the case is filled to about half way
      const h = Math.random(), x = -0.5 + (Math.random() - 0.5) * 0.58, z = (Math.random() - 0.5) * 0.46;
      km.makeTranslation(x, 1.3 + h * h * 0.5, z); piled.setMatrixAt(i, km);
    }
    stand.add(piled);
    const bucketMat = new THREE.MeshStandardMaterial({ map: stripesTex('#f4efe6', '#b3202f'), roughness: 0.8, side: THREE.DoubleSide });
    for (const [bx, bz] of [[0.35, 0.05], [0.62, -0.08], [0.9, 0.08]]) {
      add(new THREE.CylinderGeometry(0.115, 0.08, 0.26, 24, 1, true), bucketMat, bx, 1.19, bz, stand);
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), kernelMat); top.rotation.x = -Math.PI / 2; top.position.set(bx, 1.3, bz); stand.add(top);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({
      map: lit(600, 168, (g, w, h) => { g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 92px Inter, sans-serif'; if (g.letterSpacing !== undefined) g.letterSpacing = '10px'; g.shadowColor = 'rgba(255,170,90,1)'; g.shadowBlur = 26; g.fillStyle = '#ffe3b0'; g.fillText('POPCORN', w / 2, h / 2 + 4); }),
      toneMapped: false }));
    sign.position.set(0.1, 2.5, -0.33); stand.add(sign);
    addObstacleBox({ x: hx2 - 0.5, z: -60.2, hx: 0.5, hz: 1.18 });

    // drinks vending machine: a tall dark cabinet with a glowing front
    const vend = new THREE.Group(); vend.position.set(hx2 - 0.5, 0, -65.8); vend.rotation.y = -Math.PI / 2; scene.add(vend);
    add(new THREE.BoxGeometry(1.1, 2.05, 0.8), matt(0x17181b, 0.4, 0.55), 0, 1.025, 0, vend);
    const canColors = ['#d63a3a', '#2f7fd6', '#3aa66b', '#f0a431', '#8d56c9', '#e8e6df'];
    const frontTex = lit(512, 1024, (g, w, h) => {
      g.fillStyle = '#0f1013'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff5a5f'; g.fillRect(24, 24, w - 48, 92);                                          // header
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 54px Inter, sans-serif'; g.fillText('COLD DRINKS', w / 2, 72);
      g.fillStyle = '#f4f6fa'; g.fillRect(24, 136, 330, 600);                                           // the lit window
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {                                          // rows of cans
        const x = 44 + c * 78, y = 156 + r * 96;
        g.fillStyle = '#c8ccd2'; g.fillRect(x, y + 6, 58, 78);
        g.fillStyle = canColors[(r * 2 + c) % canColors.length]; g.fillRect(x + 2, y + 18, 54, 56);
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 8, y + 24, 8, 44);
      }
      g.fillStyle = '#1d1f24'; g.fillRect(374, 136, 114, 600);                                           // keypad column
      for (let r = 0; r < 6; r++) { g.fillStyle = '#394050'; g.fillRect(388, 156 + r * 70, 86, 48); g.fillStyle = '#fff'; g.font = '600 26px Inter, sans-serif'; g.fillText('A' + (r + 1), 431, 181 + r * 70); }
      g.fillStyle = '#ffd36b'; g.fillRect(388, 590, 86, 8);                                              // coin slot
      g.fillStyle = '#050506'; g.fillRect(24, 770, 464, 40);
      g.fillStyle = '#26282e'; g.fillRect(104, 830, 304, 150);                                           // the drop tray
      g.fillStyle = '#050506'; g.fillRect(116, 842, 280, 126);
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.96), new THREE.MeshBasicMaterial({ map: frontTex, toneMapped: false }));
    front.position.set(0, 1.025, 0.402); vend.add(front);
    addObstacleBox({ x: hx2 - 0.5, z: -65.8, hx: 0.5, hz: 0.62 });

    const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14);
    const world = (grp, x, y, z) => { grp.updateMatrixWorld(true); return grp.localToWorld(face.set(x, y, z)).clone(); };
    interactions.extras.push({
      pos: world(stand, 0.2, 1.1, 0.8), radius: 1.7, prompt: 'Grab some popcorn <kbd>E</kbd>',
      visible: () => true,
      onUse: () => {
        sound.popcorn(); showToast('Fresh, warm and buttery. Enjoy the film.', 3500);
        for (let i = 0; i < 16; i++) {                                                                   // a few kernels pop out of the machine
          const k = new THREE.Mesh(kernelGeo, kernelMat); const p = world(stand, -0.5 + (Math.random() - 0.5) * 0.4, 2.0, (Math.random() - 0.5) * 0.3);
          k.position.copy(p); scene.add(k);
          effects.push({ m: k, vx: -0.5 - Math.random() * 1.1, vy: 1.6 + Math.random() * 1.8, vz: (Math.random() - 0.5) * 1.4, life: 1.6, floor: 0.04, spin: Math.random() * 8 });
        }
      },
    });
    interactions.extras.push({
      pos: world(vend, 0, 1.0, 0.85), radius: 1.6, prompt: 'Buy a cold drink <kbd>E</kbd>',
      visible: () => true,
      onUse: () => {
        sound.thunk(); showToast('Clunk. A cold drink drops into the tray.', 3200);
        const can = new THREE.Mesh(canGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(canColors[Math.floor(Math.random() * canColors.length)]), roughness: 0.3, metalness: 0.8 }));
        can.position.copy(world(vend, 0.0, 0.7, 0.5)); scene.add(can);                  // out of the slot, down into the tray
        effects.push({ m: can, vx: 0, vy: 0, vz: 0, life: 8, floor: 0.32, can: true, delay: 0.35 });
      },
    });
    hallEffects = effects;
  }

  /* ── the screen ── */
  const sw = 9.0, sh = sw * 9 / 16, sy = 3.05;
  const bezel = add(new THREE.BoxGeometry(0.06, sh + 0.16, sw + 0.16), matt(0x0c0c0e, 0.5), xs - 0.04, sy, cz);
  void bezel;
  const bias = new THREE.Mesh(new THREE.PlaneGeometry(sw + 1.4, sh + 1.0), new THREE.MeshBasicMaterial({ color: 0xffe8c8, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }));
  bias.rotation.y = -Math.PI / 2; bias.position.set(xs - 0.02, sy, cz); scene.add(bias);

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const slideTex = new THREE.CanvasTexture(canvas); slideTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: slideTex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
  screen.rotation.y = -Math.PI / 2; screen.position.set(xs - 0.075, sy, cz); scene.add(screen);

  // the placeholder: a slow slideshow of your photos, with a subtitle saying what it is.
  // Every slide is painted once into its own canvas; after that the screen only changes during the one-second
  // crossfade, so the picture costs almost nothing (it used to be repainted and re-uploaded 12 times a second).
  let slides = null;                                                // only fetched once someone is actually near the cinema
  const ensureSlides = () => (slides ||= PHOTOS.slice(0, 14).map(p => { const im = new Image(); im.decoding = 'async'; im.src = `./photos/${p.file}`; return im; }));
  const slideCache = new Array(14).fill(null);
  function slideCanvas(i) {
    if (slideCache[i]) return slideCache[i];
    const img = ensureSlides()[i];
    if (!img?.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const cg = c.getContext('2d'), ar = img.naturalWidth / img.naturalHeight;
    cg.fillStyle = '#08080b'; cg.fillRect(0, 0, W, H);
    cg.globalAlpha = 0.45; const bw = Math.max(W, H * ar) * 1.1, bh = bw / ar; cg.drawImage(img, (W - bw) / 2, (H - bh) / 2, bw, bh);     // soft, dark backdrop
    cg.globalAlpha = 1; let dh = H * 0.94, dw = dh * ar; if (dw > W * 0.9) { dw = W * 0.9; dh = dw / ar; }
    cg.drawImage(img, (W - dw) / 2, (H - dh) / 2 - 8, dw, dh);
    cg.fillStyle = 'rgba(0,0,0,0.55)'; cg.fillRect(0, H - 120, W, 120);
    cg.textAlign = 'center'; cg.fillStyle = '#f3efe8'; cg.font = '500 34px Inter, sans-serif';
    cg.fillText('Movie night  \u00B7  our videos will play here', W / 2, H - 62);
    cg.fillStyle = '#a49c90'; cg.font = '400 22px Inter, sans-serif';
    cg.fillText('Placeholder: add your videos to public/videos and list them in gallery.json', W / 2, H - 28);
    return (slideCache[i] = c);
  }
  let shownSlide = -2;                                              // which slide is on the screen now (-1: mid-crossfade)
  function drawPlaceholder(t) {
    const n = ensureSlides().length, i = Math.floor(t / 6) % n, f = t % 6;
    const a = slideCanvas(i);
    if (!a) return;
    if (f > 1 && f < 3) slideCanvas((i + 1) % n);                     // get the next one ready ahead of time, not during the fade
    if (f < 5) {
      if (shownSlide === i) return;                                  // already showing it: nothing to paint or upload
      g.globalAlpha = 1; g.drawImage(a, 0, 0); shownSlide = i;
    } else {
      const b = slideCanvas((i + 1) % n) || a;
      g.globalAlpha = 1; g.drawImage(a, 0, 0); g.globalAlpha = f - 5; g.drawImage(b, 0, 0); g.globalAlpha = 1; shownSlide = -1;
    }
    slideTex.needsUpdate = true;
  }
  /* ── the loveseat (faces the screen, +x) ── */
  const sofa = new THREE.Group(); sofa.position.set(sofaX, 0, cz); sofa.rotation.y = Math.PI / 2; scene.add(sofa);   // local +z = front
  const fabric = new THREE.MeshStandardMaterial({ ...pbr('velour_velvet', 2, 2, 0.5), color: 0x3b3e47, map: null, roughness: 1 });
  const accent = new THREE.MeshStandardMaterial({ ...pbr('velour_velvet', 1, 1, 0.5), color: 0x9b1b2e, map: null, roughness: 1 });
  const rb = (w, h, d, r, mat, x, y, z) => { const m = add(new RoundedBoxGeometry(w, h, d, 4, r), mat, x, y, z, sofa); return m; };
  rb(2.0, 0.26, 0.7, 0.05, matt(0x16171a, 0.6, 0.3), 0, 0.13, -0.05);                     // plinth, set back so shins hang clear of it
  for (const sx of [-0.46, 0.46]) rb(0.9, 0.17, 0.78, 0.07, fabric, sx, 0.345, 0.06);   // seat cushions (top at 0.43)
  rb(1.98, 0.56, 0.24, 0.09, fabric, 0, 0.62, -0.38).rotation.x = -0.1;                 // back
  for (const sx of [-1, 1]) rb(0.16, 0.5, 0.96, 0.06, fabric, sx * 0.98, 0.5, 0);       // arms
  for (const sx of [-0.62, 0.62]) { const p = rb(0.4, 0.4, 0.14, 0.07, accent, sx, 0.68, -0.18); p.rotation.set(-0.25, sx * 0.3, 0); }   // two cushions in the carpet red
  addObstacleBox({ x: sofaX, z: cz, hx: 0.55, hz: 1.05 });
  const seat = {
    group: { position: new THREE.Vector3(sofaX, 0, cz) }, spot: { ry: Math.PI / 2, face: Math.PI / 2 },
    spacing: 0.3, forward: 0.1, label: 'Take a seat', sofa: true,      // close enough to touch shoulders; a little forward so the knees clear the front
    onE: () => toggle(),                             // E while seated starts or pauses the film
  };
  interactions.benches.push(seat);

  // little round side tables with popcorn and drinks
  const steel = matt(0x1c1d20, 0.35, 0.8);
  for (const [dz, popcorn] of [[-1.75, true], [1.75, false]]) {
    const tx = sofaX - 0.4, tz = cz + dz;
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 36), steel, tx, 0.56, tz);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 10), steel, tx, 0.28, tz);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24), steel, tx, 0.01, tz);
    addObstacleBox({ x: tx, z: tz, hx: 0.3, hz: 0.3 });
    if (popcorn) {
      const stripes = document.createElement('canvas'); stripes.width = 128; stripes.height = 64;
      const sg = stripes.getContext('2d'); for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#f4efe6' : '#b3202f'; sg.fillRect(i * 16, 0, 16, 64); }
      const st = new THREE.CanvasTexture(stripes); st.colorSpace = THREE.SRGBColorSpace;
      add(new THREE.CylinderGeometry(0.13, 0.095, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8, side: THREE.DoubleSide }), tx, 0.67, tz);
      const kernels = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), matt(0xf3e3b5, 0.9), 34); const m4 = new THREE.Matrix4();
      for (let i = 0; i < 34; i++) { const a = Math.random() * 6.28, r = Math.random() * 0.1; kernels.setMatrixAt(i, m4.makeTranslation(tx + Math.cos(a) * r, 0.79 + Math.random() * 0.06, tz + Math.sin(a) * r)); }
      scene.add(kernels);
    } else {
      for (const ox of [-0.07, 0.08]) add(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 16), matt(0xe8f0f4, 0.2, 0.0), tx + ox, 0.635, tz + (ox > 0 ? 0.06 : -0.04));
    }
  }

  // projector and its beam
  const px = sofaX - 5, py = WALL_H - 0.9;
  const proj = new THREE.Group(); proj.position.set(px, py, cz); scene.add(proj);
  add(new THREE.BoxGeometry(0.55, 0.2, 0.4), matt(0x111114, 0.4, 0.5), 0, 0, 0, proj);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 20).rotateZ(Math.PI / 2), matt(0x050506, 0.2, 0.8), 0.3, 0, 0, proj);
  add(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 6), steel, 0, 0.55, 0, proj);
  // the beam: a faint cone from the lens to the screen, tilted to land on the middle of it
  const lens = new THREE.Vector3(px + 0.3, py, cz), target = new THREE.Vector3(xs - 0.1, sy, cz);
  const dir = target.clone().sub(lens), beamLen = dir.length(); dir.normalize();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xdce6ff, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, beamLen, 36, 1, true), beamMat);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());   // the cone's point is at the projector
  beam.scale.set(sh / 2, 1, sw / 2);
  beam.position.copy(lens).add(target).multiplyScalar(0.5);
  scene.add(beam);
  // neon-style sign on both sides of the doorway
  const sign = (text, x, z, rotY) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const sg = c.getContext('2d');
    sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.font = '300 84px Inter, sans-serif';
    if (sg.letterSpacing !== undefined) sg.letterSpacing = '18px';
    sg.shadowColor = 'rgba(255,170,120,0.9)'; sg.shadowBlur = 26; sg.fillStyle = '#fff2e4'; sg.fillText(text, 512, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.53), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.y = rotY; m.position.set(x, 4.1, z); scene.add(m);
  };
  sign('MOVIE NIGHT', hall.x1 - 0.17, -66, -Math.PI / 2);       // facing the garden, over the doorway
  sign('THIS WAY', room.x1 - 0.17, -73.5, -Math.PI / 2);        // in the hall, over the door into the cinema

  /* ── what is on the screen ── */
  const video = document.createElement('video');
  video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  let list = [], idx = 0, playing = false, ready = false, videoTex = null, started = false;
  const videosCfg = Array.isArray(config.videos) ? config.videos : [];

  Promise.all(videosCfg.map(v => fetch(v.file, { method: 'HEAD' }).then(r => r.ok && /^video\//.test(r.headers.get('content-type') || '')).catch(() => false)))
    .then(ok => { list = videosCfg.filter((_, i) => ok[i]); ready = true; });

  function load(i) {
    idx = ((i % list.length) + list.length) % list.length;
    video.src = list[idx].file; video.load();
    if (!videoTex) { videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace; }
    screenMat.map = videoTex; screenMat.needsUpdate = true;
  }
  video.addEventListener('ended', () => {
    if (idx + 1 < list.length) { load(idx + 1); video.play().catch(() => {}); send(true); }
    else { playing = false; screenMat.map = slideTex; screenMat.needsUpdate = true; setWatching(false); }
  });

  const net = () => getNet();
  const send = on => net()?.send({ t: 'cinema', on: on ? 1 : 0, i: idx, at: video.currentTime || 0 });

  function setPlaying(on, { remote = false, at = null, i = null } = {}) {
    if (!list.length) {
      // no videos yet: the slideshow just stays on, and we say so
      if (!remote) showToast('The screen is a placeholder for now: your videos will play here once they are added', 5000);
      return;
    }
    if (on) {
      if (i != null && i !== idx || !started) load(i ?? idx);
      started = true;
      if (at != null && Math.abs((video.currentTime || 0) - at) > 1.5) video.currentTime = at;
      video.muted = sound.muted;
      video.play().then(() => { playing = true; setWatching(true); }).catch(() => showToast('Press E once more to start the film (the browser asked for a click)', 4000));
    } else { video.pause(); playing = false; setWatching(false); }
    if (!remote) send(on);
  }
  net()?.on?.('cinema', m => setPlaying(!!m.on, { remote: true, at: m.at, i: m.i }));

  let watching = false;
  function setWatching(v) {
    watching = v; sound.duck2 = v ? 0.1 : 1;
    if (!v && cameraSet) { tpCamera.setFocus(null); cameraSet = false; }
  }
  let cameraSet = false;

  const onSofa = () => interactions.sitting && interactions.currentBench === seat;
  const toggle = () => setPlaying(!playing);

  interactions.extras.push({
    pos: new THREE.Vector3(sofaX - 0.8, 1.0, cz), radius: 2.6,
    get prompt() { return `${playing ? 'Pause the film' : 'Start the movie'} <kbd>E</kbd> &nbsp;&middot;&nbsp; Take a seat <kbd>F</kbd>`; },
    visible: () => true, onUse: toggle,
  });

  let wasSeated = false, t = 0, acc = 0;
  return {
    update(dt) {
      t += dt;
      const me = getLocal();
      // popping kernels and dropping cans
      for (let i = hallEffects.length - 1; i >= 0; i--) {
        const e = hallEffects[i];
        e.life -= dt;
        if (e.delay > 0) { e.delay -= dt; continue; }
        e.vy -= 9.8 * dt; e.m.position.x += e.vx * dt; e.m.position.y += e.vy * dt; e.m.position.z += e.vz * dt;
        if (e.spin) e.m.rotation.x += e.spin * dt;
        if (e.m.position.y < e.floor) { e.m.position.y = e.floor; e.vy = e.can ? 0 : Math.abs(e.vy) * 0.25; e.vx *= 0.5; e.vz *= 0.5; if (e.can) { e.vx = 0; e.vz = 0; } }
        if (e.life <= 0) { scene.remove(e.m); e.m.material?.dispose?.(); hallEffects.splice(i, 1); }
      }
      const seated = !!me && onSofa();
      if (seated && !wasSeated) showToast(playing ? 'Enjoy the film' : 'Press E to start the movie', 3500);
      wasSeated = seated;

      if (cameraSet && !tpCamera.focus) cameraSet = false;                // another feature took the camera back: ask again
      // watching from the sofa: the camera settles behind your shoulders, facing the screen
      if (watching && seated && !cameraSet) { tpCamera.setFocus(new THREE.Vector3(sofaX - 2.5, 1.5, cz), new THREE.Vector3(xs, sy - 0.25, cz)); cameraSet = true; }
      if ((!seated || !watching) && cameraSet) { tpCamera.setFocus(null); cameraSet = false; }

      // the picture
      const near = me && me.wrapper.position.x > room.x1 - 7 && me.wrapper.position.z < room.z2 + 3 && me.wrapper.position.z > room.z1 - 3;
      if (!playing || !list.length) {
        acc += dt;
        if (near && acc > 1 / 12) { acc = 0; drawPlaceholder(t); }
        if (screenMat.map !== slideTex) { screenMat.map = slideTex; screenMat.needsUpdate = true; shownSlide = -2; }
      }
      if (playing && video.muted !== sound.muted) video.muted = sound.muted;
      beamMat.opacity = playing ? 0.05 + Math.sin(t * 17) * 0.004 : 0.035;
      bias.material.opacity = playing ? 0.14 : 0.08;
    },
    get playing() { return playing; },
  };
}
