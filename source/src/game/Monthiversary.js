import config from '../config/gallery.json';
import { ParticleField } from './Particles.js';
import { now as clockNow } from './Clock.js';
import { sound } from './Sound.js';

/**
 * On the 9th of every month (and on the real anniversary, 9 July) the red carpet glows, rose petals
 * drift around you, and a letter is waiting the first time you walk in that day.
 */

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('og-' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('og-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function createMonthiversary({ scene, carpet, anniversary, collectibles, getLocal, showToast }) {
  const special = anniversary.isAnniversary || anniversary.isMonthly;
  if (!special) return { special: false, update() {} };

  const yearly = anniversary.isAnniversary;
  const M = config.monthiversary || {};
  const fill = s => String(s ?? '').replace('{n}', yearly ? anniversary.years : anniversary.months);
  const today = clockNow();
  const day = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;       // local date, so the letter shows once per day where you live

  // carpet glow
  const mat = carpet?.material;
  if (mat) { mat.emissiveMap = mat.map; mat.emissive.set(0xff2a50); mat.emissiveIntensity = 0.3; }

  // petals that follow you
  const petals = new ParticleField(scene, { kind: 'petal', count: 170, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0, y1: 5.6, size: 0.15, color: 0xff9db4, reach: 60 });
  const sparkles = new ParticleField(scene, { kind: 'sparkle', count: 90, rect: { x1: 0, x2: 1, z1: 0, z2: 1 }, y0: 0.2, y1: 4.5, size: 0.1, color: 0xffd98a, reach: 60 });

  // the letter, once per day, a few seconds after you arrive
  if (!store.get('mono-' + day, false)) {
    setTimeout(() => {
      store.set('mono-' + day, true);
      collectibles.readLetter({
        kicker: fill(M.kicker || 'Today is special'),
        title: fill(yearly ? (M.yearTitle || 'Happy anniversary') : (M.title || 'Happy monthiversary')),
        text: fill(yearly ? (M.yearText || '') : (M.text || '')),
        sign: `- ${config.signature}`,
      });
      sound.fanfare();
      showToast(yearly ? 'Happy anniversary!' : 'Happy monthiversary!', 5000);
    }, 4500);
  }

  let t = 0;
  return {
    special: true,
    update(dt) {
      t += dt;
      const me = getLocal();
      if (mat) mat.emissiveIntensity = 0.28 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 0.3;
      if (me) {
        const r = { x1: me.wrapper.position.x - 7, x2: me.wrapper.position.x + 7, z1: me.wrapper.position.z - 7, z2: me.wrapper.position.z + 7 };
        petals.setRect(r); sparkles.setRect(r);
      }
      petals.setAlpha(1); sparkles.setAlpha(0.8);
      petals.update(dt, null); sparkles.update(dt, null);
    },
  };
}
