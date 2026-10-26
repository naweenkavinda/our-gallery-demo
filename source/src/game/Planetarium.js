import * as THREE from 'three';
import config from '../config/gallery.json';
import { LAYOUT, WALL_H, addObstacleBox } from './Gallery.js';
import { sound } from './Sound.js';
import { LOW_MEM } from './LowMem.js';

/**
 * The Planetarium: a small domed theatre north of the Memory Garden. The room is dark, with a soft ring of
 * light round the base of the dome and a star projector in the middle. Two loungers face up: press F to lie
 * back and the camera looks up at the dome. Press E at the projector to change the sky:
 *   Tonight          the stars and the Milky Way, slowly turning, a shooting star now and then
 *   Our sky          the heart of stars drawn from the date you got together, a star for each of you
 *   Shooting stars   a shower: make a lot of wishes
 */

const R = 7.7;                                 // radius of the dome
const MODES = [
  { name: 'Tonight', note: 'The stars, slowly turning.', turn: 0.012, heart: 0.18, stars: 1, meteor: [9, 16] },
  { name: 'Our sky', note: 'That heart of stars is ours, drawn from the day we got together.', turn: 0.0015, heart: 1, stars: 0.4, meteor: [12, 20] },
  { name: 'Shooting stars', note: 'A shower of shooting stars: make a wish.', turn: 0.02, heart: 0, stars: 0.85, meteor: [0.7, 1.6] },
];

