import * as THREE from 'three';
import config from '../config/gallery.json';
import { LAYOUT, WALL_H, addObstacleBox, heartGeometry } from './Gallery.js';
import { ParticleField } from './Particles.js';
import { now as clockNow } from './Clock.js';
import { sound } from './Sound.js';
import { DEMO } from './Demo.js';

/**
 * The Surprise Room: west of the Memory Garden, behind an iron gate with a heart padlock. The gate
 * only opens on the 9th of every month (and on the anniversary). Inside, a gift on a pedestal holds
 * a different note every month. Change the notes with "surprises" in src/config/gallery.json.
 */

const GATE_Z = [-68, -62];          // the doorway on the garden's west wall
const GATE_H = 3.35;                // just under the door header
const DAY = 86400000;

const NOTES = [
  { title: 'One month, and I would pick you again', text: 'Every little thing about this month got better because you were in it. Thank you for being my favourite person to share it with.' },
  { title: 'Two months of you', text: 'I did not know ordinary days could feel like this. A message from you, a walk beside you, and the whole day turns golden.' },
  { title: 'Three months', text: 'If I could keep one thing from every day with you, it would be the way you laugh when you think I am not looking.' },
  { title: 'Four months', text: 'You make me braver and softer at the same time. I did not know that was possible until you.' },
  { title: 'Five months', text: 'I built a whole gallery just to hold the things I love about you, and I still ran out of walls.' },
  { title: 'Six months, half a year', text: 'Half a year of you, and I still get that happy flutter when your name lights up my phone. Here is to the next half, and the one after.' },
  { title: 'Seven months', text: 'Wherever we are, home is wherever you are. I hope you know that.' },
  { title: 'Eight months', text: 'Thank you for every plan we made, every one we cancelled to stay in, and every silly voice you did just to make me smile.' },
  { title: 'Nine months', text: 'I love how quickly you became my safe place, and how much of my future already has your name in it.' },
  { title: 'Ten months', text: 'There is no version of my life I want where you are not in it. Happy monthiversary, my love.' },
  { title: 'Eleven months', text: 'Almost a year, and still every day with you feels like the first good one.' },
  { title: 'Twelve months and one year', text: 'One year of us. Thank you for choosing me, every single day. I choose you right back.' },
];

const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** days until the gate next opens: 0 on the day itself */
function daysUntilOpen(today, start) {
  const first = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());      // the first monthiversary
  for (let k = 0; k < 26; k++) {
    const c = new Date(today.getFullYear(), today.getMonth() + k, start.getDate());
    if (c >= midnight(today) && c >= first) return Math.round((c - midnight(today)) / DAY);
  }
  return null;
}

function signTexture(lines) {
  const c = document.createElement('canvas'); c.width = 1500; c.height = 420;
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#1a0f16'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#c9a15a'; g.lineWidth = 6; g.strokeRect(14, 14, c.width - 28, c.height - 28);
    g.textAlign = 'center';
    g.fillStyle = '#c9a15a'; g.font = '500 40px Inter, sans-serif'; g.fillText(lines[0], c.width / 2, 100);
    g.fillStyle = '#f2ebde'; g.font = '500 128px "Cormorant Garamond", Georgia, serif'; g.fillText(lines[1], c.width / 2, 245);
    g.fillStyle = '#d9a3b0'; g.font = 'italic 52px "Cormorant Garamond", Georgia, serif'; g.fillText(lines[2], c.width / 2, 340);
  };
  draw();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  document.fonts?.ready.then(() => { draw(); tex.needsUpdate = true; });
  return tex;
}

