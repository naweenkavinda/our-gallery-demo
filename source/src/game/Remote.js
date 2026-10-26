import * as THREE from 'three';
import { loadVRMCharacter, loadAnimationsForVRM, AnimationController } from './Character.js';
import { drapeSkirt } from './Skirt.js';

const ONE_SHOT = new Set(['wave', 'blowKiss', 'dance1', 'dance2', 'dance3', 'sitDown', 'standUp', 'sitFloorDown', 'sitFloorUp', 'jump', 'runJump', 'kiss']);

/** The other visitor: their VRM character, animated from the state they broadcast. */
export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
  }

  async add(peer) {
    if (this.players.has(peer.id)) return;
    const entry = {
      id: peer.id, name: peer.name, role: peer.role,
      wrapper: new THREE.Group(),
      target: new THREE.Vector3(),
      ry: 0, targetRy: 0,
      placed: false, ready: false,
      wantAnim: 'idle', anim: '',
      ctrl: null, vrm: null, hold: false, hipsY: 0.95, speed: 0, wantAnim: 'idle', id: peer.id,
    };
    this.players.set(peer.id, entry);
    this.scene.add(entry.wrapper);
    if (peer.s) this.apply(peer.id, peer.s);

    const model = await loadVRMCharacter(peer.role);
    if (!model || !this.players.has(peer.id)) return;
    entry.vrm = model.userData.vrm;
    entry.hipsY = model.userData.hipsY || 0.95;
    entry.wrapper.add(model);

    entry.ctrl = new AnimationController();
    entry.ctrl.init(model);
    await loadAnimationsForVRM(entry.ctrl, entry.vrm, null, peer.role);
    if (!this.players.has(peer.id)) return;
    entry.ready = true;
    entry.ctrl.play('idle');
    this._applyAnim(entry);
  }

  remove(id) {
    const e = this.players.get(id);
    if (!e) return;
    this.scene.remove(e.wrapper);
    this.players.delete(id);
  }

  apply(id, s) {
    const e = this.players.get(id);
    if (!e) return;
    e.target.set(s.x, s.y, s.z);
    e.targetRy = s.ry;
    e.wantAnim = s.a || 'idle';
    e.hold = !!s.h;
    e.lean = !!s.l;
    e.lie = !!s.g;
    if (!e.placed) {
      e.wrapper.position.copy(e.target);
      e.ry = e.targetRy;
      e.placed = true;
    }
    if (e.ready) this._applyAnim(e);
  }

  _applyAnim(e) {
    if (e.wantAnim === e.anim) return;
    e.anim = e.wantAnim;
    if (ONE_SHOT.has(e.anim)) e.ctrl.playEmote(e.anim);
    else { e.ctrl.cancelEmote(); e.ctrl.play(e.anim); }
  }

  update(dt) {
    const k = 1 - Math.exp(-14 * dt);
    for (const e of this.players.values()) {
      e.wrapper.position.lerp(e.target, k);
      const d = ((e.targetRy - e.ry + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.ry += d * k;
      e.wrapper.rotation.order = 'YXZ';
      e.lieK = (e.lieK || 0) + ((e.lie ? 1 : 0) - (e.lieK || 0)) * (1 - Math.exp(-4 * dt));
      e.wrapper.rotation.x = -e.lieK * Math.PI / 2;                 // lying on a blanket under the stars
      e.wrapper.rotation.y = e.ry;
      if (e.ctrl) e.ctrl.update(dt);
      this.onPose?.(e);
      drapeSkirt(e.vrm, /^sit(ting|Down|Floor|FloorDown)$/.test(e.wantAnim), dt);
      if (e.vrm) e.vrm.update(dt);
    }
  }
}

