import * as THREE from 'three';
import { ParticleField } from './Particles.js';
import { sound } from './Sound.js';
import { sideToward } from './Social.js';

/**
 * Three small things for the two of you:
 *  - T: dance together. Both of you step to marks facing each other and dance the same dance
 *  - R: rest your head on your partner's shoulder while you sit side by side
 *  - holding hands leaves a trail of little hearts on the floor behind you
 */

const GAP = 1.1;              // how far apart you dance
const WALK_IN = 1.0;          // seconds to step to the marks
const CLIP = 'dance2';
const TRAIL_STEP = 0.55;      // metres between two hearts
const TRAIL_LIFE = 5;         // seconds a heart stays
const wrapPi = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export const LEAN = { head: 0.62, neck: 0.2, chest: 0.09 };         // how far each bone tips toward the partner (radians); tuned so the head rests on the shoulder
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** tilt the head toward the partner's shoulder (k = 0..1) on top of whatever the animation is doing */
function leanPose(vrm, side, k) {
  const h = vrm?.humanoid;
  if (!h) return;
  const dir = side === 'left' ? 1 : -1;
  for (const [name, z] of [['head', LEAN.head], ['neck', LEAN.neck], ['upperChest', LEAN.chest]]) {
    const n = h.getNormalizedBoneNode(name);
    if (n) n.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, -z * dir * k)));
  }
}

