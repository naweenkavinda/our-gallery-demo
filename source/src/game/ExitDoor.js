import { sound } from './Sound.js';
import * as THREE from 'three';
import { LAYOUT } from './Gallery.js';
import { pbr, boxUV } from './Materials.js';

/**
 * The big door behind you in the foyer. Knock and it swings open on a bright light, and you are
 * back at the character selection screen.
 */

function knockSound() {
  try {
    const ctx = (sound.unlock(), sound.ctx);
    if (ctx.state === 'suspended') ctx.resume();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    [0, 0.3, 0.6].forEach(dt => {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(sound.sfx); o.start(t); o.stop(t + 0.22);
      const n = ctx.createBufferSource(), ng = ctx.createGain(), f = ctx.createBiquadFilter();
      n.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; ng.gain.value = 0.35;
      n.connect(f); f.connect(ng); ng.connect(sound.sfx); n.start(t);
    });
  } catch { /* audio unavailable */ }
}

export function createExitDoor({ scene, interactions, showToast, onLeave }) {
  const foyer = LAYOUT.byId.foyer;
  const z = foyer.z2 - 0.15;                      // inner face of the south wall
  const W = 1.55, H = 3.5;

  const wood = new THREE.MeshPhysicalMaterial({ ...pbr('oak_veneer_01', 0.8, 1.9, 0.9), color: 0x8a5a3a, roughness: 1, clearcoat: 0.4, clearcoatRoughness: 0.4 });
  const stone = new THREE.MeshPhysicalMaterial({ ...pbr('marble_01', 0.6, 1, 0.5), color: 0xf3eee4, roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a15a, roughness: 0.3, metalness: 0.95 });
  const mk = (geo, mat, x, y, zz, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // light waiting behind the doors
  const light = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
  light.rotation.y = Math.PI; light.position.set(0, H / 2, z - 0.01);
  scene.add(light);

  // stone surround
  mk(boxUV(new THREE.BoxGeometry(0.5, H + 0.5, 0.3), 0.5, H + 0.5, 0.3, 1.5), stone, -W - 0.25, (H + 0.5) / 2, z - 0.1);
  mk(boxUV(new THREE.BoxGeometry(0.5, H + 0.5, 0.3), 0.5, H + 0.5, 0.3, 1.5), stone, W + 0.25, (H + 0.5) / 2, z - 0.1);
  mk(boxUV(new THREE.BoxGeometry(W * 2 + 1.5, 0.45, 0.4), W * 2 + 1.5, 0.45, 0.4, 1.5), stone, 0, H + 0.25, z - 0.14);
  mk(boxUV(new THREE.BoxGeometry(W * 2 + 1.9, 0.18, 0.55), W * 2 + 1.9, 0.18, 0.55, 1.5), stone, 0, H + 0.58, z - 0.2);

  // two leaves hinged at the outer edges
  const leaves = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * W, 0, z - 0.06);
    const leaf = mk(boxUV(new THREE.BoxGeometry(W, H, 0.09), W, H, 0.09, 1.8), wood, -side * W / 2, H / 2, 0, pivot);
    void leaf;
    for (const py of [0.95, 2.55]) {
      mk(new THREE.BoxGeometry(W - 0.5, py < 2 ? 1.5 : 1.15, 0.03), wood, -side * W / 2, py + (py < 2 ? 0.1 : 0), -0.05, pivot).material = wood;
    }
    const ring = mk(new THREE.TorusGeometry(0.1, 0.02, 12, 32), brass, -side * (W - 0.22), 1.55, -0.07, pivot);
    void ring;
    scene.add(pivot);
    leaves.push({ pivot, side });
  }

  // small plaque above
  const c = document.createElement('canvas'); c.width = 640; c.height = 120;
  { const g = c.getContext('2d'); g.fillStyle = '#1d1a16'; g.fillRect(0, 0, 640, 120); g.fillStyle = '#d8b878'; g.font = '500 54px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.fillText('The Way Back', 320, 80); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  plaque.rotation.y = Math.PI; plaque.position.set(0, H + 0.25, z - 0.35); scene.add(plaque);

  let knocking = false, t = 0;
  interactions.extras.push({
    pos: new THREE.Vector3(0, 1.4, z - 1.2), radius: 2.6, prompt: 'Knock to go back <kbd>E</kbd>',
    visible: () => !knocking,
    onUse: () => {
      knocking = true; t = 0;
      knockSound();
      showToast('Knock, knock...', 2000);
    },
  });

  return {
    get busy() { return knocking; },
    update(dt) {
      if (!knocking) return;
      t += dt;
      // three knocks make the doors tremble, then they swing open on the light
      const shake = t < 1.0 ? Math.max(0, Math.sin(t * 60)) * 0.012 * (1 - t) : 0;
      const open = THREE.MathUtils.smoothstep(t, 1.1, 2.0) * 1.45;
      for (const { pivot, side } of leaves) pivot.rotation.y = side * open * -1 + shake * side;
      if (t > 2.3 && !this.left) { this.left = true; onLeave(); }
    },
  };
}