export function createSurpriseRoom({ scene, interactions, collectibles, anniversary, getLocal, showToast }) {
  const room = LAYOUT.byId.surprise;
  const start = new Date(config.relationshipStart + 'T00:00:00');
  const today = clockNow();
  const open = DEMO || !!(anniversary.isMonthly || anniversary.isAnniversary);       // the demo leaves the gate open so the room can be seen
  const days = open ? 0 : daysUntilOpen(today, start);
  const doorX = room.x2, zc = (GATE_Z[0] + GATE_Z[1]) / 2;
  const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2;

  const mat = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const iron = mat(0x2a2022, 0.45, 0.7), gold = mat(0xd4a64f, 0.3, 0.85);

  /* ── the gate: two iron panels hinged on the door posts, swung open on the day ── */
  const panelLen = (GATE_Z[1] - GATE_Z[0]) / 2;
  function panel(pivotZ, dir) {
    const pivot = new THREE.Group(); pivot.position.set(doorX, 0, pivotZ); scene.add(pivot);
    const barGeo = new THREE.CylinderGeometry(0.022, 0.022, GATE_H, 8);
    for (let z = 0.12; z < panelLen - 0.05; z += 0.2) add(pivot, barGeo, iron, 0, GATE_H / 2, dir * z);
    for (const y of [0.25, GATE_H / 2, GATE_H - 0.15]) add(pivot, new THREE.BoxGeometry(0.05, 0.06, panelLen), iron, 0, y, dir * panelLen / 2);
    add(pivot, new THREE.BoxGeometry(0.06, GATE_H, 0.06), iron, 0, GATE_H / 2, dir * 0.03);
    for (let z = 0.12; z < panelLen - 0.05; z += 0.4) add(pivot, new THREE.SphereGeometry(0.045, 10, 8), gold, 0, GATE_H + 0.02, dir * z);
    return pivot;
  }
  const left = panel(GATE_Z[0], 1), right = panel(GATE_Z[1], -1);
  const padlock = new THREE.Mesh(heartGeometry(0.34), new THREE.MeshPhysicalMaterial({ color: 0xd9566e, metalness: 0.5, roughness: 0.25, clearcoat: 0.6, emissive: 0x4a1020 }));
  padlock.position.set(doorX + 0.1, 1.55, zc); padlock.rotation.y = Math.PI / 2; padlock.scale.setScalar(1.3); scene.add(padlock);
  const openAngle = 1.45;
  if (open) { left.rotation.y = openAngle; right.rotation.y = -openAngle; padlock.visible = false; }
  const block = { x: doorX, z: zc, hx: 0.7, hz: panelLen + 0.1 };
  if (!open) addObstacleBox(block);

  // the sign over the gate
  const when = open ? 'Open today' : days === 1 ? 'Opens tomorrow' : days != null ? `Opens in ${days} days` : '';
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.46), new THREE.MeshBasicMaterial({ map: signTexture(['BEHIND THE GATE', 'The Surprise Room', `${open ? (DEMO ? 'Come in' : 'Come in, it is the 9th') : 'Opens on the 9th of every month'}  ·  ${when}`]), toneMapped: false }));
  sign.rotation.y = Math.PI / 2; sign.position.set(doorX + 0.18, 4.75, zc); scene.add(sign);

  interactions.extras.push({
    pos: new THREE.Vector3(doorX + 1.2, 1.2, zc), radius: 3,
    get prompt() { return days === 1 ? 'Locked until tomorrow' : `Locked: opens on the 9th (in ${days} days)`; },
    visible: () => !open && days != null,
    onUse: () => showToast(days === 1 ? 'Tomorrow, my love. Come back and the gate will be open.' : `The gate opens on the 9th of every month: in ${days} days.`, 4500),
  });

  /* ── inside: a rose rug, string lights, a warm glow, and the gift ── */
  const rug = document.createElement('canvas'); rug.width = rug.height = 512;
  { const g = rug.getContext('2d'); g.fillStyle = '#8c1f35'; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill(); g.strokeStyle = '#dac592'; g.lineWidth = 10; g.beginPath(); g.arc(256, 256, 230, 0, 7); g.stroke(); g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 200, 0, 7); g.stroke(); }
  const rugTex = new THREE.CanvasTexture(rug); rugTex.colorSpace = THREE.SRGBColorSpace;
  const rugMesh = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  rugMesh.rotation.x = -Math.PI / 2; rugMesh.position.set(cx, 0.014, cz); rugMesh.receiveShadow = true; scene.add(rugMesh);

  const bulbs = [];
  for (const z of [room.z1 + 0.5, room.z2 - 0.5]) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), sag = Math.sin(k * Math.PI * 4) * 0.25;
      bulbs.push([room.x1 + 0.6 + k * (room.x2 - room.x1 - 1.2), WALL_H - 0.7 - Math.abs(sag), z]);
    }
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), bulbs.length);
  const m4 = new THREE.Matrix4();
  bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, m4.makeTranslation(...p)));
  scene.add(bulbMesh);
  const glow = new THREE.PointLight(0xffc9a8, 22, 20, 2); glow.position.set(cx, WALL_H - 1.2, cz); scene.add(glow);

  // the gift
  const gift = new THREE.Group(); gift.position.set(cx, 0, cz); scene.add(gift);
  add(gift, new THREE.CylinderGeometry(0.55, 0.62, 0.9, 40), mat(0xf4efe6, 0.5), 0, 0.45, 0);
  const ribbon = mat(0xd9a74a, 0.35, 0.6), wrap = mat(0xc4455f, 0.45);
  const box = new THREE.Group(); box.position.y = 1.2; gift.add(box);
  add(box, new THREE.BoxGeometry(0.7, 0.5, 0.7), wrap, 0, 0, 0);
  add(box, new THREE.BoxGeometry(0.76, 0.14, 0.76), wrap, 0, 0.3, 0);
  add(box, new THREE.BoxGeometry(0.12, 0.52, 0.72), ribbon, 0, 0, 0);
  add(box, new THREE.BoxGeometry(0.72, 0.52, 0.12), ribbon, 0, 0, 0);
  add(box, new THREE.BoxGeometry(0.12, 0.16, 0.78), ribbon, 0, 0.3, 0);
  add(box, new THREE.BoxGeometry(0.78, 0.16, 0.12), ribbon, 0, 0.3, 0);
  for (const s of [-1, 1]) { const loop = add(box, new THREE.TorusGeometry(0.13, 0.035, 8, 20), ribbon, s * 0.13, 0.46, 0); loop.rotation.y = Math.PI / 2; loop.rotation.z = s * 0.5; }
  addObstacleBox({ x: cx, z: cz, hx: 0.6, hz: 0.6 });

  const confetti = new ParticleField(scene, { kind: 'petal', count: 150, rect: { x1: room.x1 + 0.6, x2: room.x2 - 0.6, z1: room.z1 + 0.6, z2: room.z2 - 0.6 }, y0: 0, y1: WALL_H - 0.4, size: 0.16, color: 0xff9db4, reach: 40 });
  const sparkles = new ParticleField(scene, { kind: 'sparkle', count: 90, rect: { x1: room.x1 + 0.6, x2: room.x2 - 0.6, z1: room.z1 + 0.6, z2: room.z2 - 0.6 }, y0: 0.3, y1: WALL_H - 0.6, size: 0.12, color: 0xffd98a, reach: 40 });
  confetti.setAlpha(0); sparkles.setAlpha(0);

  const notes = Array.isArray(config.surprises) && config.surprises.length ? config.surprises : NOTES;
  const pick = () => notes[Math.max(0, (anniversary.isAnniversary ? anniversary.years * 12 : anniversary.months) - 1) % notes.length];
  let cheer = 0, t = 0;
  interactions.extras.push({
    pos: new THREE.Vector3(cx, 1.0, cz), radius: 2.4,
    get prompt() { return 'Open your surprise <kbd>E</kbd>'; },
    visible: () => open,
    onUse: () => {
      const n = pick();
      cheer = 14; sound.fanfare();
      collectibles.readLetter({
        kicker: anniversary.isAnniversary ? 'Behind the gate, on our anniversary' : `Behind the gate · month ${anniversary.months}`,
        title: n.title, text: n.text, sign: `- ${config.signature}`,
      });
    },
  });

  return {
    open,
    update(dt) {
      t += dt;
      if (padlock.visible) padlock.position.y = 1.55 + Math.sin(t * 2) * 0.03;
      box.position.y = 1.2 + Math.sin(t * 1.6) * 0.04; box.rotation.y += dt * 0.4;
      cheer = Math.max(0, cheer - dt);
      const me = getLocal();
      const inside = !!me && me.wrapper.position.x < room.x2 && me.wrapper.position.x > room.x1;
      const want = cheer > 0 ? 1 : 0;
      confetti.setAlpha(confetti.alpha + (want - confetti.alpha) * Math.min(1, dt * 1.5));
      sparkles.setAlpha(sparkles.alpha + ((cheer > 0 || (open && inside) ? 0.8 : 0) - sparkles.alpha) * Math.min(1, dt * 1.5));
      if (confetti.alpha > 0.01) confetti.update(dt, null);
      if (sparkles.alpha > 0.01) sparkles.update(dt, null);
    },
  };
}