function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 8, 8, 32, 20);
  g.bezierCurveTo(56, 8, 60, 36, 32, 56);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTogether({ scene, tpCamera, getLocal, getRemotes, getNet, social, showToast, playLocal, isBusy }) {
  const net = () => getNet();
  const partner = () => getRemotes()[0] || null;
  const typing = e => e.target?.closest?.('input,textarea');

  /* ── lean on a shoulder ── */
  let leaning = false, leanK = 0;
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyR' || e.repeat || typing(e)) return;
    const me = getLocal();
    if (!me) return;
    if (leaning) { leaning = false; return; }
    if (!me.sitting || !social.together) { showToast('Sit next to each other first (F), then press R to rest your head', 3200); return; }
    leaning = true;
    showToast('Resting on their shoulder', 2200);
  });

  /* ── dance together ── */
  let go = null;
  const sparkles = new ParticleField(scene, { kind: 'sparkle', count: 60, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0, y1: 2.6, size: 0.14, color: 0xffd98a, reach: 60 });
  sparkles.setAlpha(0);

  function computeMarks(me, p) {
    const bp = me.type === 'boy' ? me.wrapper.position : p.wrapper.position;
    const gp = me.type === 'boy' ? p.wrapper.position : me.wrapper.position;
    let ux = gp.x - bp.x, uz = gp.z - bp.z;
    const len = Math.hypot(ux, uz) || 1; ux /= len; uz /= len;
    const mx = (bp.x + gp.x) / 2, mz = (bp.z + gp.z) / 2;
    return { b: [mx - ux * GAP / 2, mz - uz * GAP / 2], g: [mx + ux * GAP / 2, mz + uz * GAP / 2], u: [ux, uz], m: [mx, mz] };
  }

  function begin(marks) {
    const me = getLocal();
    if (!me || go || me.sitting) return;
    social.release?.();
    const my = me.type === 'boy' ? marks.b : marks.g;
    const face = me.type === 'boy' ? Math.atan2(marks.u[0], marks.u[1]) : Math.atan2(-marks.u[0], -marks.u[1]);
    go = { marks, my, face, t: 0, played: false, walking: false };
    playLocal('idle');
  }

  function finish() {
    if (!go) return;
    tpCamera.rotX = go.face + Math.PI;                // the camera returns to behind the player
    tpCamera.setFocus(null);
    go = null;
  }

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyT' || e.repeat || typing(e)) return;
    const me = getLocal(), p = partner();
    if (go || !me) return;
    if (!p) { showToast('Your partner is not here yet', 2200); return; }
    if (isBusy?.()) { showToast('Not right now', 1600); return; }
    const d = Math.hypot(p.wrapper.position.x - me.wrapper.position.x, p.wrapper.position.z - me.wrapper.position.z);
    if (me.sitting || d > 4) { showToast('Stand close to each other first', 2400); return; }
    const marks = computeMarks(me, p);
    net()?.send({ t: 'dance', marks });
    begin(marks);
  });
  getNet()?.on?.('dance', m => {
    const me = getLocal(), p = partner();
    if (go || !me || !p || me.sitting || isBusy?.()) return;
    const ok = k => Array.isArray(m.marks?.[k]) && m.marks[k].length === 2 && m.marks[k].every(Number.isFinite);
    if (!['b', 'g', 'u', 'm'].every(ok)) return;
    showToast('Your partner wants to dance with you', 2600);
    begin(m.marks);
  });

  /* ── a trail of hearts while you hold hands ── */
  const tex = heartTexture();
  const geo = new THREE.PlaneGeometry(0.3, 0.3);
  const prints = Array.from({ length: 48 }, () => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    mesh.rotation.order = 'YXZ'; mesh.visible = false; mesh.renderOrder = 5;
    scene.add(mesh);
    return { mesh, age: TRAIL_LIFE };
  });
  let nextPrint = 0, flip = 1;
  const lastAt = new Map();
  function drop(w) {
    const p = prints[nextPrint++ % prints.length];
    flip = -flip;
    p.age = 0; p.mesh.visible = true;
    p.mesh.material.color.set(flip > 0 ? 0xff7fa0 : 0xffc46b);
    p.mesh.position.set(w.position.x + Math.cos(w.rotation.y) * 0.13 * flip, w.position.y + 0.04, w.position.z - Math.sin(w.rotation.y) * 0.13 * flip);
    p.mesh.rotation.set(-Math.PI / 2, w.rotation.y + Math.PI, 0);
  }

  return {
    get busy() { return go !== null; },
    get leaning() { return leaning; },
    tune: LEAN,
    /** call after the animations are applied and before vrm.update */
    applyPose() {
      const me = getLocal(), p = partner();
      if (leanK > 0.002 && me && p) leanPose(me.vrm, sideToward(me.wrapper, p.wrapper.position), leanK);
    },
    poseRemote(e) {
      const me = getLocal();
      e.leanK = (e.leanK || 0) + ((e.lean ? 1 : 0) - (e.leanK || 0)) * 0.06;
      if (e.leanK > 0.002 && me) leanPose(e.vrm, sideToward(e.wrapper, me.wrapper.position), e.leanK);
    },
    update(dt) {
      const me = getLocal(), p = partner();

      if (leaning && (!me?.sitting || !p || !social.together)) leaning = false;
      leanK += ((leaning ? 1 : 0) - leanK) * (1 - Math.exp(-3 * dt));

      // hearts under your feet while you walk hand in hand
      if (social.holding && me && p) {
        for (const [id, w] of [['me', me.wrapper], ['them', p.wrapper]]) {
          const last = lastAt.get(id);
          if (!last) { lastAt.set(id, { x: w.position.x, z: w.position.z }); continue; }
          if (Math.hypot(w.position.x - last.x, w.position.z - last.z) > TRAIL_STEP) { drop(w); last.x = w.position.x; last.z = w.position.z; }
        }
      } else lastAt.clear();
      for (const pr of prints) {
        if (!pr.mesh.visible) continue;
        pr.age += dt;
        if (pr.age >= TRAIL_LIFE) { pr.mesh.visible = false; continue; }
        pr.mesh.material.opacity = 0.85 * Math.min(1, pr.age * 6, (TRAIL_LIFE - pr.age) / 1.5);
        pr.mesh.scale.setScalar(0.8 + 0.3 * Math.min(1, pr.age * 4));
      }

      if (!go) { sparkles.setAlpha(Math.max(0, sparkles.alpha - dt * 0.8)); sparkles.update(dt, null); return; }

      // ── the dance ──
      go.t += dt;
      const w = me.wrapper;
      if (go.t < WALK_IN) {
        const k = 1 - Math.exp(-7 * dt);
        const dist = Math.hypot(go.my[0] - w.position.x, go.my[1] - w.position.z);
        w.position.x += (go.my[0] - w.position.x) * k;
        w.position.z += (go.my[1] - w.position.z) * k;
        w.rotation.y += wrapPi(go.face - w.rotation.y) * k;
        if (dist > 0.12 && !go.walking) { go.walking = true; playLocal('walk'); }
        if (dist <= 0.12 && go.walking) { go.walking = false; playLocal('idle'); }
      } else {
        w.position.x = go.my[0]; w.position.z = go.my[1]; w.rotation.y = go.face;
        if (!go.played) {
          go.played = true;
          playLocal(CLIP, true);
          sound.sparkle();
          // frame the two of them from the side
          const m = go.marks.m, px = -go.marks.u[1], pz = go.marks.u[0];
          tpCamera.setFocus(new THREE.Vector3(m[0] + px * 4.2, 1.6, m[1] + pz * 4.2), new THREE.Vector3(m[0], 1.1, m[1]));
          sparkles.setRect({ x1: m[0] - 1.4, x2: m[0] + 1.4, z1: m[1] - 1.4, z2: m[1] + 1.4 });
        }
        sparkles.setAlpha(Math.min(1, sparkles.alpha + dt * 0.9));
      }
      sparkles.update(dt, null);
      // the dance ends when the clip does, or as soon as either of you walks off
      if (go.played && go.t > WALK_IN + 0.8 && me.anim !== CLIP) finish();
      else if (go.t > WALK_IN + 60) finish();
    },
  };
}
