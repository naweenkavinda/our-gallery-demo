import * as THREE from 'three';
import { addObstacleBox, addObstacleCircle, LAYOUT } from './Gallery.js';
import { pbr } from './Materials.js';
import { sound } from './Sound.js';

/**
 * "Our Song": a record-player corner. Put your own song at public/audio/our-song.mp3 and it plays;
 * until then a soft built-in music-box tune plays instead. It fades in as you walk into the room and
 * gets louder the closer the two of you stand.
 */

const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function createSynth(ctx, out) {
  const prog = [[50, 57, 62, 66], [45, 52, 57, 61], [47, 54, 59, 62], [43, 50, 55, 59]];       // D, A, Bm, G
  const arp = [0, 1, 2, 3, 2, 1, 2, 3];
  const melody = [78, 81, 83, 81, 78, 76, 74, 76, 78, 83, 86, 83, 81, 78, 81, 76];
  const beat = 60 / 66;
  let next = 0, step = 0, timer = null;

  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  const reverb = ctx.createConvolver(); reverb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  reverb.connect(wet); wet.connect(out);

  const pluck = (f, t, vol, dur) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out); g.connect(reverb);
    [[1, 1], [2, 0.22], [3, 0.07]].forEach(([mul, amp]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * mul; og.gain.value = amp;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  };

  const tick = () => {
    while (next < ctx.currentTime + 0.5) {
      const chord = prog[Math.floor(step / 8) % 4], k = step % 8;
      pluck(hz(chord[arp[k]]), next, 0.07, 1.5);
      if (k === 0) pluck(hz(chord[0] - 12), next, 0.1, 3.8);
      if (k === 0 || k === 3 || k === 6) pluck(hz(melody[(step * 5 + k) % melody.length]), next, 0.09, 2);
      next += beat / 2; step++;
    }
  };
  return {
    start() { next = ctx.currentTime + 0.1; timer = setInterval(tick, 120); },
    stop() { clearInterval(timer); timer = null; },
    get running() { return timer !== null; },
  };
}

