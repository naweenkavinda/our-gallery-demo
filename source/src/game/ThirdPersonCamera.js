/**
 * ThirdPersonCamera.js — GTA-style orbit camera
 *
 * Follows behind the character with smooth lag.
 * Mouse drag (desktop) or right-side touch (mobile) rotates the orbit.
 * Avoids clipping through walls via a simple raycast.
 */

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.distance = 5;
    this.height = 2.8;
    this.rotX = 0;          // horizontal orbit (radians)
    this.rotY = 0.3;        // vertical angle
    this.focus = null;
    this.lookY = 1.5;       // how high above the character the camera looks (a dog: much lower)
    this.heightBase = 1.2;  // how high the camera floats when right up close
    this.maxZoom = 9;
    this.eye = null;        // set while lying back in the planetarium
    this.eyeYaw = 0;
    this.eyePitch = 1.2;
    this.zoomTarget = 5;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this._idealPos = new THREE.Vector3();
    this._idealLook = new THREE.Vector3();
  }

  /** Rotate by delta pixels. */
  rotate(dx, dy) {
    if (this.eye) {                                  // lying back: look all the way round and up
      this.eyeYaw += dx * 0.004;
      this.eyePitch = Math.max(-0.2, Math.min(1.5, this.eyePitch - dy * 0.004));
      return;
    }
    this.rotX -= dx * 0.003;
    this.rotY = Math.max(-0.2, Math.min(1.0, this.rotY + dy * 0.003));
  }

  /** Mouse wheel: positive pulls the camera back, negative moves in close to the character. */
  zoom(delta) {
    this.zoomTarget = Math.max(1.5, Math.min(this.maxZoom, this.zoomTarget + delta * 0.004));
  }

  /** Glide to a fixed viewpoint (e.g. in front of a photo); pass null to glide back. */
  setFocus(pos, look) {
    this.focus = pos ? { pos, look } : null;
  }

  /** Look out through someone's eyes (e.g. lying back under the planetarium dome); you can turn and tilt freely. Pass null to leave. */
  setEye(pos, yaw = 0, pitch = 1.2) {
    this.eye = pos ? pos.clone() : null;
    if (pos) { this.eyeYaw = yaw; this.eyePitch = pitch; }
  }

  /** Call every frame with the character group. */
  update(target, colliders, dt = 1 / 60) {
    if (!target) return;

    if (this.eye) {
      this.pos.lerp(this.eye, 1 - Math.exp(-5 * dt));
      const cp = Math.cos(this.eyePitch);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.pos.x + Math.sin(this.eyeYaw) * cp * 10, this.pos.y + Math.sin(this.eyePitch) * 10, this.pos.z - Math.cos(this.eyeYaw) * cp * 10);
      return;
    }

    if (this.focus) {
      const k = 1 - Math.exp(-3.6 * dt);
      this.pos.lerp(this.focus.pos, k);
      this.look.lerp(this.focus.look, k);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      return;
    }

    // Smoothly ease toward the wheel-selected distance; the camera lowers as it closes in
    this.distance += (this.zoomTarget - this.distance) * (1 - Math.exp(-9 * dt));
    this.height = this.heightBase + 0.32 * this.distance;

    // Ideal offset from target
    const dist = this.distance;
    _v.set(
      Math.sin(this.rotX) * dist,
      this.height + Math.sin(this.rotY) * dist * 0.4,
      Math.cos(this.rotX) * dist
    );
    this._idealPos.copy(target.position).add(_v);
    this._idealLook.copy(target.position);
    this._idealLook.y += this.lookY;

    // Simple wall-clip avoidance: cast from target to ideal, shorten if hit
    if (colliders && colliders.length) {
      const dir = this._idealPos.clone().sub(target.position).normalize();
      const maxDist = this._idealPos.distanceTo(target.position);
      _ray.set(target.position.clone().add(new THREE.Vector3(0, this.lookY, 0)), dir);
      _ray.far = maxDist;
      const hits = _ray.intersectObjects(colliders, true);
      if (hits.length && hits[0].distance < maxDist) {
        const safe = Math.max(hits[0].distance - 0.3, 1);
        this._idealPos.copy(target.position).add(dir.multiplyScalar(safe));
        this._idealPos.y = Math.max(this._idealPos.y, target.position.y + this.lookY);
      }
    }

    // Smooth follow
    const k = 1 - Math.exp(-4.2 * dt);
    this.pos.lerp(this._idealPos, k);
    this.look.lerp(this._idealLook, k);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Returns the camera-relative forward direction (for character movement). */
  forward() {
    return new THREE.Vector3(-Math.sin(this.rotX), 0, -Math.cos(this.rotX)).normalize();
  }

  /** Returns the camera-relative right direction. */
  right() {
    return new THREE.Vector3(-Math.cos(this.rotX), 0, Math.sin(this.rotX)).normalize();
  }

  /** Snap to position instantly (for initial setup). */
  snap(target) {
    if (!target) return;
    const dist = this.distance;
    _v.set(
      Math.sin(this.rotX) * dist,
      this.height + Math.sin(this.rotY) * dist * 0.4,
      Math.cos(this.rotX) * dist
    );
    this.pos.copy(target.position).add(_v);
    this.look.copy(target.position);
    this.look.y += this.lookY;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
