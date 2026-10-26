import { ParticleField } from './Particles.js';
import { sound } from './Sound.js';

/**
 * A kiss for two. Stand close and press K; your partner presses K too. You both step to marks
 * 0.52 m apart, face each other, and your two halves of the paired animation play together.
 * The marks come from calibrating the clips: at that spacing the contact moment (2.0 s in)
 * lines up lips to lips and the lead-in/finish don't overlap.
 */

const GAP = 0.52;
const WALK_IN = 1.0;          // seconds to step to the marks
const KISS_LEN = 3.73;        // length of the kiss clips
const wrapPi = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export function createKiss({ scene, THREE, tpCamera, getLocal, getRemotes, getNet, social, showToast, playLocal, isBusy }) {
  let mine = false, theirs = false;
  let go = null;                 // the running sequence
  let waitT = 0, lastHint = -99;
  const net = () => getNet();
  const partner = () => getRemotes()[0] || null;

  const hearts = new ParticleField(scene, { kind: 'petal', count: 70, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0, y1: 2.6, size: 0.15, color: 0xff8fa8, reach: 60 });
  hearts.setAlpha(0);

  const setMine = v => { if (mine === v) return; mine = v; net()?.send({ t: 'kiss', on: v ? 1 : 0 }); };

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
    go = { marks, my, face, t: 0, played: false, walking: false, cam: false };
    playLocal('idle');
  }

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyK' || e.repeat || e.target?.closest?.('input,textarea')) return;
    const me = getLocal(), p = partner();
    if (go || !me) return;
    if (!p) { showToast('Your partner is not here yet', 2200); return; }
    if (isBusy?.()) { showToast('Not right now', 1600); return; }
    if (mine) { setMine(false); showToast('Maybe later', 1800); return; }
    const d = Math.hypot(p.wrapper.position.x - me.wrapper.position.x, p.wrapper.position.z - me.wrapper.position.z);
    if (me.sitting || d > 3) { showToast('Stand close to each other first', 2400); return; }
    setMine(true);
    showToast(theirs ? 'A kiss...' : 'Waiting for a yes...', 2200);
  });

  getNet()?.on?.('kiss', m => {
    theirs = !!m.on;
    if (theirs && !mine && !go) showToast('Your partner wants a kiss: press K', 4500);
  });
  // only if I asked too: a stale or stray message must never pull me into a kiss
  getNet()?.on?.('kiss-go', m => { if (!go && mine && Array.isArray(m.marks?.b) && Array.isArray(m.marks?.g) && Array.isArray(m.marks?.u) && Array.isArray(m.marks?.m)) begin(m.marks); });

  return {
    get busy() { return go !== null; },
    get asking() { return mine; },            // I want a kiss
    get asked() { return theirs; },           // my partner does
    update(dt) {
      const me = getLocal(), p = partner(), n = net();
      const d = me && p ? Math.hypot(p.wrapper.position.x - me.wrapper.position.x, p.wrapper.position.z - me.wrapper.position.z) : 99;
      const now = performance.now() / 1000;

      if (!go) {
        if (!p) { theirs = false; if (mine) setMine(false); }            // the partner left: forget what they asked
        if (mine && theirs && p && d < 3.4 && !me.sitting) {
          if (n.id < p.id) { const marks = computeMarks(me, p); n.send({ t: 'kiss-go', marks }); begin(marks); }
          else { waitT += dt; if (waitT > 2) { begin(computeMarks(me, p)); waitT = 0; } }
        } else waitT = 0;
        if (mine && (d > 4.5 || me?.sitting)) setMine(false);
        if (p && me && !mine && d < 2 && !me.sitting && now - lastHint > 45) { lastHint = now; showToast('Press K to kiss', 3000); }
        hearts.setAlpha(Math.max(0, hearts.alpha - dt * 0.8));
        hearts.update(dt, null);
        return;
      }

      // ── the sequence ──
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
          playLocal('kiss', true);
          // frame the two of them from the side
          const m = go.marks.m, ux = go.marks.u[0], uz = go.marks.u[1];
          const px = -uz, pz = ux;                                  // sideways
          tpCamera.setFocus(new THREE.Vector3(m[0] + px * 3.2, 1.55, m[1] + pz * 3.2), new THREE.Vector3(m[0], 1.28, m[1]));
          hearts.setRect({ x1: m[0] - 1.1, x2: m[0] + 1.1, z1: m[1] - 1.1, z2: m[1] + 1.1 });
        }
        if (go.t > WALK_IN + 1.5) hearts.setAlpha(Math.min(1, hearts.alpha + dt * 0.9));
        if (go.t > WALK_IN + 2.0 && !go.sounded) { go.sounded = true; sound.kiss(); }   // the moment the lips meet
      }
      hearts.update(dt, null);

      if (go.t > WALK_IN + KISS_LEN + 0.4) {
        tpCamera.rotX = go.face + Math.PI;                          // camera returns to behind the player
        tpCamera.setFocus(null);
        go = null; mine = false; theirs = false;
        net()?.send({ t: 'kiss', on: 0 });
      }
    },
  };
}
