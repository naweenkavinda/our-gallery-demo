/**
 * Gallery.js: builds the 3D gallery from the floor plan in layoutCore.js
 * (rooms of different sizes, passages, free-standing walls, all the photos).
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import config from '../config/gallery.json';
import { LAYOUT, PHOTOS, WALL_T } from './Layout.js';
import { pbr, boxUV } from './Materials.js';
import { LOW_MEM } from './LowMem.js';

const C = {
  wall:       0xe9e4da,
  skirting:   0x2a2724,
  trim:       0x2a2724,
  ceiling:    0x1d1d21,
  ceilGrid:   0x2c2c32,
  rail:       0x111114,
  frame:      0x181818,
  mat:        0xf3f0ea,
  panel:      0x15151a,
  benchSeat:  0xc9ae86,
  benchBase:  0x1a1a1a,
};

const WALL_H = 6.0;
const DOOR_H = 3.4;
const PI = Math.PI;

/* ═══════════════════════════════════════════════════ */
/*  PLAN (exports used by the rest of the game)         */
/* ═══════════════════════════════════════════════════ */
export const ROOM_DEFS = LAYOUT.rooms;
export const PHOTO_SPOTS = LAYOUT.photoSpots;
export const FEATURE_SPOT = PHOTO_SPOTS[0];
export const BENCH_SPOTS = LAYOUT.benchSpots;
export const DOG_NAV = LAYOUT.nav;
export const NOTE_SPOTS = LAYOUT.noteSpots;
export const HEART_SPOTS = LAYOUT.heartSpots;
export const SPAWN = LAYOUT.spawn;
export const SEAT_TOP = 0.43;
export { LAYOUT, WALL_H };

const PLANTS = LAYOUT.plants;
const PEDESTALS = LAYOUT.pedestals;
const PLANTER = LAYOUT.planter;
const HEART_PEDESTAL = LAYOUT.heartPedestal;

export const canWalk = LAYOUT.canWalk;

export function getCurrentRoom(x, z) {
  const r = LAYOUT.roomAt(x, z);
  if (r) return r;
  let best = LAYOUT.rooms[0], bd = Infinity;
  for (const q of LAYOUT.rooms) {
    const dx = Math.max(q.x1 - x, 0, x - q.x2), dz = Math.max(q.z1 - z, 0, z - q.z2);
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Things added later (the photo booth, the record player) register their footprints here. */
export function addObstacleBox(b) { LAYOUT.boxes.push(b); }
export function addObstacleCircle(c) { LAYOUT.circles.push(c); }

/* ═══════════════════════════════════════════════════ */
/*  TEXTURES                                            */
/* ═══════════════════════════════════════════════════ */
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTex(w, h, draw, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

// Large polished porcelain tiles: 2x2 tiles per texture, each tile 1.2 m
function floorTexture(rx, ry) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const t = w / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const x0 = c * t, y0 = r * t;
      g.fillStyle = `hsl(36, ${9 + rand() * 6}%, ${66 + rand() * 7}%)`;
      g.fillRect(x0, y0, t, t);
      for (let v = 0; v < 7; v++) {
        g.strokeStyle = `rgba(255,255,255,${0.12 + rand() * 0.2})`;
        g.lineWidth = 1 + rand() * 2.2;
        g.beginPath();
        const sx = x0 + rand() * t, sy = y0 + rand() * t;
        g.moveTo(sx, sy);
        g.bezierCurveTo(sx + rand() * 260 - 130, sy + rand() * 260 - 130, sx + rand() * 260 - 130, sy + rand() * 260 - 130, sx + rand() * 340 - 170, sy + rand() * 340 - 170);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
      g.strokeRect(x0 + 5, y0 + 5, t - 10, t - 10);
      g.strokeStyle = '#6f685d'; g.lineWidth = 6;
      g.strokeRect(x0, y0, t, t);
    }
  }, rx, ry);
}

const washTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,210,1)'); grad.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();

function plateTexture(caption, num) {
  return canvasTex(256, 140, (g, w, h) => {
    g.fillStyle = '#f7f4ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,34,28,0.35)'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#2a2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (caption) {
      let size = 30;
      g.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
      while (g.measureText(caption).width > w - 30 && size > 14) { size -= 2; g.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`; }
      g.fillText(caption, w / 2, 52);
    }
    g.fillStyle = '#7d6f5f';
    g.font = '500 16px Inter, sans-serif';
    g.fillText('Alex & Sam', w / 2, caption ? 90 : 58);
    g.fillText(`No. ${String(num).padStart(2, '0')}`, w / 2, caption ? 114 : 86);
  });
}

function placeholderCanvas(w, h, idx) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const hue = 18 + ((idx * 23) % 50);
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue}, 45%, 82%)`);
  grad.addColorStop(1, `hsl(${hue + 18}, 38%, 66%)`);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  const s = Math.min(w, h) * 0.34;
  g.beginPath();
  g.moveTo(w / 2, h / 2 + s * 0.55);
  g.bezierCurveTo(w / 2 - s * 1.3, h / 2 - s * 0.2, w / 2 - s * 0.5, h / 2 - s * 1.0, w / 2, h / 2 - s * 0.3);
  g.bezierCurveTo(w / 2 + s * 0.5, h / 2 - s * 1.0, w / 2 + s * 1.3, h / 2 - s * 0.2, w / 2, h / 2 + s * 0.55);
  g.fill();
  return c;
}

const prettyDate = d => {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; }
};
const captionFor = i => config.captions?.[String(i + 1)] || prettyDate(PHOTOS[i].date);

/* ═══════════════════════════════════════════════════ */
/*  PLANT MODELS (Poly Haven, CC0, photo-scanned)       */
/* ═══════════════════════════════════════════════════ */
const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
const PLANT_FILES = { tall: 'potted_plant_01', medium: 'potted_plant_02', small: 'potted_plant_04' };

async function loadPlantModels() {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(Object.entries(PLANT_FILES).map(async ([key, id]) => {
    try {
      const gltf = await loader.loadAsync(`./models/plants-lite/${id}.glb`);       // light copies made by scripts/optimize-plants.mjs
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        const m = o.material;
        if (m && m.map && /leaf|leaves/i.test(m.name || '')) { m.side = THREE.DoubleSide; }
      });
      out[key] = gltf.scene;
    } catch (e) {
      console.warn(`[Plants] could not load ${id}`, e);
    }
  }));
  return out;
}

