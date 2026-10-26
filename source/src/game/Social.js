import * as THREE from 'three';
import { ParticleField } from './Particles.js';
import { sound } from './Sound.js';

/**
 * Two things that only exist when both of you are here:
 *  - sit on the same bench and the room softens (lights dim, petals and fireflies drift, camera pulls back)
 *  - press H next to each other to hold hands; one of you leads and the other walks alongside
 */

// How you stand and how the arms reach so the two inner hands meet (tuned by measuring the hands)
export const HOLD = { side: 0.5, upperZ: 1.28, upperY: 0, upperX: 0, lowerY: 0, lowerX: 0, lowerZ: 0, hand: 0, shortLift: 0.5, shortReach: 0.15 };
const SIDE = () => HOLD.side;

// Reach one arm toward the partner so the hands meet. A shorter character bends the elbow a little
// more so the two hands land at the same height.
function poseInnerArm(vrm, innerSide, hipsY = 0.95) {
  const h = vrm?.humanoid;
  if (!h) return;
  const dir = innerSide === 'left' ? 1 : -1;
  const short = Math.min(1, Math.max(0, (0.95 - hipsY) / 0.06));
  const upperZ = HOLD.upperZ + short * HOLD.shortReach, lowerZ = HOLD.lowerZ - short * HOLD.shortLift;
  const set = (name, x, y, z) => {
    const n = h.getNormalizedBoneNode(name);
    if (!n) return;
    n.rotation.order = 'ZYX';
    n.rotation.set(x, y, z);
  };
  set(`${innerSide}UpperArm`, HOLD.upperX, HOLD.upperY * dir, -upperZ * dir);
  set(`${innerSide}LowerArm`, HOLD.lowerX, HOLD.lowerY * dir, -lowerZ * dir);
  set(`${innerSide}Hand`, 0, 0, HOLD.hand * dir);
}

export function sideToward(wrapper, other) {
  const ry = wrapper.rotation.y;
  const dx = other.x - wrapper.position.x, dz = other.z - wrapper.position.z;
  return dx * Math.cos(ry) - dz * Math.sin(ry) >= 0 ? 'left' : 'right';
}

