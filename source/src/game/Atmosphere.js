import * as THREE from 'three';
import { now as clockNow } from './Clock.js';

/**
 * Day and night, from the real clock where you are (add ?hour=21.5 to the address to try another
 * time). The garden skylight shows the sky: the sun crosses it by day, the moon and stars by night.
 * The whole gallery dims a little after dark and the picture spotlights glow warmer. In the Quiet Place
 * shooting stars cross the ceiling at night.
 */

// t is the real time of day: 0 = 06:00 sunrise, .25 = midday, .50 = 18:00 sunset, .58 = 20:00 dusk, .68 = 22:30 night, .96 = 05:00 first light
const KEYS = [
  { t: 0.00, sky: 0xffd2b0, light: 0xffd9b8, gi: 40, amb: 0.85, spot: 1.00, dir: 0.80, stars: 0.0 },
  { t: 0.25, sky: 0xcfe6ff, light: 0xfff2dd, gi: 70, amb: 1.00, spot: 1.00, dir: 1.10, stars: 0.0 },
  { t: 0.50, sky: 0xff9a6b, light: 0xffb88a, gi: 45, amb: 0.78, spot: 1.15, dir: 0.70, stars: 0.0 },
  { t: 0.58, sky: 0x1b2347, light: 0x9fb3ff, gi: 20, amb: 0.52, spot: 1.45, dir: 0.35, stars: 0.8 },
  { t: 0.68, sky: 0x0a0f2e, light: 0x8da2ff, gi: 14, amb: 0.45, spot: 1.60, dir: 0.25, stars: 1.0 },
  { t: 0.90, sky: 0x0a0f2e, light: 0x8da2ff, gi: 14, amb: 0.45, spot: 1.60, dir: 0.25, stars: 1.0 },
  { t: 0.96, sky: 0x4a3a66, light: 0xffc9a8, gi: 26, amb: 0.65, spot: 1.25, dir: 0.50, stars: 0.3 },
  { t: 1.00, sky: 0xffd2b0, light: 0xffd9b8, gi: 40, amb: 0.85, spot: 1.00, dir: 0.80, stars: 0.0 },
];
const _a = new THREE.Color(), _b = new THREE.Color();

function sample(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep((t - a.t) / (b.t - a.t), 0, 1);
  const L = (x, y) => x + (y - x) * k;
  return {
    sky: _a.set(a.sky).lerp(_b.set(b.sky), k).clone(),
    light: _a.set(a.light).lerp(_b.set(b.light), k).clone(),
    gi: L(a.gi, b.gi), amb: L(a.amb, b.amb), spot: L(a.spot, b.spot), dir: L(a.dir, b.dir), stars: L(a.stars, b.stars),
  };
}

function starTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 730;
  const g = c.getContext('2d');
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = Math.random() * 1.6 + 0.4;
    g.fillStyle = `rgba(255,255,${230 + Math.random() * 25},${0.5 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function discTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (kind === 'sun') { grad.addColorStop(0, 'rgba(255,250,225,1)'); grad.addColorStop(0.22, 'rgba(255,238,190,0.95)'); grad.addColorStop(0.3, 'rgba(255,214,140,0.35)'); grad.addColorStop(1, 'rgba(255,200,120,0)'); }
  else { grad.addColorStop(0, 'rgba(250,250,255,1)'); grad.addColorStop(0.3, 'rgba(240,244,255,0.95)'); grad.addColorStop(0.36, 'rgba(210,225,255,0.3)'); grad.addColorStop(1, 'rgba(180,200,255,0)'); }
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  if (kind === 'moon') { g.fillStyle = 'rgba(160,170,200,0.35)'; for (const [x, y, r] of [[54, 52, 7], [72, 66, 5], [58, 76, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function streakTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.85, 'rgba(255,248,230,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad; g.beginPath(); g.moveTo(0, 8); g.lineTo(256, 2); g.lineTo(256, 14); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAtmosphere(scene, env, wallH = 4.8, center = { x: 0, z: -54 }, darkRoom = null) {
  // sun and moon crossing the garden skylight (14 m x 10 m)
  const sunMat = new THREE.MeshBasicMaterial({ map: discTexture('sun'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const moonMat = new THREE.MeshBasicMaterial({ map: discTexture('moon'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), sunMat), moon = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), moonMat);
  for (const m of [sun, moon]) { m.rotation.x = Math.PI / 2; m.position.set(center.x, wallH - 0.011, center.z); scene.add(m); }
  let night = 0;

  // shooting stars across the Quiet Place's ceiling
  const trails = [];
  if (darkRoom) {
    const streak = streakTexture();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.09), new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.rotation.order = 'YXZ'; m.rotation.x = Math.PI / 2; m.visible = false;
      scene.add(m); trails.push({ m, t: 0, dur: 1, from: null, to: null, on: false });
    }
  }
  let nextStar = 3;
  const stars = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  stars.rotation.x = Math.PI / 2;
  stars.position.set(center.x, wallH - 0.013, center.z);
  scene.add(stars);

  const base = {
    amb: env.ambient.intensity, hemi: env.hemi.intensity, dir: env.dirLight.intensity,
  };
  let override = null;
  let dim = 1;

  return {
    /** 0..1 position in the day (sunrise 0, midday .25, sunset .5, night .85). */
    get phase() {
      if (override != null) return override;
      const d = clockNow(), h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      return (((h - 6) / 24) % 1 + 1) % 1;
    },
    /** 0 in daylight, 1 in the middle of the night */
    get night() { return night; },
    set phase(v) { override = v; },
    /** Other effects (like the sit-together mood) can dim the room through this. */
    get dim() { return dim; },
    set dim(v) { dim = v; },
    update(dt = 1 / 60) {
      const phase = this.phase;
      const s = sample(phase);
      night = s.stars;
      // the sun by day (06:00 to 18:30), the moon by night: each crosses the skylight and fades at the edges
      const arc = (t0, t1) => { const k = (phase - t0) / (t1 - t0); return k < 0 || k > 1 ? null : k; };
      const dk = arc(0.0, 0.53), nk = phase >= 0.55 ? (phase - 0.55) / 0.45 : null;
      const place = (mesh, k) => { mesh.position.set(center.x - 6.2 + 12.4 * k, mesh.position.y, center.z + 1.6 - Math.sin(k * Math.PI) * 3.2); };
      if (dk != null) { place(sun, dk); sunMat.opacity = Math.min(1, Math.sin(dk * Math.PI) * 3) * 0.95; } else sunMat.opacity = 0;
      if (nk != null) { place(moon, nk); moonMat.opacity = Math.min(1, Math.sin(nk * Math.PI) * 3) * 0.95; } else moonMat.opacity = 0;
      sun.visible = sunMat.opacity > 0.01; moon.visible = moonMat.opacity > 0.01;

      // shooting stars
      if (darkRoom) {
        nextStar -= dt;
        if (night > 0.6 && nextStar <= 0) {
          const tr = trails.find(x => !x.on);
          if (tr) {
            const ang = Math.random() * Math.PI * 2, len = 6 + Math.random() * 3;
            const cx = darkRoom.x1 + (darkRoom.x2 - darkRoom.x1) * (0.2 + Math.random() * 0.6), cz = darkRoom.z1 + (darkRoom.z2 - darkRoom.z1) * (0.2 + Math.random() * 0.6);
            tr.from = new THREE.Vector3(cx - Math.cos(ang) * len / 2, wallH - 0.02, cz - Math.sin(ang) * len / 2);
            tr.to = new THREE.Vector3(cx + Math.cos(ang) * len / 2, wallH - 0.02, cz + Math.sin(ang) * len / 2);
            tr.m.rotation.y = -ang; tr.t = 0; tr.dur = 0.8 + Math.random() * 0.5; tr.on = true; tr.m.visible = true;
          }
          nextStar = 4 + Math.random() * 7;
        }
        for (const tr of trails) {
          if (!tr.on) continue;
          tr.t += dt;
          const k = tr.t / tr.dur;
          if (k >= 1) { tr.on = false; tr.m.visible = false; continue; }
          tr.m.position.lerpVectors(tr.from, tr.to, k);
          tr.m.material.opacity = Math.sin(k * Math.PI) * 0.95;
        }
      }

      env.sky.material.color.copy(s.sky);
      env.garden.color.copy(s.light);
      env.garden.intensity = s.gi;
      env.ambient.intensity = base.amb * s.amb * dim;
      env.hemi.intensity = base.hemi * s.amb * dim;
      env.dirLight.intensity = base.dir * s.dir * dim;
      env.spotBoost = s.spot;
      stars.material.opacity = s.stars;
    },
  };
}
