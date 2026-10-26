import * as THREE from 'three';
import { heartGeometry, LAYOUT } from './Gallery.js';
import config from '../config/gallery.json';
import { now as clockNow } from './Clock.js';

/**
 * A wall in the foyer that counts the days you have been together. On your anniversary the heart
 * beats faster and the wall says so.
 */

const DAY = 86400000;
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function since(start, now) {
  let y = now.getFullYear() - start.getFullYear();
  let m = now.getMonth() - start.getMonth();
  let d = now.getDate() - start.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}

export function createAnniversary({ scene }) {
  const start = new Date(config.relationshipStart + 'T00:00:00');
  const now = clockNow();
  const days = Math.max(0, Math.round((midnight(now) - midnight(start)) / DAY));
  const parts = since(start, now);
  const isDay = now.getDate() === start.getDate() && now.getMonth() === start.getMonth() && parts.y >= 1;
  // the same date every month (the 9th) is a "monthiversary"
  const months = parts.y * 12 + parts.m;
  const isMonthly = now.getDate() === start.getDate() && months >= 1;

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const detail = [parts.y ? plural(parts.y, 'year') : '', parts.m ? plural(parts.m, 'month') : '', plural(parts.d, 'day')].filter(Boolean).join(', ');
  const sinceLine = `since ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const canvas = document.createElement('canvas');
  canvas.width = 1100; canvas.height = 700;
  const g = canvas.getContext('2d');
  const draw = () => {
    g.fillStyle = '#15151a'; g.fillRect(0, 0, 1100, 700);
    g.textAlign = 'center';
    g.fillStyle = '#a89f92'; g.font = '500 30px Inter, sans-serif';
    g.fillText(isDay ? 'H A P P Y   A N N I V E R S A R Y' : 'T O G E T H E R   F O R', 550, 215);
    g.fillStyle = '#f2ebde'; g.font = '500 270px "Cormorant Garamond", Georgia, serif';
    g.fillText(String(days), 550, 470);
    g.fillStyle = '#c9a15a'; g.font = 'italic 60px "Cormorant Garamond", Georgia, serif';
    g.fillText(days === 1 ? 'day' : 'days', 550, 545);
    g.fillStyle = '#9a948a'; g.font = '500 28px Inter, sans-serif';
    g.fillText(`${sinceLine}  ·  ${detail}`, 550, 625);
  };
  draw();
  document.fonts?.ready.then(() => { draw(); tex.needsUpdate = true; });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;

  // on the foyer's east wall, left of the Photo Booth archway
  const x = LAYOUT.byId.foyer.x2 - 0.15 - 0.04;
  const zc = 0.5;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  panel.rotation.y = -Math.PI / 2;
  panel.position.set(x, 2.15, zc);
  scene.add(panel);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.0, 4.6), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.85 }));
  back.position.set(x + 0.04, 2.15, zc);
  scene.add(back);

  const heart = new THREE.Mesh(heartGeometry(0.55), new THREE.MeshPhysicalMaterial({ color: 0xd9566e, metalness: 0.5, roughness: 0.25, clearcoat: 0.6, emissive: 0x4a1020 }));
  heart.position.set(x - 0.22, 3.95, zc);
  heart.rotation.y = -Math.PI / 2;
  scene.add(heart);

  return {
    update(dt) {
      const t = performance.now() / 1000;
      const speed = isDay || isMonthly ? 6 : 2.4, amp = isDay || isMonthly ? 0.16 : 0.07;
      heart.scale.setScalar(1 + Math.max(0, Math.sin(t * speed)) ** 3 * amp);
    },
    isAnniversary: isDay,
    isMonthly, months, years: parts.y,
    days,
  };
}
