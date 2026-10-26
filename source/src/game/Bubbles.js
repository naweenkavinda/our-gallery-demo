import * as THREE from 'three';
import { sound } from './Sound.js';

/**
 * Little speech bubbles above a character's head ("Kiss?", "Hold hands?", "Photo together?").
 * set(key, wrapper, text) shows one; set(key, wrapper, null) takes it away. Call update(dt) each frame.
 */

const cache = new Map();
function bubbleTexture(text) {
  if (cache.has(text)) return cache.get(text);
  const W = 512, H = 190;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = 46, x = 16, y = 14, w = W - 32, h = 118;
  g.shadowColor = 'rgba(40, 24, 24, 0.35)'; g.shadowBlur = 14; g.shadowOffsetY = 4;
  g.fillStyle = '#fffaf3';
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.moveTo(W / 2 - 22, y + h - 2); g.lineTo(W / 2, y + h + 38); g.lineTo(W / 2 + 22, y + h - 2);
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = '#4a2a2f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 58px "Cormorant Garamond", Georgia, "Segoe UI Emoji", serif';
  g.fillText(text, W / 2, y + h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(text, tex);
  return tex;
}

export function createBubbles(scene) {
  const items = new Map();   // key -> { sprite, wrapper, text, t }

  function remove(key) {
    const it = items.get(key);
    if (!it) return;
    scene.remove(it.sprite); it.sprite.material.dispose(); items.delete(key);
  }

  return {
    set(key, wrapper, text) {
      const it = items.get(key);
      if (!text || !wrapper) { if (it) it.closing = true; return; }
      if (it && it.text === text && it.wrapper === wrapper) { it.closing = false; return; }
      remove(key);
      sound.pop();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(text), transparent: true, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 50;
      scene.add(sprite);
      items.set(key, { sprite, wrapper, text, t: 0, closing: false, k: 0 });
    },
    update(dt) {
      for (const [key, it] of items) {
        it.t += dt;
        it.k += ((it.closing ? 0 : 1) - it.k) * (1 - Math.exp(-12 * dt));        // pop in / out
        if (it.closing && it.k < 0.03) { remove(key); continue; }
        const s = it.k * (1 + Math.sin(it.t * 3) * 0.02);
        it.sprite.scale.set(0.95 * s, 0.355 * s, 1);
        it.sprite.position.set(it.wrapper.position.x, it.wrapper.position.y + 2.05 + Math.sin(it.t * 2.2) * 0.04, it.wrapper.position.z);
        it.sprite.material.opacity = Math.min(1, it.k * 1.4);
      }
    },
  };
}
