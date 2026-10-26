import * as THREE from 'three';

const cache = {};
function sprite(kind) {
  if (cache[kind]) return cache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'petal') {
    g.translate(32, 32); g.rotate(-0.6);
    const grad = g.createLinearGradient(0, -26, 0, 26);
    grad.addColorStop(0, '#fff0f4'); grad.addColorStop(1, '#ff9db5');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, -26);
    g.bezierCurveTo(22, -14, 18, 18, 0, 26);
    g.bezierCurveTo(-18, 18, -22, -14, 0, -26);
    g.fill();
  } else if (kind === 'snow' || kind === 'glow' || kind === 'sparkle') {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    if (kind === 'snow') { grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    if (kind === 'sparkle') {
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 58); g.moveTo(6, 32); g.lineTo(58, 32); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache[kind] = t);
}

const KINDS = {
  petal:   { map: 'petal',   additive: false, fall: [0.3, 0.65], sway: 0.5 },
  snow:    { map: 'snow',    additive: false, fall: [0.2, 0.45], sway: 0.25 },
  sparkle: { map: 'sparkle', additive: true,  fall: [0.15, 0.4], sway: 0.2 },
  firefly: { map: 'glow',    additive: true,  fall: [0, 0],       sway: 0 },
};

/** A drifting cloud of particles inside a rectangle on the floor plan. */
export class ParticleField {
  constructor(scene, { kind, count, rect, y0 = 0, y1 = 4.3, size = 0.12, color = 0xffffff, reach = 9 }) {
    this.kind = kind; this.cfg = KINDS[kind]; this.count = count;
    this.rect = { ...rect }; this.y0 = y0; this.y1 = y1; this.reach = reach;
    this.alpha = 1;
    this.t = Math.random() * 10;

    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3).fill(1);
    this.speed = new Float32Array(count);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = this._rx(); this.pos[i * 3 + 1] = y0 + Math.random() * (y1 - y0); this.pos[i * 3 + 2] = this._rz();
      const [a, b] = this.cfg.fall;
      this.speed[i] = a + Math.random() * (b - a);
      this.phase[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size, map: sprite(this.cfg.map), color, vertexColors: true, transparent: true, depthWrite: false,
      blending: this.cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  _rx() { return this.rect.x1 + Math.random() * (this.rect.x2 - this.rect.x1); }
  _rz() { return this.rect.z1 + Math.random() * (this.rect.z2 - this.rect.z1); }

  setRect(rect) { Object.assign(this.rect, rect); }

  /** 0 hides the field, 1 shows it fully. */
  setAlpha(a) { this.alpha = a; this.mat.opacity = a; this.points.visible = a > 0.02; }

  update(dt, focus) {
    if (this.alpha <= 0.02) return;
    if (focus) {
      const cx = (this.rect.x1 + this.rect.x2) / 2, cz = (this.rect.z1 + this.rect.z2) / 2;
      const hw = (this.rect.x2 - this.rect.x1) / 2 + this.reach, hd = (this.rect.z2 - this.rect.z1) / 2 + this.reach;
      const near = Math.abs(focus.x - cx) < hw && Math.abs(focus.z - cz) < hd;
      this.points.visible = near;
      if (!near) return;
    }
    this.t += dt;
    const p = this.pos, r = this.rect;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, ph = this.phase[i];
      if (this.kind === 'firefly') {
        p[k]     += Math.sin(this.t * 0.5 + ph) * 0.3 * dt;
        p[k + 1] += Math.cos(this.t * 0.7 + ph * 2) * 0.18 * dt;
        p[k + 2] += Math.cos(this.t * 0.45 + ph) * 0.3 * dt;
        if (p[k + 1] < this.y0) p[k + 1] = this.y0; else if (p[k + 1] > this.y1) p[k + 1] = this.y1;
        const glow = 0.25 + 0.75 * Math.max(0, Math.sin(this.t * 1.7 + ph * 3));
        this.col[k] = this.col[k + 1] = this.col[k + 2] = glow;
      } else {
        p[k + 1] -= this.speed[i] * dt;
        p[k]     += Math.sin(this.t * 0.8 + ph) * this.cfg.sway * dt;
        p[k + 2] += Math.cos(this.t * 0.6 + ph) * this.cfg.sway * 0.6 * dt;
        if (p[k + 1] < this.y0) { p[k + 1] = this.y1; p[k] = this._rx(); p[k + 2] = this._rz(); }
      }
      if (p[k] < r.x1) p[k] = r.x2; else if (p[k] > r.x2) p[k] = r.x1;
      if (p[k + 2] < r.z1) p[k + 2] = r.z2; else if (p[k + 2] > r.z2) p[k + 2] = r.z1;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.kind === 'firefly') this.points.geometry.attributes.color.needsUpdate = true;
  }
}
