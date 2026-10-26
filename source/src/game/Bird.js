import { sound } from './Sound.js';
import * as THREE from 'three';

/**
 * A small bluebird. It sits on picture frames, benches, plants and sculptures, flies between them
 * (through the corridors when needed), and sometimes lands on a visitor's shoulder.
 * One machine simulates it; the partner's machine just follows (see getSyncState / applyRemote).
 */

function chirp() {
  try {
    const ctx = (sound.unlock(), sound.ctx);
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(3100 + i * 250, t);
      o.frequency.exponentialRampToValueAtTime(4300 + i * 200, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(3300, t + 0.11);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(sound.sfx);
      o.start(t); o.stop(t + 0.13);
      t += 0.15;
    }
  } catch { /* audio unavailable */ }
}

function buildBird() {
  const root = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x3f78c4, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x244a85, roughness: 0.6 });
  const chest = new THREE.MeshStandardMaterial({ color: 0xe69a5c, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xf6efe4, roughness: 0.8 });
  const beakM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
  const legM = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.8 });
  const S = (r, sx, sy, sz, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); return mesh;
  };

  const body = new THREE.Group(); root.add(body);
  body.add(S(1, 0.07, 0.065, 0.11, blue, 0, 0.1, 0));
  body.add(S(1, 0.06, 0.05, 0.085, chest, 0, 0.082, 0.025));
  body.add(S(1, 0.05, 0.035, 0.06, belly, 0, 0.065, -0.005));
  body.add(S(1, 0.055, 0.052, 0.055, blue, 0, 0.17, 0.07));            // head
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 10).rotateX(Math.PI / 2), beakM);
  beak.position.set(0, 0.165, 0.138); body.add(beak);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), eyeM);
    eye.position.set(sx * 0.036, 0.18, 0.1); body.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.1), dark);
  tail.position.set(0, 0.105, -0.17); tail.rotation.x = -0.2; body.add(tail);

  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.062, 0.125, 0.01);
    const w = S(1, 0.1, 0.011, 0.058, dark, side * 0.07, 0, -0.01);
    pivot.add(w); body.add(pivot); wings.push({ pivot, side });
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), legM);
    leg.position.set(sx * 0.02, 0.025, 0.01); root.add(leg); legs.push(leg);
  }
  root.scale.setScalar(1.35);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, body, wings, legs, headParts: body };
}