const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const STAR_VERT = `
  attribute float size; attribute float phase; attribute vec3 tint;
  uniform float uTime; uniform float uPx; uniform float uFade;
  varying vec3 vTint; varying float vA;
  void main() {
    vTint = tint;
    float tw = 0.75 + 0.25 * sin(uTime * (1.2 + phase) + phase * 40.0);
    vA = tw * uFade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, size * uPx * tw);
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = `
  varying vec3 vTint; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d); a *= a;
    gl_FragColor = vec4(vTint, a * vA);
  }`;

function domeTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 256, 0, 0);               // the top of the texture is the top of the dome
  gr.addColorStop(0, '#1b2250'); gr.addColorStop(0.18, '#0d1234'); gr.addColorStop(0.6, '#06081c'); gr.addColorStop(1, '#03040d');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#10142c'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, 7); g.fill();
  g.strokeStyle = '#c9a15a'; g.lineWidth = 6;
  for (const r of [0.97, 0.88, 0.6, 0.28]) { g.globalAlpha = r > 0.9 ? 0.9 : 0.5; g.beginPath(); g.arc(S / 2, S / 2, S / 2 * r, 0, 7); g.stroke(); }
  g.globalAlpha = 0.55; g.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.14, S / 2 + Math.sin(a) * S * 0.14); g.lineTo(S / 2 + Math.cos(a) * S * 0.44, S / 2 + Math.sin(a) * S * 0.44); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = '#c9a15a';
  for (let i = 0; i < 4; i++) {                                   // a compass star
    const a = i * Math.PI / 2; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.2, S / 2 + Math.sin(a) * S * 0.2);
    g.lineTo(S / 2 + Math.cos(a + 0.18) * S * 0.07, S / 2 + Math.sin(a + 0.18) * S * 0.07); g.lineTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a - 0.18) * S * 0.07, S / 2 + Math.sin(a - 0.18) * S * 0.07); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function labelSprite(text, size, width = 512) {
  const c = document.createElement('canvas'); c.width = width; c.height = 128;
  const g = c.getContext('2d');
  const draw = () => { g.clearRect(0, 0, width, 128); g.textAlign = 'center'; g.fillStyle = 'rgba(255,240,215,0.95)'; g.font = 'italic 62px "Cormorant Garamond", Georgia, serif'; g.fillText(text, width / 2, 84); };
  draw();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.ready.then(() => { draw(); tex.needsUpdate = true; });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(size, size * 128 / width, 1);
  return s;
}

function signTexture() {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 360;
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#0b0e22'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#c9a15a'; g.lineWidth = 5; g.strokeRect(14, 14, c.width - 28, c.height - 28);
    g.textAlign = 'center'; g.fillStyle = '#c9a15a'; g.font = '500 36px Inter, sans-serif'; g.fillText('S T A R   T H E A T R E', c.width / 2, 92);
    g.fillStyle = '#f2ebde'; g.font = '500 130px "Cormorant Garamond", Georgia, serif'; g.fillText('The Planetarium', c.width / 2, 230);
    g.fillStyle = '#9fb0e8'; g.font = 'italic 44px "Cormorant Garamond", Georgia, serif'; g.fillText('lie back, look up, and the sky is ours', c.width / 2, 312);
  };
  draw();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  document.fonts?.ready.then(() => { draw(); t.needsUpdate = true; });
  return t;
}

export function createPlanetarium({ scene, interactions, tpCamera, renderer, getLocal, getRemotes, showToast }) {
  const room = LAYOUT.byId.planetarium;
  const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2, w = room.x2 - room.x1, d = room.z2 - room.z1;
  const start = new Date(config.relationshipStart + 'T00:00:00');
  const rng = mulberry32(start.getFullYear() * 10000 + (start.getMonth() + 1) * 100 + start.getDate());
  const mat = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  /* ── the room: a dark floor with a round rug, a ceiling with a round opening, the dome over it ── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), mat(0x0b0e1e, 0.5, 0.25));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.012, cz); floor.receiveShadow = true; scene.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(R - 0.9, 72), new THREE.MeshStandardMaterial({ map: floorTexture(), transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.02, cz); rug.receiveShadow = true; scene.add(rug);

  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, -d / 2), new THREE.Vector2(w / 2, -d / 2), new THREE.Vector2(w / 2, d / 2), new THREE.Vector2(-w / 2, d / 2)]);
  const hole = new THREE.Path(); hole.absarc(0, 0, R - 0.05, 0, Math.PI * 2, true); shape.holes.push(hole);
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), new THREE.MeshBasicMaterial({ color: 0x05060f, side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(cx, WALL_H, cz); scene.add(ceiling);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: domeTexture(), side: THREE.BackSide, toneMapped: false }));
  dome.position.set(cx, WALL_H - 0.02, cz); scene.add(dome);

  // a soft ring of blue light round the foot of the dome, and a thin gold rail under it
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.05, 10, 128), new THREE.MeshBasicMaterial({ color: 0x7f93ff, toneMapped: false }));
  glowRing.rotation.x = Math.PI / 2; glowRing.position.set(cx, WALL_H - 0.12, cz); scene.add(glowRing);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.025, 8, 128), mat(0xc9a15a, 0.3, 0.85));
  rail.rotation.x = Math.PI / 2; rail.position.set(cx, WALL_H - 0.3, cz); scene.add(rail);
  const cool = new THREE.PointLight(0x7488ff, 7, 16, 2); cool.position.set(cx, 2.4, cz); scene.add(cool);

  /* ── the sky: points on the dome, and the heart of stars ── */
  const sky = new THREE.Group(); sky.position.set(cx, WALL_H - 0.02, cz); scene.add(sky);
  const px = Math.max(1, renderer.getPixelRatio()) * Math.max(0.6, Math.min(1.6, window.innerHeight / 700));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: px }, uFade: { value: 1 } },
  });
  const heartMat = starMat.clone(); heartMat.uniforms = { uTime: starMat.uniforms.uTime, uPx: starMat.uniforms.uPx, uFade: { value: 0 } };
  const warm = [1, 0.93, 0.8], cold = [0.78, 0.86, 1], white = [1, 1, 1];
  function stars(positions, sizes, tints) {
    const n = sizes.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    g.setAttribute('size', new THREE.BufferAttribute(Float32Array.from(sizes), 1));
    g.setAttribute('phase', new THREE.BufferAttribute(Float32Array.from({ length: n }, () => rng()), 1));
    g.setAttribute('tint', new THREE.BufferAttribute(Float32Array.from(tints), 3));
    return g;
  }
  const rim = R - 0.25;
  const onDome = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l * rim, y / l * rim, z / l * rim]; };
  {
    const pos = [], size = [], tint = [];
    const N = LOW_MEM ? 700 : 1300;
    for (let i = 0; i < N; i++) {                                 // the field of stars
      const y = 0.03 + rng() * 0.97, a = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pos.push(...onDome(Math.cos(a) * r, y, Math.sin(a) * r));
      const b = rng() ** 4; size.push(2.2 + b * 7.5);
      tint.push(...(rng() < 0.3 ? warm : rng() < 0.5 ? cold : white));
    }
    // the Milky Way: a soft band of faint stars along a tilted great circle
    const n = new THREE.Vector3(0.35, 0.8, 0.5).normalize(), u = new THREE.Vector3(1, 0, 0).cross(n).normalize(), v = n.clone().cross(u);
    const M = LOW_MEM ? 600 : 1300;
    for (let i = 0; i < M; i++) {
      const a = rng() * Math.PI * 2, off = (rng() + rng() + rng() - 1.5) * 0.16;
      const p = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)).addScaledVector(n, off).normalize();
      if (p.y < 0.03) continue;
      pos.push(...onDome(p.x, p.y, p.z)); size.push(1.6 + rng() * 2.4); tint.push(0.55, 0.65, 0.95);
    }
    sky.add(new THREE.Points(stars(pos, size, tint), starMat));
  }

  // our heart of stars, around a spot above the loungers, drawn the same way every time
  const loungerZ = cz + 3.8;
  const anchor = new THREE.Vector3(0, 0.93, 0.4).normalize();
  const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3(0, 0, 1).addScaledVector(anchor, -anchor.z).normalize();
  const at = (hx, hy) => { const p = anchor.clone().addScaledVector(e1, hx * 0.03).addScaledVector(e2, hy * 0.03).normalize(); return onDome(p.x, p.y, p.z); };
  const heart = new THREE.Group(); sky.add(heart);
  {
    const N = 16, pts = [], pos = [], size = [], tint = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const p = at(hx + (rng() - 0.5) * 1.2, hy + (rng() - 0.5) * 1.2);
      pts.push(...p); pos.push(...p); size.push(9 + rng() * 6); tint.push(1, 0.84, 0.9);
    }
    heart.add(new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pts), 3)), new THREE.LineBasicMaterial({ color: 0xffc0d6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));
    const a = at(-4.4, 1), b = at(4.4, 1);
    heart.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from([...a, ...b]), 3)), new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    pos.push(...a, ...b); size.push(22, 22); tint.push(1, 0.92, 0.7, 1, 0.92, 0.7);
    heart.add(new THREE.Points(stars(pos, size, tint), heartMat));
    for (const [p, name] of [[at(-4.4, -2.2), 'Alex'], [at(4.4, -2.2), 'Sam']]) { const s = labelSprite(name, 2.4); s.position.set(...p); s.material.opacity = 0; heart.add(s); }
    const dateLabel = labelSprite(`the two of us  ·  ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 5.2, 1400);
    dateLabel.position.set(...at(0, -17)); dateLabel.material.opacity = 0; heart.add(dateLabel);
  }
  const labels = heart.children.filter(o => o.isSprite);

  /* shooting stars */
  const streakTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 16;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(255,248,230,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 8); g.lineTo(256, 2); g.lineTo(256, 14); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const meteors = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.07), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.visible = false; scene.add(m);
    return { m, on: false, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3() };
  });
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _c = new THREE.Vector3(cx, WALL_H - 0.02, cz);
  function shoot() {
    const mt = meteors.find(x => !x.on); if (!mt) return;
    const a0 = rng() * Math.PI * 2, el0 = 0.5 + rng() * 0.45, span = 0.5 + rng() * 0.5, a1 = a0 + (rng() < 0.5 ? -1 : 1) * span, el1 = Math.max(0.12, el0 - 0.18 - rng() * 0.25);
    const dir = (a, el) => new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    mt.a = dir(a0, el0); mt.b = dir(a1, el1); mt.t = 0; mt.dur = 0.8 + rng() * 0.5; mt.on = true; mt.m.visible = true;
  }

  /* ── the way in: a sign over the doorway from the garden, and a pair of doors that fit it exactly ── */
  const door = LAYOUT.doors.find(dr => dr.axis === 'x' && dr.at === room.z2);
  const leaves = [];
  const doorMid = door ? (door.from + door.to) / 2 : cx;
  if (door) {
    const TRIM = 0.1;                                              // the frame round the opening is 10 cm on each side and across the top
    const openW = door.to - door.from - TRIM * 2, leafW = openW / 2 - 0.01, leafH = 3.28;
    const sw = door.to - door.from + 0.4;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 360 / 1400), new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }));
    sign.position.set(doorMid, 4.7, door.at + 0.18); scene.add(sign);            // the middle of the header above the opening

    // one picture per leaf, drawn to the leaf's own proportions; the right-hand one is the mirror image of the left
    const art = flip => {
      const W = Math.round(500 * leafW / leafH), H = 500, mid = W / 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      if (flip) { g.translate(W, 0); g.scale(-1, 1); }
      g.fillStyle = '#12173a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#c9a15a'; g.lineWidth = 5; g.strokeRect(14, 14, W - 28, H - 28);
      const pw = W - 60, ph = (H - 60 - 20) / 2;                    // two panels, 30 px in from every edge and 20 px apart
      g.lineWidth = 2.5; g.strokeRect(30, 30, pw, ph); g.strokeRect(30, 30 + ph + 20, pw, ph);
      const top = 30 + ph / 2, low = 30 + ph + 20 + ph / 2;
      g.fillStyle = '#c9a15a'; g.beginPath(); g.arc(mid - 6, top, 52, 0, 7); g.fill();       // a crescent moon, centred in the upper panel
      g.fillStyle = '#12173a'; g.beginPath(); g.arc(mid + 14, top - 5, 46, 0, 7); g.fill();
      const star = (x, y, r) => { g.fillStyle = '#c9a15a'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, rr = i % 2 ? r * 0.36 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
      for (const [dx, dy, r] of [[-1, -1, 10], [1, -1, 10], [-1, 1, 8], [1, 1, 8]]) star(mid + dx * (pw / 2 - 28), top + dy * (ph / 2 - 28), r);
      g.strokeStyle = '#c9a15a'; g.lineWidth = 3; g.beginPath(); g.arc(mid, low, 60, 0, 7); g.stroke();   // a star in a ring, centred in the lower panel
      star(mid, low, 42);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.fillStyle = '#c9a15a'; g.beginPath(); g.arc(mid + Math.cos(a) * 60, low + Math.sin(a) * 60, 4, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const edgeMat = mat(0x12173a, 0.5, 0.2), handle = mat(0xc9a15a, 0.3, 0.85);
    for (const dir of [1, -1]) {
      const face = new THREE.MeshStandardMaterial({ map: art(dir < 0), roughness: 0.5, metalness: 0.2 });
      const pivot = new THREE.Group(); pivot.position.set(dir > 0 ? door.from + TRIM : door.to - TRIM, 0.015, door.at); scene.add(pivot);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, 0.1), [edgeMat, edgeMat, edgeMat, edgeMat, face, face]);
      leaf.position.set(dir * (leafW / 2), leafH / 2, 0); leaf.castShadow = true; pivot.add(leaf);
      for (const sgn of [1, -1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12), handle); h.position.set(dir * (leafW - 0.24), leafH / 2, sgn * 0.11); pivot.add(h); }
      leaves.push({ pivot, dir });
    }
  }  let openK = 0, doorOpen = false;

  /* ── the projector in the middle ── */
  const proj = new THREE.Group(); proj.position.set(cx, 0, cz); scene.add(proj);
  const brass = mat(0xc9a15a, 0.3, 0.85), body = mat(0x15172a, 0.4, 0.5);
  add(proj, new THREE.CylinderGeometry(0.7, 0.8, 0.25, 40), body, 0, 0.125, 0);
  add(proj, new THREE.CylinderGeometry(0.28, 0.4, 0.7, 32), body, 0, 0.6, 0);
  add(proj, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), brass, 0, 1.3, 0);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false });
  for (const y of [1.0, 1.95]) { add(proj, new THREE.SphereGeometry(0.34, 28, 20), brass, 0, y, 0); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, y = i % 2 ? 1.0 : 1.95; add(proj, new THREE.SphereGeometry(0.035, 8, 6), lamp, Math.cos(a) * 0.34, y + Math.sin(i * 1.7) * 0.12, Math.sin(a) * 0.34); }
  add(proj, new THREE.TorusGeometry(0.48, 0.02, 8, 48), brass, 0, 1.48, 0).rotation.x = Math.PI / 2;
  const beam = new THREE.PointLight(0xffe3b0, 5, 7, 2); beam.position.set(cx, 2.4, cz); scene.add(beam);
  addObstacleBox({ x: cx, z: cz, hx: 0.9, hz: 0.9 });

  /* ── two loungers to lie back on, side by side, with their heads towards the projector ── */
  const leather = mat(0x1c2040, 0.55, 0.1), cushion = mat(0x7d7aa3, 0.85), trim = mat(0xc9a15a, 0.35, 0.8);
  const beds = [];
  for (const dx of [-0.62, 0.62]) {
    const g = new THREE.Group(); g.position.set(cx + dx, 0, loungerZ); scene.add(g);
    add(g, new THREE.BoxGeometry(1.0, 0.3, 2.4), leather, 0, 0.17, 0);
    add(g, new THREE.BoxGeometry(0.9, 0.12, 2.3), cushion, 0, 0.38, 0);
    add(g, new THREE.BoxGeometry(1.02, 0.03, 2.42), trim, 0, 0.3, 0);
    const pillow = add(g, new THREE.SphereGeometry(0.22, 20, 14), cushion, 0, 0.5, -0.9); pillow.scale.set(1.5, 0.5, 0.9);
    addObstacleBox({ x: cx + dx, z: loungerZ, hx: 0.6, hz: 1.3 });
    beds.push({
      group: { position: new THREE.Vector3(cx + dx, 0, loungerZ) }, spot: { ry: 0, face: 0 }, floor: true, lie: true, lieY: 0.45,
      label: 'Lie back and watch the sky', seatTop: 0, hipsFrac: 0,
      exit: { x: Math.sign(dx) * 1.3, z: 0 },                      // get up on the outer side, clear of the lounger
    });
  }
  interactions.benches.push(...beds);

  /* ── the show ── */
  let mode = 0, fade = 0, nextMeteor = 4, turn = 0, wasLying = false, focused = false, time = 0, dark = 0, firstLie = true;
  const lyingNow = () => !!(interactions.sitting && interactions.currentBench?.lie);
  interactions.extras.push({
    pos: new THREE.Vector3(cx, 1.3, cz), radius: 3,
    get prompt() { return `Change the sky <kbd>E</kbd> &nbsp;&middot;&nbsp; now: ${MODES[mode].name}`; },
    visible: () => !lyingNow(),
    onUse: () => { mode = (mode + 1) % MODES.length; sound.sparkle(); showToast(`${MODES[mode].name}. ${MODES[mode].note}`, 4500); },
  });

  return {
    /** 0 outside, 1 inside the room (the rest of the gallery dims a little while you are in here) */
    get dark() { return dark; },
    get lying() { return lyingNow(); },
    update(dt) {
      time += dt;
      const me = getLocal();
      const p = me.wrapper.position;
      const inside = p.x > room.x1 && p.x < room.x2 && p.z > room.z1 && p.z < room.z2;
      dark += ((inside ? 1 : 0) - dark) * (1 - Math.exp(-2.5 * dt));
      if (leaves.length) {
        const near = Math.hypot(p.x - doorMid, p.z - room.z2) < 4.4;
        if (near !== doorOpen) { doorOpen = near; sound.whoosh?.(); }
        openK += ((near ? 1 : 0) - openK) * (1 - Math.exp(-3.5 * dt));
        for (const l of leaves) l.pivot.rotation.y = l.dir * openK * 1.75;
      }
      const M = MODES[mode];
      starMat.uniforms.uTime.value = time;
      const visible = inside || dark > 0.02;
      sky.visible = visible;
      if (!visible) return;
      fade += (M.stars - fade) * (1 - Math.exp(-2 * dt));
      starMat.uniforms.uFade.value = fade;
      heartMat.uniforms.uFade.value += (M.heart - heartMat.uniforms.uFade.value) * (1 - Math.exp(-2 * dt));
      for (const l of labels) l.material.opacity += ((M.heart > 0.5 ? 1 : 0) - l.material.opacity) * (1 - Math.exp(-2 * dt));
      heart.children.forEach(o => { if (o.isLine || o.isLineLoop) o.material.opacity = 0.7 * heartMat.uniforms.uFade.value; });
      turn += M.turn * dt;
      sky.rotation.y = turn;
      glowRing.material.color.setHSL(0.64 + Math.sin(time * 0.15) * 0.03, 0.8, 0.68);

      // lying back you see through your own eyes: drag to look all the way round and up to the top of the dome
      const mine = lyingNow();
      if (mine && !wasLying) {
        const b = interactions.currentBench;
        tpCamera.setEye(new THREE.Vector3(b.group.position.x, b.lieY + 0.36, b.group.position.z - 0.62), 0, 1.15);
        focused = true;
        if (firstLie) { firstLie = false; showToast('Look around: drag or move the mouse. F gets you up, E at the projector changes the sky.', 6000); }
      }
      if (!mine && wasLying && focused) { tpCamera.setEye(null); tpCamera.rotX = Math.PI; focused = false; }
      wasLying = mine;

      // shooting stars
      nextMeteor -= dt;
      if (nextMeteor <= 0) { shoot(); nextMeteor = M.meteor[0] + rng() * (M.meteor[1] - M.meteor[0]); }
      for (const mt of meteors) {
        if (!mt.on) continue;
        mt.t += dt;
        const k = mt.t / mt.dur;
        if (k >= 1) { mt.on = false; mt.m.visible = false; continue; }
        const dir = mt.a.clone().lerp(mt.b, k).normalize();
        const next = mt.a.clone().lerp(mt.b, Math.min(1, k + 0.02)).normalize();
        mt.m.position.copy(dir).multiplyScalar(R - 0.18).add(_c);
        _z.copy(dir).negate();                                    // the plane faces the middle of the room
        _x.copy(next).sub(dir).normalize();
        _y.crossVectors(_z, _x).normalize(); _x.crossVectors(_y, _z).normalize();
        mt.m.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
        mt.m.material.opacity = Math.sin(k * Math.PI) * 0.95;
      }
    },
  };
}
