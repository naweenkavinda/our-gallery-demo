import * as THREE from 'three';
import { sound } from './Sound.js';

/**
 * Blow a kiss and a stream of hearts drifts from your hand to the other person.
 * Watches every character's current animation, so it works for you and for your partner.
 */

const START = 0.75;          // seconds into the clip before the hand leaves the lips
const LEN = 1.9;             // how long hearts keep coming
const FLIGHT = 1.7;          // time for one heart to reach its target
const RATE = 11;             // hearts per second

let tex = null;
function heartTexture() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5f7e';
  g.beginPath(); g.moveTo(32, 56);
  g.bezierCurveTo(2, 34, 8, 6, 32, 20);
  g.bezierCurveTo(56, 6, 62, 34, 32, 56);
  g.fill();
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBlowKiss({ scene, getPlayers }) {
  const hearts = [];
  const emitters = new Map();     // id -> { t, acc }
  const lastAnim = new Map();
  const _v = new THREE.Vector3();

  function spawn(from, to, sway) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false, depthTest: false }));
    s.renderOrder = 40;
    s.scale.setScalar(0.01);
    scene.add(s);
    hearts.push({ s, from: from.clone(), to, t: 0, dur: FLIGHT * (0.85 + Math.random() * 0.3), size: 0.16 + Math.random() * 0.12,
      phase: Math.random() * 6.28, sway: sway * (0.6 + Math.random() * 0.8), lift: 0.15 + Math.random() * 0.25 });
  }

  return {
    /** a small burst of hearts rising from a point (used when a photo is taken) */
    burst(x, y, z, n = 14) {
      for (let i = 0; i < n; i++) {
        const from = new THREE.Vector3(x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 0.6);
        const to = new THREE.Vector3(from.x + (Math.random() - 0.5) * 1.6, y + 1.4 + Math.random() * 1.2, from.z + (Math.random() - 0.5) * 1.0);
        spawn(from, () => to, 0.1);
        hearts[hearts.length - 1].t = -Math.random() * 0.35;
      }
    },
    update(dt) {
      const players = getPlayers();
      // start or stop emitters as animations change
      for (const p of players) {
        const prev = lastAnim.get(p.id);
        if (p.anim === 'blowKiss' && prev !== 'blowKiss') {
          emitters.set(p.id, { t: 0, acc: 0 });
          setTimeout(() => sound.blow(p.wrapper.position), START * 1000);
        }
        if (p.anim !== 'blowKiss') emitters.delete(p.id);
        lastAnim.set(p.id, p.anim);
      }
      for (const [id, em] of emitters) {
        const p = players.find(q => q.id === id);
        if (!p) { emitters.delete(id); continue; }
        em.t += dt;
        if (em.t > START + LEN) { emitters.delete(id); continue; }
        if (em.t < START) continue;
        em.acc += dt * RATE;
        const other = players.find(q => q.id !== id);
        while (em.acc >= 1) {
          em.acc--;
          const ry = p.wrapper.rotation.y;
          const from = new THREE.Vector3(p.wrapper.position.x + Math.sin(ry) * 0.3, p.wrapper.position.y + 1.4, p.wrapper.position.z + Math.cos(ry) * 0.3);
          // fly to the other person's chest (wherever they are by then); with nobody around, drift forward
          const fwd = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
          const fallback = from.clone().addScaledVector(fwd, 3.5).setY(from.y + 0.2);
          spawn(from, () => other ? _v.set(other.wrapper.position.x, other.wrapper.position.y + 1.25, other.wrapper.position.z) : fallback, 0.35);
        }
      }
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.t += dt;
        if (h.t < 0) { h.s.visible = false; continue; }
        h.s.visible = true;
        const k = Math.min(1, h.t / h.dur), e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;     // eased, mostly even
        const to = h.to();
        h.s.position.lerpVectors(h.from, to, e);
        // wobble sideways and bob upward as it travels
        const dx = to.x - h.from.x, dz = to.z - h.from.z, len = Math.hypot(dx, dz) || 1;
        const w = Math.sin(h.phase + h.t * 6) * h.sway * Math.sin(k * Math.PI);
        h.s.position.x += (-dz / len) * w; h.s.position.z += (dx / len) * w;
        h.s.position.y += Math.sin(k * Math.PI) * h.lift;
        h.s.scale.setScalar(h.size * Math.min(1, k * 6) * (1 - Math.max(0, k - 0.8) * 3));
        h.s.material.opacity = k > 0.85 ? (1 - k) / 0.15 : 1;
        if (k >= 1) { scene.remove(h.s); h.s.material.dispose(); hearts.splice(i, 1); }
      }
    },
  };
}