export function createSocial({ scene, atmosphere, tpCamera, getLocal, getRemotes, getNet, showToast, isBusy }) {
  const hint = document.createElement('div');
  hint.className = 'hold-hint'; hint.hidden = true;
  document.body.appendChild(hint);

  const petals = new ParticleField(scene, { kind: 'petal', count: 90, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0, y1: 3.4, size: 0.13, color: 0xffb3c6, reach: 40 });
  const flies = new ParticleField(scene, { kind: 'firefly', count: 34, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0.5, y1: 2.6, size: 0.2, color: 0xffe3a0, reach: 40 });
  petals.setAlpha(0); flies.setAlpha(0);

  let mood = 0, wasTogether = false, savedZoom = null;
  // H takes your partner's hand straight away (no need for them to agree); either of you lets go by pressing H again
  // The one who pressed H leads and walks; the other one follows alongside. Press H again to let go, and whoever takes the hand next leads.
  let holding = false, wasHolding = false, lastHint = -99, letGoBy = null, leading = false, leanProbe = null;

  const net = () => getNet();
  const partner = () => getRemotes()[0] || null;

  function setHold(v, by = 'me') {
    if (holding === v) return;
    holding = v;
    leading = v;
    if (!v) letGoBy = by;
    net()?.send({ t: 'hold', on: v ? 1 : 0 });
  }

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyH' || e.repeat || e.target?.closest?.('input,textarea')) return;
    const me = getLocal(), p = partner();
    if (!me || !p || me.sitting) return;
    if (holding) { setHold(false); return; }
    if (isBusy?.()) { showToast('Not right now', 1600); return; }
    const d = Math.hypot(p.wrapper.position.x - me.wrapper.position.x, p.wrapper.position.z - me.wrapper.position.z);
    if (d > 3.2) { showToast('Stand next to each other first', 2200); return; }
    setHold(true);
    showToast('You took their hand: you lead, they walk alongside', 2800);
  });

  // L: listen to our song together, once you are sitting side by side (both of you say yes)
  let lmine = false, ltheirs = false, listening = false, togetherNow = false;
  const setListen = v => { if (lmine === v) return; lmine = v; net()?.send({ t: 'listen', on: v ? 1 : 0 }); };
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyL' || e.repeat || e.target?.closest?.('input,textarea')) return;
    const me = getLocal(), p = partner();
    if (!me || !p) { showToast('Your partner is not here yet', 2200); return; }
    if (isBusy?.()) { showToast('Not right now', 1600); return; }
    if (!togetherNow) { showToast('Sit next to each other first (F on a bench, or the cushions in the Quiet Place)', 3500); return; }
    if (lmine) { setListen(false); showToast('Maybe later', 1800); return; }
    setListen(true);
    showToast(ltheirs ? 'Listening together' : 'Asking to listen together...', 2400);
  });
  getNet()?.on?.('listen', m => {
    ltheirs = !!m.on;
    if (ltheirs && !lmine && togetherNow) showToast('Your partner wants to listen to our song together: press L', 4500);
  });

  getNet()?.on?.('hold', m => {
    const on = !!m.on, was = holding;
    holding = on;
    if (on && !was) { leading = false; letGoBy = null; showToast('Your partner took your hand: they lead, you walk alongside', 3200); }
    if (on && was) leading = !!net()?.id && net().id < m.id;                         // we both reached for a hand at once: the lower id leads
    if (!on && was) { letGoBy = 'partner'; showToast('Your partner let go', 2200); sound.release(); }
  });

  return {
    release() { setHold(false); },
    setLeanProbe(fn) { leanProbe = fn; },
    tune: HOLD,                                   // the live numbers (for adjusting while testing)
    /** world distance between the two inner hands (and each hand's position), for tuning */
    debugHands() {
      const me = getLocal(), p = partner();
      if (!me?.vrm || !p?.vrm) return null;
      me.wrapper.updateMatrixWorld(true); p.wrapper.updateMatrixWorld(true);
      const hand = (vrm, side) => vrm.humanoid.getNormalizedBoneNode(`${side}Hand`).getWorldPosition(new THREE.Vector3());
      const a = hand(me.vrm, sideToward(me.wrapper, p.wrapper.position)), b = hand(p.vrm, sideToward(p.wrapper, me.wrapper.position));
      return { gap: +a.distanceTo(b).toFixed(3), a: a.toArray().map(v => +v.toFixed(2)), b: b.toArray().map(v => +v.toFixed(2)), apart: +Math.hypot(me.wrapper.position.x - p.wrapper.position.x, me.wrapper.position.z - p.wrapper.position.z).toFixed(2) };
    },
    get holding() { return holding; },
    get leading() { return leading; },
    get listening() { return listening; },
    get together() { return togetherNow; },       // sitting side by side on the same bench or cushions
    get listenAsking() { return lmine; },
    get listenAsked() { return ltheirs; },
    /** the target spot a follower should keep, or null */
    followTarget() {
      const me = getLocal(), p = partner(), n = net();
      if (!holding || !me || !p || !n) return null;
      if (leading) return null;                                  // the one who took the hand walks; the other follows
      const lw = p.wrapper, ry = lw.rotation.y;
      const lx = Math.cos(ry), lz = -Math.sin(ry);
      const rel = (me.wrapper.position.x - lw.position.x) * lx + (me.wrapper.position.z - lw.position.z) * lz;
      const s = rel >= 0 ? 1 : -1;
      return { x: lw.position.x + lx * SIDE() * s, z: lw.position.z + lz * SIDE() * s, yaw: ry, leaderSpeed: p.speed || 0 };
    },
    /** where on a bench to sit: shuffle over when your partner sits beside you */
    seatOffset(bench) {
      const p = partner(), n = net();
      if (!p || !n || !bench || bench.floor) return 0;               // cushions are one seat each
      const near = Math.hypot(p.wrapper.position.x - bench.group.position.x, p.wrapper.position.z - bench.group.position.z) < 1.5;
      if (!near || !/sit/.test(p.wantAnim || '')) return 0;
      let sp = bench.spacing ?? 0.45;                              // half the gap between the two of you
      if (leanProbe?.()) sp = Math.min(sp, 0.22);                  // head on a shoulder: sit so close that the head rests on the shoulder (measured: 0.44 apart, head tipped 0.62 rad)
      return n.id < p.id ? -sp : sp;
    },
    /** call after the animations are applied and before vrm.update */
    applyPose() {
      const me = getLocal(), p = partner();
      if (holding && me && p) poseInnerArm(me.vrm, sideToward(me.wrapper, p.wrapper.position), me.hipsY);
    },
    poseRemote(e) {
      const me = getLocal();
      if (e.hold && me && holding) poseInnerArm(e.vrm, sideToward(e.wrapper, me.wrapper.position), e.hipsY);
    },
    update(dt) {
      const me = getLocal(), p = partner();
      if (!p) { ltheirs = false; if (holding) { holding = false; net()?.send({ t: 'hold', on: 0 }); } if (lmine) setListen(false); }      // the partner left: forget what they asked

      // holding hands lasts until either of you presses H, walks off or sits down
      const d = me && p ? Math.hypot(p.wrapper.position.x - me.wrapper.position.x, p.wrapper.position.z - me.wrapper.position.z) : 99;
      if (holding && (d > 5 || me?.sitting)) { setHold(false, 'away'); showToast('You let go', 1800); sound.release(); }
      else if (letGoBy === 'me') { letGoBy = null; showToast('You let go', 1800); sound.release(); }
      else letGoBy = null;
      if (holding !== wasHolding && holding) sound.hold();
      wasHolding = holding;

      // gentle suggestion when the two of you are standing close
      const now = performance.now() / 1000;
      if (p && me && !holding && d < 2.2 && !me.sitting && now - lastHint > 40) {
        lastHint = now; showToast('Press H to hold hands, or K for a kiss', 3800);
      }
      hint.hidden = !holding;
      if (holding) hint.textContent = leading ? 'Holding hands  ·  you lead  ·  H to let go' : 'Holding hands  ·  walking with them  ·  H to let go';

      // sitting on the same bench
      const together = !!(me?.sitting && p && /sit/.test(p.wantAnim || '') && d < 2.2);
      togetherNow = together;
      const wasListening = listening;
      listening = lmine && ltheirs && together;
      if (lmine && !together) setListen(false);                      // someone stood up
      if (listening && !wasListening) { showToast('Listening to our song together', 3500); sound.sparkle(); }
      if (!listening && wasListening) showToast('The song fades out', 2000);
      if (together && !wasTogether) { showToast('Sitting together', 2500); savedZoom = tpCamera.zoomTarget; tpCamera.zoomTarget = Math.max(tpCamera.zoomTarget, 7.2); }
      if (!together && wasTogether && savedZoom != null) { tpCamera.zoomTarget = savedZoom; savedZoom = null; }
      wasTogether = together;

      mood += ((together ? 1 : 0) - mood) * (1 - Math.exp(-1.1 * dt));
      atmosphere.dim = 1 - 0.4 * mood;
      if (me) {
        const r = { x1: me.wrapper.position.x - 2.4, x2: me.wrapper.position.x + 2.4, z1: me.wrapper.position.z - 2.4, z2: me.wrapper.position.z + 2.4 };
        petals.setRect(r); flies.setRect(r);
      }
      petals.setAlpha(mood * 0.95); flies.setAlpha(mood);
      petals.update(dt, null); flies.update(dt, null);
    },
  };
}
