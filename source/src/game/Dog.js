import { sound } from './Sound.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The gallery dog. Works with any rigged dog GLB: clips are matched by name.
 * Drop a Labrador at public/models/animals/labrador.glb to replace the stand-in.
 */

const short = n => n.split('|').pop().toLowerCase();
const ROLES = {
  idle:  /^idle$/,
  idle2: /^idle_2$/,
  sniff: /headlow|sniff/,
  walk:  /^walk$/,
  run:   /^(gallop|run)$/,
  jump:  /gallop_jump|run_jump|^jump(_start)?$/,
  eat:   /eat/,
  bark:  /^(attack|bark|headbutt)/,
  dead:  /death|die|dead/,
  sit:   /^sit(_idle)?$|^sitting$/,
  lie:   /^(lie|laydown|lay_down|down)$/,
  roll:  /roll/,
  paw:   /paw|shake|handshake/,
  beg:   /beg/,
};
const ONE_SHOT = new Set(['jump', 'bark', 'dead', 'sit', 'lie', 'roll', 'paw', 'beg', 'eat']);

export async function loadDogModel() {
  const loader = new GLTFLoader();
  for (const [url, standIn] of [['./models/animals/shiba.glb', true]]) {
    try { return { gltf: await loader.loadAsync(url), standIn }; } catch { /* try next */ }
  }
  return null;
}

function woof() {
  try {
    const ctx = (sound.unlock(), sound.ctx);
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(270, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f); f.connect(g); g.connect(sound.sfx);
    o.start(t); o.stop(t + 0.22);
  } catch { /* audio unavailable */ }
}

export async function loadCatModel() {
  try { return { gltf: await new GLTFLoader().loadAsync('./models/animals/cat.glb'), standIn: false }; } catch { return null; }
}

// a soft two-note meow: a rising then falling vowel
function meow() {
  try {
    const ctx = (sound.unlock(), sound.ctx);
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(860, t + 0.16);
    o.frequency.linearRampToValueAtTime(600, t + 0.5);
    f.type = 'bandpass'; f.Q.value = 3.5;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1900, t + 0.18);
    f.frequency.linearRampToValueAtTime(1000, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f); f.connect(g); g.connect(sound.sfx);
    o.start(t); o.stop(t + 0.58);
  } catch { /* audio unavailable */ }
}

export const CAT_CFG = { length: 0.6, sound: meow, speed: 0.95, heartY: 0.55, matte: true, purr: true };

let heartTex = null;
function heartTexture() {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8566a';
  g.beginPath(); g.moveTo(32, 54);
  g.bezierCurveTo(4, 34, 10, 8, 32, 20);
  g.bezierCurveTo(54, 8, 60, 34, 32, 54);
  g.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}

export class Dog {
  /** cfg: { length (m), sound(), speed (m/s), heartY } so the same code runs the cat */
  constructor(scene, loaded, nav, cfg = {}) {
    this.cfg = cfg;
    this.sound = cfg.sound || woof;
    this.scene = scene;
    this.nav = nav;
    this.root = new THREE.Group();
    this.group = this.root;              // lets the interaction system treat the dog like any other target
    this.model = loaded.gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);

    // Size the dog to a realistic ~1.05 m body length and stand it on the floor
    this.model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const s = (cfg.length ?? 1.05) / Math.max(size.x, size.z);
    this.model.scale.setScalar(s);