export function createSongRoom({ scene, interactions, config, showToast }) {
  const room = LAYOUT.byId.dark;
  const cx = (room.x1 + room.x2) / 2;
  const wood = new THREE.MeshPhysicalMaterial({ ...pbr('oak_veneer_01', 1, 1, 0.8), color: 0x9a7048, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.4, metalness: 0.4 });
  const cone = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 });

  const grp = new THREE.Group();
  grp.position.set(cx, 0, room.z2 - 0.15 - 0.28);
  grp.rotation.y = Math.PI;                       // against the room's south wall, facing into the room
  scene.add(grp);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };

  add(new THREE.BoxGeometry(1.8, 0.62, 0.5), wood, 0, 0.31, 0);                 // credenza
  add(new THREE.BoxGeometry(1.86, 0.04, 0.54), wood, 0, 0.64, 0);
  for (const sx of [-1.35, 1.35]) {
    add(new THREE.BoxGeometry(0.42, 0.86, 0.36), wood, sx, 0.43, 0);            // speakers
    add(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 24).rotateX(Math.PI / 2), cone, sx, 0.34, 0.185);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20).rotateX(Math.PI / 2), cone, sx, 0.68, 0.185);
  }
  add(new THREE.BoxGeometry(0.62, 0.07, 0.42), dark, -0.25, 0.7, 0);            // turntable
  const platter = add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 40), dark, -0.25, 0.755, 0);
  const label = add(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 24), new THREE.MeshStandardMaterial({ color: 0xc0405a, roughness: 0.5 }), -0.25, 0.757, 0);
  void label;
  const arm = add(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8).rotateZ(Math.PI / 2), dark, -0.02, 0.8, 0.1);
  arm.rotation.y = 0.5;
  // little lamp
  const lampBase = add(new THREE.CylinderGeometry(0.05, 0.07, 0.04, 16), dark, 0.62, 0.68, -0.08);
  void lampBase;
  const shade = add(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }), 0.62, 0.82, -0.08);
  void shade;
  // round rug and floor cushions
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.014, 56), new THREE.MeshStandardMaterial({ ...pbr('velour_velvet', 7, 7, 0.6), color: 0x9a3a4e, roughness: 1 }));
  rug.position.set(cx, 0.008, room.z2 - 3.8); rug.receiveShadow = true; scene.add(rug);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.45, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc9a15a }));
  ring.position.set(cx, 0.018, room.z2 - 3.8); scene.add(ring);
  // two floor cushions to sit on, side by side, facing the record player (F)
  const seats = [];
  for (const sx of [-1, 1]) {
    const cushion = new THREE.Mesh(new RoundedCushion(), new THREE.MeshStandardMaterial({ color: 0xf1e6d6, roughness: 0.9 }));
    cushion.position.set(cx + sx * 0.8, 0.12, room.z2 - 4.4); cushion.castShadow = true; scene.add(cushion);
    addObstacleCircle({ x: cx + sx * 0.8, z: room.z2 - 4.4, r: 0.42 });
    seats.push({ group: { position: new THREE.Vector3(cx + sx * 0.8, 0, room.z2 - 4.4) }, spot: { ry: 0, face: 0 }, floor: true, listen: true, label: 'Sit on the cushion', seatTop: 0.31, hipsFrac: 0.131 });
  }
  addObstacleBox({ x: cx, z: room.z2 - 0.45, hx: 2.2, hz: 0.55 });

  /* ── music ── */
  let ctx = null, master = null, synth = null, fileAudio = null, mode = null;
  let wanted = true, vol = 0, started = false, inZone = false, forced = false;   // forced: playing for someone sitting right here
  const songFile = config.song?.file;

  async function init() {
    sound.unlock(); ctx = sound.ctx;
    master = ctx.createGain(); master.gain.value = 0; master.connect(sound.master);
    mode = 'synth';
    try {
      const r = await fetch(songFile, { method: 'HEAD' });
      if (r.ok && (r.headers.get('content-type') || '').startsWith('audio')) {
        fileAudio = new Audio(songFile); fileAudio.loop = true; fileAudio.volume = 0;
        mode = 'file';
      }
    } catch { /* use the built-in tune */ }
    if (mode === 'synth') synth = createSynth(ctx, master);
  }

  const startPlayback = () => {
    if (ctx.state === 'suspended') ctx.resume();
    if (mode === 'file') fileAudio.play().catch(() => {}); else if (!synth.running) synth.start();
  };
  const stopPlayback = () => {
    if (mode === 'file') fileAudio?.pause(); else synth?.stop();
  };

  interactions.extras.push({
    pos: new THREE.Vector3(cx, 0.9, room.z2 - 1.1), radius: 2.4,
    get prompt() { return wanted ? 'Pause our song <kbd>E</kbd>' : 'Play our song <kbd>E</kbd>'; },
    visible: () => true,
    onUse: () => { wanted = !wanted; showToast(wanted ? `Playing: ${config.song?.title || 'Our Song'}` : 'Music paused', 2500); },
  });

  return {
    seats,
    /** play at full volume wherever you are (sitting on a cushion, or listening together) */
    get forced() { return forced; },
    set forced(v) { forced = !!v; },
    /** partnerDist: metres to the other visitor, or null when alone */
    update(dt, p, partnerDist) {
      platter.rotation.y += dt * (vol > 0.02 ? 3.2 : 0);
      const d = Math.hypot(p.x - cx, p.z - (room.z2 - 3.8));
      const zone = THREE.MathUtils.clamp(1 - (d - 3) / 7, 0, 1);
      const together = partnerDist == null ? 0.35 : THREE.MathUtils.clamp(1 - partnerDist / 7, 0, 1);
      const target = wanted ? (forced ? 0.9 : zone * (0.45 + 0.55 * together)) : 0;
      vol += (target - vol) * (1 - Math.exp(-2.2 * dt));
      // the background music fades out over the last 4 m before the room and stays off inside it;
      // near the record player our song takes over
      const outside = Math.hypot(Math.max(room.x1 - p.x, 0, p.x - room.x2), Math.max(room.z1 - p.z, 0, p.z - room.z2));
      sound.duck = Math.min(1, outside / 4) * (1 - 0.85 * Math.min(1, vol * 1.6));

      if ((zone > 0.05 || forced) && !started) { started = true; init().then(() => { if (vol > 0.01 || wanted) startPlayback(); }); }
      if (!ctx || (mode === 'file' ? !fileAudio : !synth)) return;       // still setting up
      if (vol > 0.012) { if (mode === 'file' ? fileAudio.paused : !synth.running) startPlayback(); }
      else if (vol < 0.004) stopPlayback();
      master.gain.value = vol * 0.9;
      if (fileAudio) fileAudio.volume = sound.muted ? 0 : Math.min(1, vol);
      const now = zone > 0.15;
      if (now && !inZone) showToast(`Now playing: ${config.song?.title || 'Our Song'}`, 3000);
      inZone = now;
    },
  };
}

// a plump round cushion
function RoundedCushion() {
  const g = new THREE.SphereGeometry(0.42, 28, 16);
  g.scale(1, 0.32, 1);
  return g;
}
