/**
 * Frames and stickers for the photo booth picture. Everything is drawn on a canvas so the saved
 * picture (and the copy on the wall) carries them baked in.
 */

export const OUT_W = 480, OUT_H = 640;                   // the picture (3:4), shared with Booth.js
export const MAX_STICKERS = 8;
const SERIF = '"Cormorant Garamond", Georgia, serif';
const HAND = 'Caveat, "Cormorant Garamond", cursive';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/* ── frames ── */

const heart = (g, x, y, s) => {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.6, y - s * 0.2, x - s * 0.25, y - s * 0.7, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.25, y - s * 0.7, x + s * 0.6, y - s * 0.2, x, y + s * 0.35);
  g.fill();
};
const star = (g, x, y, r, pts = 5) => {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / pts, d = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath(); g.fill();
};
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
/** fill the border (outside an inner rectangle) with the current fillStyle */
const border = (g, l, t, r, b) => {
  g.beginPath(); g.rect(0, 0, OUT_W, OUT_H); g.rect(l, t, OUT_W - l - r, OUT_H - t - b);
  g.fill('evenodd');
};
/** a pseudo-random but stable 0..1 so decorations do not jump between redraws */
const rnd = i => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export const FRAMES = [
  {
    id: 'classic', label: 'Classic', swatch: '#f4ecdc',
    draw(g) {
      g.fillStyle = '#f4ecdc'; border(g, 40, 18, 40, 18);
      g.fillStyle = '#2b2118';                               // the film-strip holes
      for (let y = 30; y < OUT_H - 20; y += 36) for (const x of [10, OUT_W - 30]) { roundRect(g, x, y, 20, 20, 5); g.fill(); }
      g.strokeStyle = 'rgba(122,106,88,0.45)'; g.lineWidth = 2; g.strokeRect(40, 18, OUT_W - 80, OUT_H - 36);
    },
  },
  {
    id: 'hearts', label: 'Hearts', swatch: '#f7bfd0',
    draw(g) {
      g.fillStyle = '#f9cfdb'; border(g, 34, 34, 34, 34);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(34, 34, OUT_W - 68, OUT_H - 68);
      g.fillStyle = '#e0587a';
      const step = 34;
      for (let x = 17, i = 0; x < OUT_W; x += step, i++) { heart(g, x, 17, 20); heart(g, OUT_W - x, OUT_H - 17, 20); }
      for (let y = 17 + step; y < OUT_H - 20; y += step) { heart(g, 17, y, 20); heart(g, OUT_W - 17, y, 20); }
      g.fillStyle = '#fff'; heart(g, OUT_W / 2, 17, 12); heart(g, OUT_W / 2, OUT_H - 17, 12);
    },
  },
  {
    id: 'stars', label: 'Midnight', swatch: '#1b2150',
    draw(g) {
      g.fillStyle = '#161a42'; border(g, 36, 36, 36, 36);
      g.strokeStyle = '#e6c878'; g.lineWidth = 3; g.strokeRect(36, 36, OUT_W - 72, OUT_H - 72);
      for (let i = 0; i < 46; i++) {
        const side = i % 4, k = rnd(i + 1), o = 8 + rnd(i + 90) * 20;
        const x = side === 0 ? k * OUT_W : side === 1 ? OUT_W - o : side === 2 ? k * OUT_W : o;
        const y = side === 0 ? o : side === 1 ? k * OUT_H : side === 2 ? OUT_H - o : k * OUT_H;
        g.fillStyle = i % 3 ? '#fff4cf' : '#e6c878';
        star(g, x, y, 3 + rnd(i + 7) * 6, i % 5 ? 4 : 5);
      }
      g.fillStyle = '#e6c878'; star(g, 36, 36, 12); star(g, OUT_W - 36, 36, 12); star(g, 36, OUT_H - 36, 12); star(g, OUT_W - 36, OUT_H - 36, 12);
    },
  },
  {
    id: 'polaroid', label: 'Polaroid', swatch: '#ffffff',
    draw(g) {
      g.fillStyle = '#fdfdfb'; border(g, 22, 22, 22, 92);
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.strokeRect(22, 22, OUT_W - 44, OUT_H - 114);
      g.fillStyle = '#6b5b4b'; g.font = `600 44px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('us, together', OUT_W / 2, OUT_H - 48);
    },
  },
  {
    id: 'gold', label: 'Red carpet', swatch: '#7e1428',
    draw(g) {
      g.fillStyle = '#7e1428'; border(g, 40, 40, 40, 40);
      g.strokeStyle = '#e8c36a'; g.lineWidth = 5; g.strokeRect(14, 14, OUT_W - 28, OUT_H - 28);
      g.lineWidth = 2; g.strokeRect(40, 40, OUT_W - 80, OUT_H - 80);
      g.fillStyle = '#e8c36a';
      for (let x = 40; x <= OUT_W - 40; x += 28) { g.beginPath(); g.arc(x, 27, 4, 0, 7); g.arc(x, OUT_H - 27, 4, 0, 7); g.fill(); }
      for (let y = 40; y <= OUT_H - 40; y += 28) { g.beginPath(); g.arc(27, y, 4, 0, 7); g.arc(OUT_W - 27, y, 4, 0, 7); g.fill(); }
    },
  },
];

/* ── stickers ── */

const stamp = ts => { const d = new Date(ts); const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())} ${p(d.getMonth() + 1)} ${String(d.getFullYear()).slice(2)}`; };

/** w is the width relative to the height; text stickers are wider than emoji */
export const STICKERS = [
  { id: 'heart', glyph: '\u{1F496}', w: 1 },
  { id: 'star', glyph: '⭐', w: 1 },
  { id: 'sparkle', glyph: '✨', w: 1 },
  { id: 'flower', glyph: '\u{1F338}', w: 1 },
  { id: 'tulip', glyph: '\u{1F337}', w: 1 },
  { id: 'crown', glyph: '\u{1F451}', w: 1 },
  { id: 'kiss', glyph: '\u{1F48B}', w: 1 },
  { id: 'ring', glyph: '\u{1F48D}', w: 1 },
  { id: 'mono', glyph: 'N + P', w: 2.1, text: true },
  { id: 'date', glyph: 'DATE', w: 2.6, text: true },
];
export const stickerDef = id => STICKERS.find(s => s.id === id);

/** the box a sticker covers, in picture pixels: { x, y, w, h } around its centre */
export function stickerBox(st) {
  const d = stickerDef(st.id);
  return { x: st.x, y: st.y, w: st.s * d.w, h: st.s };
}

export function drawSticker(g, st, ts) {
  const d = stickerDef(st.id);
  g.save();
  g.translate(st.x, st.y); g.rotate(st.r || 0);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (st.id === 'mono') {
    g.font = `700 ${st.s * 0.78}px ${HAND}`;
    g.lineJoin = 'round'; g.lineWidth = st.s * 0.16; g.strokeStyle = '#fff';
    g.strokeText(d.glyph, 0, 0); g.fillStyle = '#d8566e'; g.fillText(d.glyph, 0, 0);
  } else if (st.id === 'date') {
    const t = stamp(ts);
    g.font = `700 ${st.s * 0.62}px "Courier New", monospace`;
    g.lineJoin = 'round'; g.lineWidth = st.s * 0.14; g.strokeStyle = 'rgba(60,24,0,0.85)'; g.strokeText(t, 0, 0);
    g.fillStyle = '#ffa63a'; g.fillText(t, 0, 0);
  } else {
    g.font = `${st.s * 0.85}px ${EMOJI}`;
    g.fillText(d.glyph, 0, st.s * 0.04);
  }
  g.restore();
}

/** the picture, then the frame, then the stickers on top (so they may overlap the border) */
export function compose(g, base, frameId, stickers, ts) {
  g.clearRect(0, 0, OUT_W, OUT_H);
  g.drawImage(base, 0, 0, OUT_W, OUT_H);
  g.save(); FRAMES.find(f => f.id === frameId)?.draw(g); g.restore();
  for (const st of stickers) drawSticker(g, st, ts);
}