    if (loaded.standIn) {
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color.set(0xe6bd78);     // Labrador gold
        o.material.roughness = 0.85; o.material.metalness = 0;
      });
    }
    if (cfg.matte) {                         // fur, not plastic
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.roughness = 0.92; o.material.metalness = 0;
      });
    }
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of loaded.gltf.animations) {
      const n = short(clip.name);
      for (const [role, re] of Object.entries(ROLES)) {
        if (!this.actions[role] && re.test(n)) {
          const a = this.mixer.clipAction(clip);
          if (ONE_SHOT.has(role)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
          this.actions[role] = a;
        }
      }
    }
    this.baseWalkSpeed = cfg.speed ?? 1.1;
    this._play('idle', 0);
    this.mixer.update(0.1);

    // Work out which way the dog faces (head vs tail) and where the floor is
    this.model.updateMatrixWorld(true);
    let head = null, tail = null;
    this.model.traverse(o => {
      if (o.isBone) {
        if (!head && /^head$/i.test(o.name)) head = o;
        if (!tail && /^tail1?$/i.test(o.name)) tail = o;
      }
    });
    if (head && tail) {
      const h = head.getWorldPosition(new THREE.Vector3()), t = tail.getWorldPosition(new THREE.Vector3());
      this.model.rotation.y = -Math.atan2(h.x - t.x, h.z - t.z);
    }
    this.root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(this.model);
    this.model.position.y = -box.min.y;
    // remembered so the sit pose can tilt the body about its rump and put it back exactly
    this._pose0 = { pos: this.model.position.clone(), quat: this.model.quaternion.clone(), rearZ: box.min.z + 0.05 };
    this.sitK = 0;

    this.tricks = this._availableTricks();
    this.hearts = [];
    this.state = 'idle';
    this.stateT = 2;
    this.yaw = 0; this.targetYaw = 0;
    this.goal = null; this.at = null; this.prev = null;
    this.trick = null;
    this.ignoreUntil = 0;
    this.guide = null;
    this.time = 0;
    this.curRole = '';
    this.remoteTarget = null;

    const ids = Object.keys(nav.nodes);
    this.at = ids[Math.floor(Math.random() * ids.length)];
    const p = nav.nodes[this.at];
    this.root.position.set(p[0], 0, p[1]);
  }

  _availableTricks() {
    const a = this.actions, list = ['spin', 'hi', 'sitdown', 'sleep'];
    if (a.eat) list.push('treat');
    if (a.bark) list.push('bark');
    if (a.dead) list.push('playdead');
    if (a.jump) list.push('jump');
    if (a.sit) list.push('sit');
    if (a.sit && a.paw) list.push('shake');
    if (a.roll) list.push('roll');
    if (a.lie) list.push('lie');
    if (a.beg) list.push('beg');
    return list;
  }

  _play(role, fade = 0.25) {
    const next = this.actions[role] || this.actions.idle;
    if (!next || this.curAction === next) return;
    next.reset();
    if (this.curAction && fade > 0) next.crossFadeFrom(this.curAction, fade, false);
    next.play();
    this.curAction = next;
    this.curRole = role;
  }

  _neighbors(id) {
    const out = [];
    for (const [a, b] of this.nav.edges) { if (a === id) out.push(b); else if (b === id) out.push(a); }
    return out;
  }

  _nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const [id, [nx, nz]] of Object.entries(this.nav.nodes)) {
      const d = Math.hypot(nx - x, nz - z);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /** Lead the visitor to a spot (a hidden heart): walk the route there, then bark and wait. */
  guideTo(x, z) {
    if (this.trick) return;
    const from = this._nearestNode(this.root.position.x, this.root.position.z), to = this._nearestNode(x, z);
    const prev = { [from]: null }, q = [from];
    while (q.length) {
      const c = q.shift();
      if (c === to) break;
      for (const n of this._neighbors(c)) if (!(n in prev)) { prev[n] = c; q.push(n); }
    }
    const route = [];
    for (let c = to; c; c = prev[c]) route.unshift(c);
    this.guide = { route, i: 1, end: { x, z }, arrived: false, t: 0 };
    this.state = 'guide'; this.goal = null;
  }

  _guideStep(dt, players) {
    const g = this.guide, pos = this.root.position;
    let near = null, nd = Infinity;
    for (const p of players) { const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < nd) { nd = d; near = p; } }
    if (g.arrived) {
      g.t += dt;
      if (near) this.targetYaw = Math.atan2(near.x - pos.x, near.z - pos.z);
      if (g.t > 7) { this.guide = null; this.state = 'idle'; this.stateT = 1; this.ignoreUntil = this.time + 4; }
      return;
    }
    // wait for the visitor if they fall behind
    if (nd > 7 && near) { this._play('idle', 0.3); this.targetYaw = Math.atan2(near.x - pos.x, near.z - pos.z); return; }
    const target = g.i < g.route.length ? this.nav.nodes[g.route[g.i]] : [g.end.x, g.end.z];
    const dx = target[0] - pos.x, dz = target[1] - pos.z, dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      if (g.i < g.route.length) g.i++;
      else { g.arrived = true; g.t = 0; this.sound(); this._play(this.actions.idle2 ? 'idle2' : 'idle', 0.2); }
      return;
    }
    this.targetYaw = Math.atan2(dx, dz);
    this._play(this.actions.run ? 'run' : 'walk', 0.2);
    const step = Math.min(2.2 * dt, dist);
    pos.x += (dx / dist) * step; pos.z += (dz / dist) * step;
  }

  _chooseGoal() {
    const n = this._neighbors(this.at);
    const options = n.filter(x => x !== this.prev);
    const pool = options.length ? options : n;
    this.goal = pool[Math.floor(Math.random() * pool.length)];
  }

  /** Is the player close enough to pet? */
  canPet(pos) {
    if (this.trick) return false;
    const dx = pos.x - this.root.position.x, dz = pos.z - this.root.position.z;
    return dx * dx + dz * dz < 2.1 * 2.1;
  }

  pet(playerPos) {
    if (this.trick) return null;
    const pool = this.tricks.filter(n => !['sitdown', 'sleep', 'treat', 'hi'].includes(n));      // a pat gets a little trick; sit, sleep, treat and hi are asked for by name
    const name = pool[Math.floor(Math.random() * pool.length)];
    if (playerPos) this.targetYaw = Math.atan2(playerPos.x - this.root.position.x, playerPos.z - this.root.position.z);
    this.startTrick(name);
    this.spawnHearts();
    return name;
  }

  startTrick(name) {
    if (this.trick) return;
    const dur = { spin: 1.7, bark: 2.0, playdead: 4.6, jump: 1.5, sit: 3.2, shake: 4.0, roll: 2.4, lie: 3.2, beg: 3.0, treat: 3.8, sitdown: 4.2, sleep: 8, hi: 2.8 }[name] || 2;
    this.trick = { name, t: 0, dur, done: {} };
    if (this.cfg.purr) sound.purr(this.root.position); else sound.pet(this.root.position);
    this.state = 'trick';
    this.goal = null;
    this.spinStart = this.yaw;
  }

  /** a little bone that drops from above his head to his mouth */
  _spawnTreat() {
    if (!this._treatTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u{1F9B4}', 32, 36);
      this._treatTex = new THREE.CanvasTexture(c); this._treatTex.colorSpace = THREE.SRGBColorSpace;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._treatTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.28); s.position.set(0, 1.0, 0.35);
    s.userData = { fx: 'treat', t: 0 };
    this.root.add(s); this.hearts.push(s);
  }

  /** a little z drifting up from the sleeping dog */
  _spawnZ() {
    if (!this._zTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.font = 'italic 700 54px serif'; g.fillStyle = '#e8f0ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z', 32, 34);
      this._zTex = new THREE.CanvasTexture(c); this._zTex.colorSpace = THREE.SRGBColorSpace;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._zTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.2);
    s.position.set(this.root.position.x + 0.05, 0.6, this.root.position.z + 0.3);
    s.userData = { vy: 0.4, life: 0, delay: 0 };
    this.scene.add(s); this.hearts.push(s);
  }

  /** what Alex or Sam picked from the dog menu: pet, treat, sit, sleep, hi */
  interact(kind, pos) {
    if (this.trick) return null;
    if (pos) this.targetYaw = Math.atan2(pos.x - this.root.position.x, pos.z - this.root.position.z);
    const name = { treat: 'treat', sit: 'sitdown', sleep: 'sleep', hi: 'hi' }[kind];
    if (!name || !this.tricks.includes(name)) return this.pet(pos);
    this.startTrick(name);
    if (name !== 'treat') this.spawnHearts();
    return name;
  }

  spawnHearts() {
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false }));
      s.scale.setScalar(0.22 + Math.random() * 0.12);
      s.position.set(this.root.position.x + (Math.random() - 0.5) * 0.5, (this.cfg.heartY ?? 0.9) + Math.random() * 0.2, this.root.position.z + (Math.random() - 0.5) * 0.5);
      s.userData = { vy: 0.55 + Math.random() * 0.3, life: 0, delay: i * 0.12 };
      s.visible = false;
      this.scene.add(s);
      this.hearts.push(s);
    }
  }

  _updateTrick(dt) {
    const tr = this.trick, a = this.actions;
    const prevT = tr.t;
    tr.t += dt;
    const at = (x) => prevT < x && tr.t >= x;
    switch (tr.name) {
      case 'spin': {
        this._play('walk', 0.15);
        const k = Math.min(tr.t / tr.dur, 1);
        const e = k * k * (3 - 2 * k);
        this.yaw = this.spinStart + Math.PI * 2 * e;
        this.targetYaw = this.yaw;
        break;
      }
      case 'bark':
        if (at(0.05) || at(1.0)) { this.sound(); this._playOnce('bark'); }
        break;
      case 'playdead':
        if (at(0.05)) this._playOnce('dead');
        if (at(3.0) && a.dead) { a.dead.paused = false; a.dead.timeScale = -1; a.dead.play(); }
        break;
      case 'jump':
        if (at(0.05)) this._playOnce('jump');
        this.model.position.y = this._floorY + Math.sin(Math.min(tr.t / 0.9, 1) * Math.PI) * 0.35;
        break;
      case 'sit': if (at(0.05)) this._playOnce('sit'); break;
      case 'shake': if (at(0.05)) this._playOnce('sit'); if (at(1.6)) this._playOnce('paw'); break;
      case 'roll': if (at(0.05)) this._playOnce('roll'); break;
      case 'lie': if (at(0.05)) this._playOnce('lie'); break;
      case 'beg': if (at(0.05)) this._playOnce('beg'); break;
      case 'treat': {                                                   // a bone drops to his mouth, then he eats it
        if (at(0.05)) { this._play('idle', 0.2); this._spawnTreat(); }
        if (at(0.55)) { this._playOnce('eat'); this.spawnHearts(); }
        break;
      }
      case 'sitdown': {                                                 // sits up on his rump, nose in the air, then gets back up
        if (at(0.05)) this._play('idle', 0.3);
        const up = Math.min(1, tr.t / 0.6), down = Math.min(1, Math.max(0, (tr.dur - tr.t) / 0.5));
        this.sitK = Math.min(up, down) ** 0.8;
        if (at(0.7)) this.spawnHearts();
        break;
      }
      case 'sleep': {                                                   // curls up on his side with little z's drifting up
        if (at(0.05)) this._playOnce('dead');
        if (tr.t > 0.6 && Math.floor(tr.t / 1.1) !== Math.floor(prevT / 1.1)) this._spawnZ();
        if (at(tr.dur - 1.7) && a.dead) { a.dead.paused = false; a.dead.timeScale = -1; a.dead.play(); }
        break;
      }
      case 'hi': {                                                      // a happy hop, a bark, a happy spin
        if (at(0.05)) this._playOnce('jump');
        if (tr.t < 0.9) this.model.position.y = this._floorY + Math.sin(Math.min(tr.t / 0.9, 1) * Math.PI) * 0.35;
        if (at(0.35)) { this.sound(); this.spawnHearts(); }
        if (at(1.2)) { this.sound(); this._play('walk', 0.15); this.spinStart = this.yaw; }
        if (tr.t > 1.2) {
          const k = Math.min((tr.t - 1.2) / 1.4, 1), e = k * k * (3 - 2 * k);
          this.yaw = this.spinStart + Math.PI * 2 * e; this.targetYaw = this.yaw;
        }
        break;
      }
    }
    if (tr.t >= tr.dur) {
      if (a.dead) a.dead.timeScale = 1;
      this.model.position.y = this._floorY;
      this.sitK = 0;
      this.trick = null;
      this.state = 'idle'; this.stateT = 1.5;
      this.ignoreUntil = this.time + 6;
      this._play('idle', 0.3);
    }
  }

  _playOnce(role) {
    const a = this.actions[role];
    if (!a) return;
    a.reset(); a.timeScale = 1;
    if (this.curAction && this.curAction !== a) a.crossFadeFrom(this.curAction, 0.15, false);
    a.play();
    this.curAction = a; this.curRole = role;
  }

  /** players: array of {x,z}. simulate=false means a partner's machine is driving the dog. */
  update(dt, players, simulate = true) {
    this.time += dt;
    if (this._floorY === undefined) this._floorY = this.model.position.y;

    if (simulate) {
      if (this.trick) {
        this._updateTrick(dt);
      } else {
        this._wander(dt, players);
      }
    } else if (this.remoteTarget) {
      const k = 1 - Math.exp(-10 * dt);
      this.root.position.x += (this.remoteTarget.x - this.root.position.x) * k;
      this.root.position.z += (this.remoteTarget.z - this.root.position.z) * k;
      this.targetYaw = this.remoteTarget.ry;
      if (this.trick) this._updateTrick(dt);
      else if (this.remoteTarget.a && this.remoteTarget.a !== this.curRole) {
        ONE_SHOT.has(this.remoteTarget.a) ? this._playOnce(this.remoteTarget.a) : this._play(this.remoteTarget.a);
      }
    }

    this._tail(dt);
  }

  /** turn toward the heading, advance the animation, float the hearts */
  _tail(dt) {
    if (this.state !== 'trick' || this.trick?.name !== 'spin') {
      const d = ((this.targetYaw - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.yaw += d * Math.min(1, dt * 7);
    }
    this.root.rotation.y = this.yaw;

    this.mixer.update(dt);
    this._applySit();

    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i], u = h.userData;
      if (u.fx === 'treat') {
        u.t += dt;
        h.position.y = 1.0 - Math.min(u.t / 0.5, 1) ** 2 * 0.62;
        if (u.t > 0.55) { this.root.remove(h); h.material.dispose(); this.hearts.splice(i, 1); }
        continue;
      }
      u.delay -= dt;
      if (u.delay > 0) continue;
      h.visible = true;
      u.life += dt;
      h.position.y += u.vy * dt;
      h.material.opacity = Math.max(0, 1 - u.life / 1.6);
      if (u.life > 1.6) { this.scene.remove(h); h.material.dispose(); this.hearts.splice(i, 1); }
    }
  }

  /**
   * Played by a visitor instead of wandering: walk and run where you point, hop, sit, bark and do tricks.
   * input: { x, z } the way to go in the world (length 0..1), run, canWalk(x, z)
   */
  drive(dt, input) {
    this.time += dt;
    if (this._floorY === undefined) this._floorY = this.model.position.y;
    const mag = Math.min(1, Math.hypot(input.x, input.z));
    const moving = mag > 0.12;
    const hopping = this.trick?.name === 'jump';
    if (this.trick) this._updateTrick(dt);                 // a trick holds the dog still, except a hop, which can carry on moving
    if (moving && (!this.trick || hopping)) {
      this.resting = null;
      const fast = input.run && mag > 0.7;
      const speed = (fast ? 5.4 : 2.6) * Math.max(0.5, mag);
      this.targetYaw = Math.atan2(input.x, input.z);
      if (!hopping) {
        const role = fast && this.actions.run ? 'run' : 'walk';
        this._play(role, 0.2);
        if (this.actions[role] && role === 'walk') this.actions.walk.timeScale = Math.min(1.7, Math.max(1, speed / this.baseWalkSpeed * 0.7));
      }
      const n = Math.hypot(input.x, input.z) || 1, ux = input.x / n, uz = input.z / n;
      const nx = this.root.position.x + ux * speed * dt, nz = this.root.position.z + uz * speed * dt;
      if (!input.canWalk || input.canWalk(nx, this.root.position.z)) this.root.position.x = nx;
      if (!input.canWalk || input.canWalk(this.root.position.x, nz)) this.root.position.z = nz;
    } else if (!this.trick) {
      if (this.resting === 'sniff') this._play('sniff', 0.3);
      else if (!this.resting) this._play(this.actions.idle2 && this.idleLong > 6 ? 'idle2' : 'idle', 0.3);
    }
    this.idleLong = moving ? 0 : (this.idleLong || 0) + dt;
    if (!this.trick) this.state = 'driven';
    this._tail(dt);
  }

  /** a trick on request (bark, spin, roll ...), if the dog is not in the middle of one */
  act(name) {
    if (this.trick || !this.tricks.includes(name)) return false;
    this.resting = null;
    this.startTrick(name);
    return true;
  }

  /** sit down (or, with a dog that cannot sit, put the nose to the floor), or get up again */
  toggleSit() {
    if (this.trick) return;
    const mode = this.actions.sit ? 'sit' : this.actions.sniff ? 'sniff' : null;
    if (!mode) return;
    if (this.resting) { this.resting = null; this._play('idle', 0.3); return; }
    this.resting = mode;
    if (mode === 'sit') this._playOnce('sit'); else this._play('sniff', 0.3);
  }

  /** tilt the body about its rump (nose up, tail down) by how far he has sat down, 0..1; put it back at 0 */
  _applySit() {
    const p = this._pose0, k = this.sitK || 0;
    if (!p) return;
    if (k < 0.001) {
      if (this._sitApplied) { this.model.position.copy(p.pos); this.model.quaternion.copy(p.quat); this.model.position.y = this._floorY ?? p.pos.y; this._sitApplied = false; }
      return;
    }
    this._sitApplied = true;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.55 * k);
    const pivot = new THREE.Vector3(0, p.pos.y, p.rearZ);
    const off = p.pos.clone().sub(pivot).applyQuaternion(q);
    this.model.position.copy(pivot).add(off);
    this.model.position.y -= 0.13 * k;                             // the rump sinks to the floor, hiding the back feet: he is sitting
    this.model.quaternion.copy(q).multiply(p.quat);
  }

  _wander(dt, players) {
    if (this.guide) return this._guideStep(dt, players);
    // A player close by? Stop and look at them, but don't block the way forever.
    let near = null, nd = Infinity;
    for (const p of players) {
      const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z, d = Math.hypot(dx, dz);
      if (d < nd) { nd = d; near = p; }
    }
    if (near && nd < 2.4 && this.time > this.ignoreUntil && this.state !== 'greet') {
      this.state = 'greet'; this.stateT = 7; this.goal = null;
      this._play(this.actions.idle2 && Math.random() < 0.5 ? 'idle2' : 'idle', 0.3);
    }
    if (this.state === 'greet') {
      if (near) this.targetYaw = Math.atan2(near.x - this.root.position.x, near.z - this.root.position.z);
      this.stateT -= dt;
      if (this.stateT <= 0 || !near || nd > 3.6) { this.state = 'idle'; this.stateT = 0.4; this.ignoreUntil = this.time + 5; }
      return;
    }

    if (this.state === 'idle') {
      this.stateT -= dt;
      if (this.stateT <= 0) { this._chooseGoal(); this.state = 'walk'; }
      return;
    }

    // walking toward the next waypoint
    const g = this.nav.nodes[this.goal];
    if (!g) { this.state = 'idle'; this.stateT = 1; return; }
    const dx = g[0] - this.root.position.x, dz = g[1] - this.root.position.z, dist = Math.hypot(dx, dz);
    const speed = this.baseWalkSpeed;
    if (dist < 0.2) {
      this.prev = this.at; this.at = this.goal; this.goal = null;
      const r = Math.random();
      if (r < 0.45) {
        this.state = 'idle'; this.stateT = 2 + Math.random() * 4;
        const roles = ['idle', 'idle2', 'sniff', 'eat'].filter(x => this.actions[x]);
        this._play(roles[Math.floor(Math.random() * roles.length)], 0.35);
        if (this.curRole === 'eat') this.stateT = 3.4;
      } else {
        this._chooseGoal();
      }
      return;
    }
    this.targetYaw = Math.atan2(dx, dz);
    this._play('walk', 0.25);
    if (this.actions.walk) this.actions.walk.timeScale = speed / this.baseWalkSpeed;
    const step = Math.min(speed * dt, dist);
    this.root.position.x += (dx / dist) * step;
    this.root.position.z += (dz / dist) * step;
  }

  /** Compact state to send to the partner's machine. */
  getSyncState() {
    return {
      x: this.root.position.x, z: this.root.position.z, ry: this.yaw,
      a: this.curRole || 'idle', k: this.trick?.name || '',
    };
  }

  applyRemote(s) {
    this.remoteTarget = s;
    if (!this.placedRemote) { this.root.position.set(s.x, 0, s.z); this.yaw = s.ry; this.placedRemote = true; }
    if (s.k && !this.trick) { this.startTrick(s.k); this.spawnHearts(); }
  }
}