/* ═══════════════════════════════════════════════════ */
/*  SCULPTURE HELPERS                                   */
/* ═══════════════════════════════════════════════════ */
export function heartGeometry(height) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.4, -0.05, 0.5, -0.25, 0.5);
  s.bezierCurveTo(-0.55, 0.5, -0.55, 0.15, -0.55, 0.15);
  s.bezierCurveTo(-0.55, -0.05, -0.35, -0.27, 0, -0.5);
  s.bezierCurveTo(0.35, -0.27, 0.55, -0.05, 0.55, 0.15);
  s.bezierCurveTo(0.55, 0.15, 0.55, 0.5, 0.25, 0.5);
  s.bezierCurveTo(0.1, 0.5, 0, 0.4, 0, 0.25);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 6, curveSegments: 24 });
  geo.center();
  geo.scale(height, height, height);
  return geo;
}

/* ═══════════════════════════════════════════════════ */
/*  BUILD                                               */
/* ═══════════════════════════════════════════════════ */
export function buildGallery(scene, renderer) {
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }
  scene.background = new THREE.Color(0x1a1a1e);

  const wallMats = new Map();
  const wallMat = hex => {
    if (!wallMats.has(hex)) wallMats.set(hex, new THREE.MeshStandardMaterial({ ...pbr('beige_wall_001', 1, 1, 0.7), map: null, color: new THREE.Color(hex), roughness: 1, metalness: 0 }));
    return wallMats.get(hex);
  };
  // dark oak: skirting, door trim and picture frames (lacquered, so it catches a little light)
  const darkOak = (rx, ry, color) => new THREE.MeshPhysicalMaterial({ ...pbr('black_oak_veneer', rx, ry, 0.6), color, roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.35 });
  const skirtMat = darkOak(3, 0.1, 0x7a746c);
  const trimMat = darkOak(0.5, 3, 0x7a746c);
  const frameMat = darkOak(1.2, 1.2, 0x5a544c);
  const matMat = new THREE.MeshStandardMaterial({ color: C.mat, roughness: 0.95 });
  const panelMat = new THREE.MeshStandardMaterial({ ...pbr('beige_wall_001', 2, 2, 0.8), map: null, color: 0x232328, roughness: 1 });
  const benchSeatMat = new THREE.MeshPhysicalMaterial({ ...pbr('oak_veneer_01', 1.3, 0.28, 0.7), color: 0xffffff, roughness: 1, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const benchBaseMat = new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.4, metalness: 0.85 });
  const whiteMat = new THREE.MeshPhysicalMaterial({ ...pbr('marble_01', 0.5, 0.7, 0.5), color: 0xffffff, roughness: 1, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const roseGold = new THREE.MeshPhysicalMaterial({ color: 0xd69a8c, metalness: 0.85, roughness: 0.22, clearcoat: 0.5 });
  const marble = new THREE.MeshPhysicalMaterial({ ...pbr('marble_01', 0.5, 0.5, 0.5), color: 0xffffff, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc9a15a, metalness: 0.9, roughness: 0.3 });

  const box = (w, h, d, mat, x, y, z, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = receive;
    scene.add(m);
    return m;
  };

  /* ── Floor (glossy tile) & ceiling over the whole plan ── */
  const B = LAYOUT.bounds;
  const FX1 = B.x1 - 2, FX2 = B.x2 + 2, FZ1 = B.z1 - 2, FZ2 = B.z2 + 2;
  const FW = FX2 - FX1, FD = FZ2 - FZ1, FCX = (FX1 + FX2) / 2, FCZ = (FZ1 + FZ2) / 2;
  const floorMat = new THREE.MeshPhysicalMaterial({
    ...pbr('marble_01', FW / 1.5, FD / 1.5, 0.9),
    roughness: 1, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.04,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), floorMat);
  floor.rotation.x = -PI / 2;
  floor.position.set(FCX, 0, FCZ);
  floor.receiveShadow = true;
  scene.add(floor);

  /* ── Ceilings: every room has its own colour and design ──
     coffer: a grid of beams    cove: a stepped ceiling with a ring of warm light
     beams: heavy oak beams     stars: a night sky      plain: just the colour */
  const starsTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#0b0f20'; g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, w * 0.6);
    glow.addColorStop(0, 'rgba(70,84,150,0.35)'); glow.addColorStop(1, 'rgba(70,84,150,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const b = Math.random() ** 3;
      g.fillStyle = `rgba(255,248,230,${0.25 + b * 0.75})`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 0.5 + b * 2.2, 0, PI * 2); g.fill();
    }
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0d2, toneMapped: false });
  for (const r of LAYOUT.rooms) {
    const w = r.x2 - r.x1, d = r.z2 - r.z1, cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const mat = r.design === 'stars'
      ? new THREE.MeshBasicMaterial({ map: starsTex, toneMapped: false })
      : new THREE.MeshStandardMaterial({ ...pbr('beige_wall_001', w / 3, d / 3, 0.7), map: null, color: r.ceilIn ?? r.ceil ?? C.ceiling, roughness: 1 });
    if (r.design === 'dome') continue;                  // the Planetarium makes its own ceiling and dome
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    plane.rotation.x = PI / 2; plane.position.set(cx, WALL_H, cz);
    scene.add(plane);

    if (r.design === 'white') {
      // Clean white ceiling with one modern pendant over the middle of the room: two slim light rings
      // on fine cables. No mouldings, nothing busy.
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6, toneMapped: false });
      const steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.45, metalness: 0.7 });
      const pend = new THREE.Group(); pend.position.set(cx, WALL_H, cz); scene.add(pend);
      const drop = 1.7;
      const ring = (radius, y) => { const m = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 10, 96), ledMat); m.rotation.x = PI / 2; m.position.y = y; pend.add(m); return m; };
      ring(1.15, -drop); ring(0.62, -drop - 0.22);
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28), steel); casing.position.y = -0.025; pend.add(casing);
      for (let k = 0; k < 3; k++) {                       // three fine cables from the ceiling to the big ring
        const a = k / 3 * PI * 2 + 0.5, x = Math.cos(a) * 1.15, z = Math.sin(a) * 1.15;
        const len = Math.hypot(drop, Math.hypot(x, z) - 0.1);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), steel);
        cable.position.set(x / 2, -drop / 2, z / 2);
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, -drop, z).normalize());
        pend.add(cable);
      }
    } else if (r.design === 'cove') {
      const step = new THREE.MeshStandardMaterial({ color: r.ceil, roughness: 1 });
      box(w - 0.3, 0.16, 0.9, step, cx, WALL_H - 0.08, r.z1 + 0.45); box(w - 0.3, 0.16, 0.9, step, cx, WALL_H - 0.08, r.z2 - 0.45);
      box(0.9, 0.16, d - 0.3, step, r.x1 + 0.45, WALL_H - 0.08, cz); box(0.9, 0.16, d - 0.3, step, r.x2 - 0.45, WALL_H - 0.08, cz);
      box(w - 2, 0.04, 0.12, glowMat, cx, WALL_H - 0.17, r.z1 + 0.95); box(w - 2, 0.04, 0.12, glowMat, cx, WALL_H - 0.17, r.z2 - 0.95);
      box(0.12, 0.04, d - 2, glowMat, r.x1 + 0.95, WALL_H - 0.17, cz); box(0.12, 0.04, d - 2, glowMat, r.x2 - 0.95, WALL_H - 0.17, cz);
    } else if (r.design === 'beams') {
      const oak = new THREE.MeshStandardMaterial({ ...pbr('oak_veneer_01', 0.4, 3, 0.8), color: r.beam, roughness: 1 });
      const n = Math.round(w / 2.6);
      for (let i = 1; i < n; i++) box(0.3, 0.38, d, oak, r.x1 + w * i / n, WALL_H - 0.19, cz);
      box(w, 0.24, 0.24, oak, cx, WALL_H - 0.12, cz - d / 4); box(w, 0.24, 0.24, oak, cx, WALL_H - 0.12, cz + d / 4);
    }
  }

  // Skylight over the garden
  const gar = LAYOUT.byId.garden;
  const GCX = (gar.x1 + gar.x2) / 2, GCZ = (gar.z1 + gar.z2) / 2 + 1;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ color: 0xfffaf0, toneMapped: false }));
  sky.rotation.x = PI / 2; sky.position.set(GCX, WALL_H - 0.01, GCZ);
  scene.add(sky);
  for (const dx of [-7, -3.5, 0, 3.5, 7]) box(0.08, 0.06, 10, trimMat, GCX + dx, WALL_H - 0.04, GCZ);
  for (const dz of [-5, -2.5, 0, 2.5, 5]) box(14, 0.06, 0.08, trimMat, GCX, WALL_H - 0.04, GCZ + dz);

  /* ── Walls: each room has its own colour, so a wall can be one colour on each side ── */
  const roomHex = r => (r ? r.wall : null);
  const wallBox = (p, from, to, extA, extB, rp, rn) => {
    // walls that meet at a corner overlap by half a wall thickness; stop 1 cm short of the other wall's far face so the
    // two never share a flat surface (that made a shimmering strip when seen from the other room)
    const ext = WALL_T / 2 - 0.012;
    const a = from - (extA ? ext : 0), b = to + (extB ? ext : 0);
    const len = b - a, mid = (a + b) / 2;
    const cp = roomHex(rp) ?? roomHex(rn) ?? C.wall, cn = roomHex(rn) ?? cp;
    const mats = new Array(6).fill(wallMat(cp));
    if (p.axis === 'x') { mats[4] = wallMat(cp); mats[5] = wallMat(cn); } else { mats[0] = wallMat(cp); mats[1] = wallMat(cn); }
    const geo = p.axis === 'x' ? boxUV(new THREE.BoxGeometry(len, WALL_H, WALL_T), len, WALL_H, WALL_T, 3) : boxUV(new THREE.BoxGeometry(WALL_T, WALL_H, len), WALL_T, WALL_H, len, 3);
    const m = new THREE.Mesh(geo, mats);
    if (p.axis === 'x') m.position.set(mid, WALL_H / 2, p.at); else m.position.set(p.at, WALL_H / 2, mid);
    m.receiveShadow = true; m.userData.wall = true;
    scene.add(m);
    const sk = p.axis === 'x'
      ? box(len, 0.14, WALL_T + 0.04, skirtMat, mid, 0.07, p.at)
      : box(WALL_T + 0.04, 0.14, len, skirtMat, p.at, 0.07, mid);
    void sk;
  };
  for (const p of LAYOUT.pieces) {
    // split where the room on either side changes, so each stretch gets the right colours
    const parts = [];
    let cur = null;
    // look at the room on each side in the MIDDLE of every 25 cm cell, never exactly on a room boundary
    // (a boundary can belong to either room, which used to paint the last stretch of a wall in the wrong colour)
    const step = 0.25, cells = Math.max(1, Math.ceil((p.to - p.from) / step - 1e-9));
    for (let i = 0; i < cells; i++) {
      const a = p.from + i * step, b = Math.min(p.to, a + step), mid = (a + b) / 2;
      const rp = LAYOUT.sideRoom(p, mid, 1), rn = LAYOUT.sideRoom(p, mid, -1);
      const key = `${rp ? rp.id : '-'}|${rn ? rn.id : '-'}`;
      if (cur && cur.key === key) cur.to = b;
      else { if (cur) parts.push(cur); cur = { from: a, to: b, key, rp, rn }; }
    }
    if (cur) { cur.to = p.to; parts.push(cur); }
    parts.forEach((q, i) => wallBox(p, q.from, q.to, i === 0 && p.extendA, i === parts.length - 1 && p.extendB, q.rp, q.rn));
  }
  // doorways: a header above, dark trim around
  const wallPiece = (axis, at, a, b, y, h, mat, t = WALL_T) => {
    const len = b - a, mid = (a + b) / 2;
    return axis === 'x' ? box(len, h, t, mat, mid, y, at) : box(t, h, len, mat, at, y, mid);
  };
  for (const d of LAYOUT.doors) {
    const probe = { axis: d.axis, at: d.at };
    const mid = (d.from + d.to) / 2;
    const rp = LAYOUT.sideRoom(probe, mid, 1), rn = LAYOUT.sideRoom(probe, mid, -1);
    const cp = roomHex(rp) ?? C.wall, cn = roomHex(rn) ?? cp;
    const len = d.to - d.from, hh = WALL_H - DOOR_H, y = (DOOR_H + WALL_H) / 2;
    const mats = new Array(6).fill(wallMat(cp));
    if (d.axis === 'x') { mats[5] = wallMat(cn); } else { mats[1] = wallMat(cn); }
    const header = new THREE.Mesh(d.axis === 'x' ? boxUV(new THREE.BoxGeometry(len, hh, WALL_T), len, hh, WALL_T, 3) : boxUV(new THREE.BoxGeometry(WALL_T, hh, len), WALL_T, hh, len, 3), mats);
    if (d.axis === 'x') header.position.set(mid, y, d.at); else header.position.set(d.at, y, mid);
    scene.add(header);
    wallPiece(d.axis, d.at, d.from, d.from + 0.1, DOOR_H / 2, DOOR_H, trimMat, WALL_T + 0.06);
    wallPiece(d.axis, d.at, d.to - 0.1, d.to, DOOR_H / 2, DOOR_H, trimMat, WALL_T + 0.06);
    wallPiece(d.axis, d.at, d.from, d.to, DOOR_H - 0.05, 0.1, trimMat, WALL_T + 0.06);
  }

  /* ── Ceiling track spotlights: a visible fixture over every photo, aimed at it ── */
  const railMat = new THREE.MeshStandardMaterial({ color: C.rail, roughness: 0.5, metalness: 0.5 });
  const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.35, metalness: 0.7 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const spotRigs = [];
  const housingGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.3, 20).rotateX(PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.062, 24);
  const stemGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);

  function addSpotFixture(p, sz) {
    const n = new THREE.Vector3(Math.sin(p.ry), 0, Math.cos(p.ry));          // points out of the wall
    const target = new THREE.Vector3(p.x, sz.y, p.z);
    const out = Math.min(1.8, Math.max(1.2, sz.w * 0.75));                    // closer in narrow passages
    const pos = new THREE.Vector3(p.x + n.x * out, WALL_H - 0.55, p.z + n.z * out);
    const alongX = Math.abs(n.z) > 0.5;                                      // rail runs parallel to the wall

    box(alongX ? 1.5 : 0.06, 0.06, alongX ? 0.06 : 1.5, railMat, pos.x, WALL_H - 0.05, pos.z);
    const stemLen = 0.38;
    const stem = new THREE.Mesh(stemGeo, fixtureMat);
    stem.scale.y = stemLen; stem.position.set(pos.x, WALL_H - 0.08 - stemLen / 2, pos.z);
    scene.add(stem);

    const g = new THREE.Group();
    g.position.copy(pos);
    const housing = new THREE.Mesh(housingGeo, fixtureMat); housing.position.z = 0.05;
    const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.z = 0.202;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), fixtureMat); yoke.position.set(0, 0.1, -0.02);
    g.add(housing, lens, yoke);
    g.lookAt(target);
    scene.add(g);

    const dir = target.clone().sub(pos).normalize();
    const dist = pos.distanceTo(target);
    spotRigs.push({
      pos: pos.clone().addScaledVector(dir, 0.2),
      target,
      dist,
      angle: Math.min(0.85, Math.max(0.3, Math.atan((Math.max(sz.w, sz.h) / 2 + 0.7) / dist))),
      intensity: 7 * dist * dist,
    });
  }

  let carpetMesh = null;
  /* ── The red carpet: lobby door, round the heart, through the rooms, out to the garden ──
     The whole route is painted into one texture so the turns and the gold borders join cleanly. */
  {
    const K = LAYOUT.carpet, P = K.path, S = 48, W = K.w;
    const X0 = Math.min(...P.map(p => p[0]), ...K.discs.map(d => d.x - d.r)) - 0.5, X1 = Math.max(...P.map(p => p[0]), ...K.discs.map(d => d.x + d.r)) + 0.5;
    const Z0 = Math.min(...P.map(p => p[1]), ...K.discs.map(d => d.z - d.r)) - 0.5, Z1 = Math.max(...P.map(p => p[1]), ...K.discs.map(d => d.z + d.r)) + 0.5;
    const cw = Math.ceil((X1 - X0) * S), ch = Math.ceil((Z1 - Z0) * S);
    const tex = canvasTex(cw, ch, g => {
      const px = x => (x - X0) * S, pz = z => (z - Z0) * S;        // canvas top = north, like the plane below
      g.lineJoin = 'miter'; g.lineCap = 'butt'; g.miterLimit = 4;
      // every turn is a smooth arc, as wide as the neighbouring straight runs allow
      const segLen = i => Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      const R = P.map((_, i) => (i === 0 || i === P.length - 1 ? 0 : Math.min(2.6, Math.min(segLen(i - 1), segLen(i)) / 2 - 0.15)));
      const strip = (col, wm) => {
        g.strokeStyle = col; g.lineWidth = wm * S; g.beginPath(); g.moveTo(px(P[0][0]), pz(P[0][1]));
        for (let i = 1; i < P.length - 1; i++) g.arcTo(px(P[i][0]), pz(P[i][1]), px(P[i + 1][0]), pz(P[i + 1][1]), R[i] * S);
        g.lineTo(px(P[P.length - 1][0]), pz(P[P.length - 1][1])); g.stroke();
      };
      const discs = (col, grow) => K.discs.forEach(d => { g.fillStyle = col; g.beginPath(); g.arc(px(d.x), pz(d.z), (d.r + grow) * S, 0, PI * 2); g.fill(); });
      // plain red with a slim light-gold border (the same on the round rugs)
      for (const [col, d] of [['#dac592', 0.14], ['#a3182b', 0.0]]) { strip(col, W + d); discs(col, d / 2); }
      // a very fine pile so the red is not flat: speckle only where there is carpet
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < cw * ch / 40; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.025)';
        g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
      }    }, 1, 1);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(cw / S, ch / S), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.97, metalness: 0, alphaTest: 0.5, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    carpet.rotation.x = -PI / 2;
    carpet.position.set(X0 + cw / S / 2, 0.014, Z0 + ch / S / 2);
    carpet.receiveShadow = true;
    scene.add(carpet);
    carpetMesh = carpet;
  }

  /* ── Foyer: dark feature wall behind the first photo, and the dedication beside the door ── */
  const feat = PHOTO_SPOTS[0];
  box(feat.size.w + 1.7, 4.4, 0.06, panelMat, feat.x, 2.3, -2 + 0.18);
  box(6.0, 3.0, 0.06, panelMat, 8, 2.2, -2 + 0.18);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.4), new THREE.MeshBasicMaterial({
    map: canvasTex(900, 400, (g, w, h) => {
      g.fillStyle = '#15151a'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.fillStyle = '#9a948a';
      g.font = '500 24px Inter, sans-serif'; g.fillText('A  PERMANENT  COLLECTION', w / 2, 70);
      g.fillStyle = '#efe9dc'; g.font = '500 92px "Cormorant Garamond", Georgia, serif'; g.fillText('Welcome', w / 2, 168);
      g.fillStyle = '#b8b0a2'; g.font = 'italic 34px "Cormorant Garamond", Georgia, serif';
      const words = config.dedication.split(' '); let line = '', y = 232;
      for (const wd of words) { if (g.measureText(line + wd).width > w - 120) { g.fillText(line, w / 2, y); y += 40; line = ''; } line += wd + ' '; }
      g.fillText(line, w / 2, y);
      g.fillStyle = '#efe9dc'; g.fillText('Enjoy the walk', w / 2, 360);
    }),
    toneMapped: false,
  }));
  plaque.position.set(8, 2.2, -2 + 0.22);
  scene.add(plaque);

  /* ── Photo frames ── */
  const photoFrames = [];
  let photoClock = 0, lastSharpen = 0, lastTrickle = 0;
  const loader = new THREE.TextureLoader();
  PHOTO_SPOTS.forEach((p, idx) => {
    const sz = p.size;
    const caption = captionFor(idx);
    const grp = new THREE.Group();

    const frame = new THREE.Mesh(new THREE.BoxGeometry(sz.w, sz.h, 0.06), frameMat);
    frame.castShadow = true;
    grp.add(frame);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(sz.w - 0.12, sz.h - 0.12), matMat);
    mat.position.z = 0.032; grp.add(mat);

    const pw = sz.w - 0.3, ph = sz.h - 0.3;
    const pc = placeholderCanvas(Math.max(64, Math.round(pw * 120)), Math.max(64, Math.round(ph * 120)), idx);
    const pTex = new THREE.CanvasTexture(pc); pTex.colorSpace = THREE.SRGBColorSpace; pTex.anisotropy = 8;
    // Shown exactly as photographed: unlit and not tone-mapped, so no light can wash out, tint or glare on the picture
    const photoMat = new THREE.MeshBasicMaterial({ map: pTex, toneMapped: false });
    const photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
    photoPlane.position.z = 0.036; photoPlane.name = 'photo';
    grp.add(photoPlane);

    const wash = new THREE.Mesh(new THREE.PlaneGeometry(sz.w + 2.4, sz.h + 2.2), new THREE.MeshBasicMaterial({
      map: washTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32, toneMapped: false,
    }));
    wash.position.z = -0.035; grp.add(wash);

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), new THREE.MeshStandardMaterial({ map: plateTexture(caption, idx + 1), roughness: 0.6 }));
    plate.position.set(sz.w / 2 + 0.38, -sz.h / 2 + 0.3, -0.03);
    grp.add(plate);

    grp.position.set(p.x, sz.y, p.z);
    grp.rotation.y = p.ry;
    scene.add(grp);
    addSpotFixture(p, sz);

    const src = `./photos/${PHOTOS[idx].file}`;
    const entry = { group: grp, photoPlane, wash: wash.material, spot: p, size: sz, index: idx, caption, url: src, canvas: pc, _dataURL: null };
    entry.getViewerURL = () => { if (!LOW_MEM) entry.loadFull(); return entry.url; };      // the viewer shows the full file as an image; on a phone the wall keeps the small preview
    photoFrames.push(entry);

    // A small preview is on the wall straight away; the full-size picture is fetched when you come near (or, in the background, a bit later)
    let thumbTex = null, fullTex = null;
    entry.loadFull = () => {
      if (entry._full) return;
      entry._full = true;
      loader.load(src, tex => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = LOW_MEM ? 4 : 8;
        if (!entry._full) { tex.dispose(); return; }             // you walked away again before it arrived
        fullTex = tex; photoMat.map = tex; photoMat.needsUpdate = true;
        entry._fullDone = true;                                  // (a slow preview arriving later must not replace it)
        if (!LOW_MEM) { thumbTex?.dispose(); thumbTex = null; }
      }, undefined, () => { if (!thumbTex) { entry.url = null; entry.getViewerURL = () => (entry._dataURL ||= pc.toDataURL('image/jpeg', 0.85)); } });
    };
    // on a phone only the pictures nearest you are held at full size; the rest go back to their small preview
    entry.unloadFull = () => {
      if (!entry._full || !thumbTex) return;
      entry._full = false; entry._fullDone = false;
      photoMat.map = thumbTex; photoMat.needsUpdate = true;
      fullTex?.dispose(); fullTex = null;
    };
    loader.load(`./photos/t/${PHOTOS[idx].file}`, tex => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      if (entry._fullDone && !LOW_MEM) { tex.dispose(); return; }
      thumbTex = tex; if (!entry._fullDone) { photoMat.map = tex; photoMat.needsUpdate = true; }
    }, undefined, () => entry.loadFull());                       // no previews on disk: load the full picture instead
  });

  /* ── Benches ── */
  const benchMeshes = [];
  for (const b of BENCH_SPOTS) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.35, 0.5, 3, 0.025), benchSeatMat);
    body.position.y = 0.255; body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.38), benchBaseMat);
    plinth.position.y = 0.04;
    grp.add(plinth);
    grp.position.set(b.x, 0, b.z);
    grp.rotation.y = b.ry;
    scene.add(grp);
    benchMeshes.push({ group: grp, spot: b });
  }

  /* ── Plants: real scanned models, placed once loaded ── */
  const plinthMat = whiteMat;
  const placePlant = (models, kind, x, y, z, scale) => {
    const src = models[kind];
    if (!src) return null;
    const p = src.clone(true);
    p.position.set(x, y, z);
    p.rotation.y = rand() * PI * 2;
    p.scale.setScalar(scale);
    scene.add(p);
    return p;
  };
  loadPlantModels().then(models => {
    PLANTS.forEach(p => {
      if (p.t === 'tree') placePlant(models, 'tall', p.x, 0, p.z, 1.1 + rand() * 0.25);
      else if (p.t === 'bush') placePlant(models, 'medium', p.x, 0, p.z, 1.0 + rand() * 0.25);
      else {
        // small succulent on a white display plinth
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.42), plinthMat);
        plinth.position.set(p.x, 0.425, p.z); plinth.castShadow = true; plinth.receiveShadow = true;
        scene.add(plinth);
        placePlant(models, 'small', p.x, 0.85, p.z, 1.6);
      }
    });
    // garden island: one big tree, ringed by medium plants and succulents
    placePlant(models, 'tall', PLANTER.x, 0.5, PLANTER.z, 1.9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2, rr = PLANTER.r - 0.7;
      const px = PLANTER.x + Math.cos(a) * rr, pz = PLANTER.z + Math.sin(a) * rr;
      if (i % 2) placePlant(models, 'medium', px, 0.5, pz, 1.0);
      else placePlant(models, 'small', px, 0.5, pz, 2.2);
    }
  });

  /* ── Sculpture pedestals ── */
  for (const p of PEDESTALS) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), whiteMat);
    ped.position.set(p.x, 0.5, p.z); ped.castShadow = true; ped.receiveShadow = true;
    scene.add(ped);
    let art;
    if (p.kind === 'sphere') art = new THREE.Mesh(new THREE.SphereGeometry(0.27, 40, 28), roseGold);
    else if (p.kind === 'knot') art = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.065, 140, 18), brass);
    else if (p.kind === 'torus') art = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 24, 56), marble);
    else {
      art = new THREE.Group();
      [0.22, 0.17, 0.12].forEach((r, i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), i === 1 ? roseGold : marble);
        s.position.y = [0.2, 0.55, 0.85][i] - 0.1; art.add(s);
      });
    }
    art.position.set(p.x, 1.0 + 0.3, p.z);
    art.castShadow = true;
    scene.add(art);
  }

  /* ── Foyer centrepiece: a heart on a round pedestal ── */
  const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.9, 40), whiteMat);
  hp.position.set(HEART_PEDESTAL.x, 0.45, HEART_PEDESTAL.z); hp.castShadow = true;
  scene.add(hp);
  const bigHeart = new THREE.Mesh(heartGeometry(1.0), roseGold);
  bigHeart.position.set(HEART_PEDESTAL.x, 0.9 + 0.62, HEART_PEDESTAL.z);
  bigHeart.castShadow = true;
  scene.add(bigHeart);

  /* ── Garden: round planter island with a tall tree ── */
  const island = new THREE.Mesh(new THREE.CylinderGeometry(PLANTER.r, PLANTER.r + 0.1, 0.5, 48), new THREE.MeshPhysicalMaterial({ ...pbr('marble_01', 3, 0.5, 0.5), color: 0xffffff, roughness: 1, clearcoat: 0.7, clearcoatRoughness: 0.12 }));
  island.position.set(PLANTER.x, 0.25, PLANTER.z); island.receiveShadow = true; island.castShadow = true;
  scene.add(island);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(PLANTER.r - 0.12, 48), soilMat);
  dirt.rotation.x = -PI / 2; dirt.position.set(PLANTER.x, 0.51, PLANTER.z);
  scene.add(dirt);

  // Small floating hearts in the garden
  const floatHearts = [];
  const heartMat = new THREE.MeshPhysicalMaterial({ color: 0xe0606c, roughness: 0.25, clearcoat: 0.8, emissive: 0x401015 });
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(heartGeometry(0.22 + rand() * 0.1), heartMat);
    const a = rand() * PI * 2, rr = 3.6 + rand() * 4;
    h.position.set(PLANTER.x + Math.cos(a) * rr, 2.6 + rand() * 1.4, PLANTER.z + Math.sin(a) * rr * 0.9);
    h.userData = { y0: h.position.y, ph: rand() * 6, sp: 0.6 + rand() * 0.6 };
    scene.add(h); floatHearts.push(h);
  }

  /* ── Lights ── */
  const ambient = new THREE.AmbientLight(0xfff6ea, 0.4);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0xb8aea0, 0.5);
  scene.add(hemi);
  const garden = new THREE.PointLight(0xfff2dd, 60, 22, 2);
  garden.position.set(GCX, WALL_H - 0.6, GCZ);
  scene.add(garden);

  /* Real spotlights: a pool that follows the visitor to the nearest photos (fixed light count,
     no shadows, cheap on phones). Each fades in/out as it moves between photos. */
  const env = { spotBoost: 1, gardenCenter: { x: GCX, z: GCZ } };   // the day/night cycle scales the spotlights through this
  const POOL = 8;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.SpotLight(0xfff1dc, 0, 10, 0.5, 0.65, 2);
    l.castShadow = false;
    scene.add(l, l.target);
    pool.push({ light: l, idx: -1, k: 0, want: 0 });
  }
  const rigK = new Float32Array(spotRigs.length);

  function updateSpots(dt, focus) {
    if (!focus) return;
    const ranked = spotRigs
      .map((r, i) => ({ i, d: Math.hypot(r.target.x - focus.x, r.target.z - focus.z) }))
      .sort((a, b) => a.d - b.d).slice(0, POOL).map(o => o.i);
    const wanted = new Set(ranked);

    for (const s of pool) {
      if (s.idx >= 0 && !wanted.has(s.idx)) s.want = 0;
      if (s.idx >= 0 && s.want === 0 && s.k < 0.02) s.idx = -1;
    }
    const held = new Set(pool.filter(s => s.idx >= 0 && s.want === 1).map(s => s.idx));
    for (const i of ranked) {
      if (held.has(i)) continue;
      const free = pool.find(s => s.idx < 0);
      if (!free) break;
      const r = spotRigs[i];
      free.idx = i; free.want = 1; free.k = 0;
      free.light.position.copy(r.pos);
      free.light.target.position.copy(r.target);
      free.light.angle = r.angle;
      free.light.distance = r.dist * 1.7;
      held.add(i);
    }

    const f = 1 - Math.exp(-5 * dt);
    rigK.fill(0);
    for (const s of pool) {
      s.k += (s.want - s.k) * f;
      const r = s.idx >= 0 ? spotRigs[s.idx] : null;
      s.light.intensity = r ? r.intensity * s.k * env.spotBoost : 0;
      if (r) rigK[s.idx] = Math.max(rigK[s.idx], s.k);
    }
    // the painted-on glow hands over to the real light as it fades in
    for (let i = 0; i < photoFrames.length; i++) photoFrames[i].wash.opacity = 0.34 * (1 - 0.85 * rigK[i]);
  }

  const dirLight = new THREE.DirectionalLight(0xfff0d8, 1.1);
  dirLight.position.set(4, 9, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  Object.assign(dirLight.shadow.camera, { near: 0.5, far: 25, left: -6, right: 6, top: 6, bottom: -6 });
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight, dirLight.target);
  Object.assign(env, { sky, garden, ambient, hemi, dirLight });

  /* ── Places the little bird likes to sit ── */
  const perches = [];
  for (const f of photoFrames) {
    const sp = f.spot, sz = f.size;
    perches.push({ x: sp.x + Math.sin(sp.ry) * 0.02, y: sz.y + sz.h / 2 + 0.03, z: sp.z + Math.cos(sp.ry) * 0.02, yaw: sp.ry, halfW: Math.max(0.1, sz.w / 2 - 0.3) });
  }
  for (const p of PEDESTALS) perches.push({ x: p.x + 0.2, y: 1.0, z: p.z + 0.2, yaw: PI / 4 });
  for (const b of BENCH_SPOTS) {
    for (const s of [-1, 1]) perches.push({ x: b.x + Math.cos(b.ry) * 1.05 * s, y: SEAT_TOP, z: b.z - Math.sin(b.ry) * 1.05 * s, yaw: b.face });
  }
  for (const p of PLANTS) if (p.t === 'tree') perches.push({ x: p.x, y: 1.55, z: p.z, yaw: rand() * PI * 2 });
  perches.push({ x: HEART_PEDESTAL.x, y: 2.05, z: HEART_PEDESTAL.z, yaw: 0 });
  perches.push({ x: PLANTER.x, y: 2.9, z: PLANTER.z, yaw: PI });

  return {
    env,
    carpet: carpetMesh,
    perches,
    photoFrames,
    benchMeshes,
    update(dt, focus) {
      updateSpots(dt, focus);
      // sharpen the pictures you are near, then (after a few quiet seconds) the rest, one at a time
      photoClock += dt;
      if (focus && LOW_MEM && photoClock - lastSharpen > 0.5) {
        lastSharpen = photoClock;
        const near = photoFrames.map(e => [Math.hypot(e.group.position.x - focus.x, e.group.position.z - focus.z), e]).sort((a, b) => a[0] - b[0]);
        near.forEach(([d, e], i) => { if (i < 4 && d < 9) e.loadFull(); else if (e._full && d > 11) e.unloadFull(); });
      }
      if (focus && !LOW_MEM && photoClock - lastSharpen > 0.5) {
        lastSharpen = photoClock;
        for (const e of photoFrames) if (!e._full && Math.hypot(e.group.position.x - focus.x, e.group.position.z - focus.z) < 18) e.loadFull();
        if (photoClock > 8 && photoClock - lastTrickle > 1.2) {
          lastTrickle = photoClock;
          let best = null, bd = Infinity;
          for (const e of photoFrames) if (!e._full) { const d = Math.hypot(e.group.position.x - focus.x, e.group.position.z - focus.z); if (d < bd) { bd = d; best = e; } }
          best?.loadFull();
        }
      }
      bigHeart.rotation.y += dt * 0.6;
      const t = performance.now() / 1000;
      for (const h of floatHearts) {
        h.position.y = h.userData.y0 + Math.sin(t * h.userData.sp + h.userData.ph) * 0.15;
        h.rotation.y += dt * 0.5;
      }
      if (focus) {
        dirLight.target.position.set(focus.x, 0, focus.z);
        dirLight.position.set(focus.x + 4, 9, focus.z + 4);
      }
    },
  };
}