const wrapPi = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class Bird {
  constructor(scene, nav, perches, roomOf) {
    this.scene = scene; this.nav = nav; this.perches = perches; this.roomOf = roomOf;
    const b = buildBird();
    this.root = b.root; this.body = b.body; this.wings = b.wings; this.legs = b.legs;
    scene.add(this.root);

    this.state = 'perch';
    this.t = Math.random() * 10;
    this.dwell = 3;
    this.perch = perches[Math.floor(Math.random() * perches.length)];
    this.owner = '';           // id of the visitor whose shoulder we sit on
    this.side = 1;
    this.curve = null; this.u = 0; this.curveLen = 1; this.landing = null;
    this.yaw = this.perch.yaw; this.pitch = 0; this.roll = 0;
    this.flap = 0;
    this.lastPos = new Map();   // visitor id -> {x, z, idle seconds}
    this.remote = null;
    this._setPerchPose(this.perch);
    this.flying = false;
    this.chirpAt = 6 + Math.random() * 6;
  }

  _perchPos(p) {
    // sit somewhere along the top edge of a frame instead of always dead centre
    if (!p.halfW) return new THREE.Vector3(p.x, p.y, p.z);
    const k = (Math.random() * 2 - 1) * p.halfW;
    const tx = Math.cos(p.yaw), tz = -Math.sin(p.yaw);
    return new THREE.Vector3(p.x + tx * k, p.y, p.z + tz * k);
  }

  _setPerchPose(p) {
    this.pos = this._perchPos(p);
    this.root.position.copy(this.pos);
    this.yaw = p.yaw;
  }

  _nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const [id, [nx, nz]] of Object.entries(this.nav.nodes)) {
      const d = Math.hypot(nx - x, nz - z);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  _route(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = { [fromId]: null }, q = [fromId];
    while (q.length) {
      const c = q.shift();
      if (c === toId) break;
      for (const [a, b] of this.nav.edges) {
        const n = a === c ? b : b === c ? a : null;
        if (n && !(n in prev)) { prev[n] = c; q.push(n); }
      }
    }
    const out = [];
    for (let c = toId; c; c = prev[c]) out.unshift(c);
    return out;
  }

  /** Build a smooth flight path from here to the target point. */
  _takeOff(target, targetYaw, owner = '', side = 1) {
    const from = this.root.position.clone();
    const pts = [from.clone()];
    const sameRoom = this.roomOf(from.x, from.z) === this.roomOf(target.x, target.z);
    const cruise = 3.1 + Math.random() * 0.6;
    if (sameRoom) {
      const mid = from.clone().lerp(target, 0.5);
      mid.y = Math.max(from.y, target.y) + 0.9 + Math.random() * 0.7;
      pts.push(from.clone().add(new THREE.Vector3(0, 0.35, 0)), mid);
    } else {
      const route = this._route(this._nearestNode(from.x, from.z), this._nearestNode(target.x, target.z));
      pts.push(from.clone().add(new THREE.Vector3(0, 0.5, 0)));
      route.forEach((id, i) => {
        const [nx, nz] = this.nav.nodes[id];
        pts.push(new THREE.Vector3(nx + (Math.random() - 0.5) * 0.8, cruise - (i % 2) * 0.3, nz));
      });
    }
    pts.push(target.clone().add(new THREE.Vector3(0, 0.25, 0)), target.clone());
    // drop duplicates that would make the spline degenerate
    const clean = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.05);
    if (clean.length < 3) clean.splice(1, 0, from.clone().lerp(target, 0.5).add(new THREE.Vector3(0, 0.6, 0)));
    this.curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
    this.curveLen = this.curve.getLength();
    this.u = 0;
    this.state = 'fly';
    this.landing = { target: target.clone(), yaw: targetYaw, owner, side };
    this.owner = '';
  }

  _chooseNext(players) {
    const pick = Math.random();
    // sometimes visit a visitor who is standing still
    if (pick < 0.32) {
      const still = players.filter(p => p.idle > 2);
      if (still.length) {
        const p = still[Math.floor(Math.random() * still.length)];
        const side = Math.random() < 0.5 ? 1 : -1;
        this._takeOff(this._shoulderPos(p, side), p.wrapper.rotation.y, p.id, side);
        return;
      }
    }
    let target;
    // prefer perches in the room a visitor is in, so the bird is usually somewhere you can see it
    const vis = players[Math.floor(Math.random() * players.length)];
    if (vis && Math.random() < 0.75) {
      const room = this.roomOf(vis.wrapper.position.x, vis.wrapper.position.z);
      const local = this.perches.filter(p => this.roomOf(p.x, p.z) === room && p !== this.perch);
      if (local.length) target = local[Math.floor(Math.random() * local.length)];
    }
    target ||= this.perches[Math.floor(Math.random() * this.perches.length)];
    this.perch = target;
    this._takeOff(this._perchPos(target), target.yaw);
  }

  _shoulderPos(p, side) {
    const w = p.wrapper, ry = w.rotation.y;
    const lx = side * 0.16, lz = 0.0;
    const sy = (p.hipsY || 0.95) * 1.5 + w.position.y;
    return new THREE.Vector3(
      w.position.x + Math.cos(ry) * lx + Math.sin(ry) * lz, sy,
      w.position.z - Math.sin(ry) * lx + Math.cos(ry) * lz,
    );
  }

  /** players: [{id, wrapper, hipsY}] */
  update(dt, players, simulate = true) {
    this.t += dt;
    for (const p of players) {
      const prev = this.lastPos.get(p.id) || { x: p.wrapper.position.x, z: p.wrapper.position.z, idle: 0 };
      const moved = Math.hypot(p.wrapper.position.x - prev.x, p.wrapper.position.z - prev.z) / Math.max(dt, 1e-3);
      prev.idle = moved < 0.4 ? prev.idle + dt : 0;
      prev.speed = moved; prev.x = p.wrapper.position.x; prev.z = p.wrapper.position.z;
      this.lastPos.set(p.id, prev);
      p.idle = prev.idle; p.speed = prev.speed;
    }

    if (simulate) this._simulate(dt, players);
    else this._follow(dt, players);

    // pose
    const flying = this.state === 'fly';
    this.flying = flying;
    const flapSpeed = flying ? 24 : 0;
    this.flap += dt * flapSpeed;
    for (const { pivot, side } of this.wings) {
      if (flying) {
        pivot.rotation.y = 0;
        pivot.rotation.z = Math.sin(this.flap) * 0.95 * side;
      } else {
        pivot.rotation.y = side * (Math.PI / 2 - 0.1);   // folded back along the body
        pivot.rotation.z = side * 0.12;
      }
    }
    for (const leg of this.legs) { leg.visible = !flying; }
    this.body.rotation.x = flying ? this.pitch : 0;
    this.body.rotation.z = flying ? this.roll : 0;
    if (!flying) {
      // little idle life: tilt the whole bird to look about, bob the tail
      this.body.rotation.y = Math.sin(this.t * 0.9 + 1) * 0.55 * (Math.sin(this.t * 0.37) > 0.3 ? 1 : 0.15);
      this.body.rotation.x = Math.sin(this.t * 3.1) * 0.03;
      this.body.position.y = Math.max(0, Math.sin(this.t * 1.7)) * 0.004;
    } else {
      this.body.rotation.y = 0;
      this.body.position.y = Math.sin(this.flap * 0.5) * 0.012;
    }
    this.root.rotation.y = this.yaw;
  }

  _simulate(dt, players) {
    if (this.state === 'perch') {
      this.dwell -= dt;
      this.chirpAt -= dt;
      if (this.chirpAt <= 0) {
        this.chirpAt = 8 + Math.random() * 10;
        const near = players.some(p => Math.hypot(p.wrapper.position.x - this.root.position.x, p.wrapper.position.z - this.root.position.z) < 9);
        if (near) chirp();
      }
      if (this.owner) {
        const p = players.find(q => q.id === this.owner);
        if (!p) { this.owner = ''; this.dwell = 0; }
        else {
          const sp = this._shoulderPos(p, this.side);
          this.root.position.copy(sp); this.yaw = p.wrapper.rotation.y;
          if (p.speed > 2.2 || p.wrapper.visible === false) this.dwell = Math.min(this.dwell, 0);   // startled by running / the photo view
        }
      }
      if (this.dwell <= 0) {
        this._chooseNext(players);
      }
      return;
    }

    // flying
    const remaining = (1 - this.u) * this.curveLen;
    const speedMul = Math.min(1, 0.35 + remaining / 1.6);       // ease down for the landing
    const speed = 3.6 * speedMul;
    const du = (speed * dt) / this.curveLen;
    const prevTan = this.curve.getTangentAt(Math.min(this.u, 0.999));
    this.u = Math.min(1, this.u + du);
    const pt = this.curve.getPointAt(this.u);
    const tan = this.curve.getTangentAt(Math.min(this.u, 0.999));
    // follow a moving target (a walking visitor) during the last stretch
    if (this.landing.owner) {
      const p = players.find(q => q.id === this.landing.owner);
      if (p) {
        const sp = this._shoulderPos(p, this.landing.side);
        pt.lerp(sp, THREE.MathUtils.smoothstep(this.u, 0.6, 1));
      }
    }
    this.root.position.copy(pt);
    const targetYaw = Math.atan2(tan.x, tan.z);
    const turn = wrapPi(targetYaw - this.yaw);
    this.yaw += turn * (1 - Math.exp(-8 * dt));
    this.pitch = THREE.MathUtils.lerp(this.pitch, -Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1)) * 0.8, 0.15);
    this.roll = THREE.MathUtils.lerp(this.roll, THREE.MathUtils.clamp(-wrapPi(Math.atan2(tan.x, tan.z) - Math.atan2(prevTan.x, prevTan.z)) * 6, -0.6, 0.6), 0.15);

    if (this.u >= 1) {
      this.state = 'perch';
      this.pitch = 0; this.roll = 0;
      this.yaw = this.landing.yaw;
      if (this.landing.owner) { this.owner = this.landing.owner; this.side = this.landing.side; this.dwell = 8 + Math.random() * 14; }
      else this.dwell = 4 + Math.random() * 9;
      this.chirpAt = Math.min(this.chirpAt, 1.2 + Math.random());
    }
  }

  _follow(dt, players) {
    const s = this.remote;
    if (!s) return;
    this.state = s.a === 'fly' ? 'fly' : 'perch';
    this.owner = s.o || '';
    let target = new THREE.Vector3(s.x, s.y, s.z);
    if (this.owner && this.state === 'perch') {
      const p = players.find(q => q.id === this.owner);
      if (p) target = this._shoulderPos(p, s.sd || 1);
    }
    const k = 1 - Math.exp(-14 * dt);
    this.root.position.lerp(target, k);
    this.yaw += wrapPi(s.ry - this.yaw) * k;
    this.pitch = this.state === 'fly' ? (s.pi || 0) : 0;
    this.roll = this.state === 'fly' ? (s.ro || 0) : 0;
    if (!this.placed) { this.root.position.copy(target); this.placed = true; }
  }

  getSyncState() {
    return {
      x: this.root.position.x, y: this.root.position.y, z: this.root.position.z, ry: this.yaw,
      a: this.state === 'fly' ? 'fly' : 'perch', o: this.owner, sd: this.side, pi: this.pitch, ro: this.roll,
    };
  }

  applyRemote(s) { this.remote = s; }
}
