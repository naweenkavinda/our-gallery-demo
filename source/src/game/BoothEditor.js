import { OUT_W, OUT_H, MAX_STICKERS, FRAMES, STICKERS, stickerBox, compose } from './BoothStickers.js';

/**
 * The booth's result screen: choose a frame, tap stickers onto the picture, drag them around, then
 * save. The preview canvas is the real picture, so what you see is what lands on the wall.
 * Touch and mouse both work (pointer events); a selected sticker shows a corner x and a resize dot.
 */
export function createBoothEditor({ showToast }) {
  const root = document.createElement('div'); root.className = 'booth-edit'; root.hidden = true;
  root.innerHTML = `
    <div class="be-card">
      <div class="be-stage"><canvas width="${OUT_W}" height="${OUT_H}"></canvas>
        <div class="be-sel" hidden><button class="be-x" type="button" aria-label="Remove sticker">&times;</button><span class="be-grow"></span></div>
      </div>
      <div class="be-side">
        <h2>Your photo strip</h2>
        <div class="be-label">Frame</div>
        <div class="be-frames">${FRAMES.map(f => `<button type="button" data-frame="${f.id}"><i style="background:${f.swatch}"></i>${f.label}</button>`).join('')}</div>
        <div class="be-label">Stickers <span class="be-count"></span></div>
        <div class="be-stickers">${STICKERS.map(s => `<button type="button" data-sticker="${s.id}" class="${s.text ? 'txt' : ''}">${s.id === 'date' ? 'date' : s.glyph}</button>`).join('')}</div>
        <div class="be-actions"><button type="button" class="be-dl">Download</button><button type="button" class="be-save">Save to the wall</button></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const canvas = root.querySelector('canvas'), g = canvas.getContext('2d');
  const sel = root.querySelector('.be-sel'), countEl = root.querySelector('.be-count');
  let base = null, ts = 0, frame = FRAMES[0].id, stickers = [], picked = null, drag = null, done = null;

  const draw = () => {
    if (!base) return;
    compose(g, base, frame, stickers, ts);
    root.querySelectorAll('[data-frame]').forEach(b => b.classList.toggle('on', b.dataset.frame === frame));
    countEl.textContent = `${stickers.length}/${MAX_STICKERS}`;
    if (!picked) { sel.hidden = true; return; }
    const b = stickerBox(picked);                                       // the selection box, in percent of the picture
    sel.hidden = false;
    sel.style.left = (b.x - b.w / 2) / OUT_W * 100 + '%'; sel.style.top = (b.y - b.h / 2) / OUT_H * 100 + '%';
    sel.style.width = b.w / OUT_W * 100 + '%'; sel.style.height = b.h / OUT_H * 100 + '%';
  };
  const at = e => {                                                     // pointer position in picture pixels
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * OUT_W, y: (e.clientY - r.top) / r.height * OUT_H };
  };
  const hit = p => {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const b = stickerBox(stickers[i]);
      if (Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) return stickers[i];
    }
    return null;
  };

  canvas.addEventListener('pointerdown', e => {
    const p = at(e), s = hit(p);
    picked = s; drag = s ? { kind: 'move', dx: s.x - p.x, dy: s.y - p.y } : null;
    if (s) { stickers.splice(stickers.indexOf(s), 1); stickers.push(s); canvas.setPointerCapture(e.pointerId); }
    draw();
  });
  canvas.addEventListener('pointermove', e => {
    if (drag?.kind !== 'move' || !picked) return;
    const p = at(e);
    picked.x = Math.max(0, Math.min(OUT_W, p.x + drag.dx)); picked.y = Math.max(0, Math.min(OUT_H, p.y + drag.dy));
    draw();
  });
  const release = () => { drag = null; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);

  const grow = root.querySelector('.be-grow');
  grow.addEventListener('pointerdown', e => {
    if (!picked) return;
    e.stopPropagation(); grow.setPointerCapture(e.pointerId);
    const p = at(e);
    drag = { kind: 'grow', s: picked.s, d: Math.hypot(p.x - picked.x, p.y - picked.y) || 1 };
  });
  grow.addEventListener('pointermove', e => {
    if (drag?.kind !== 'grow' || !picked) return;
    const p = at(e);
    picked.s = Math.max(40, Math.min(260, drag.s * Math.hypot(p.x - picked.x, p.y - picked.y) / drag.d));
    draw();
  });
  grow.addEventListener('pointerup', release); grow.addEventListener('pointercancel', release);

  root.querySelector('.be-x').addEventListener('click', () => {
    stickers = stickers.filter(s => s !== picked); picked = null; draw();
  });
  root.querySelector('.be-frames').addEventListener('click', e => {
    const b = e.target.closest('[data-frame]'); if (!b) return;
    frame = b.dataset.frame; draw();
  });
  root.querySelector('.be-stickers').addEventListener('click', e => {
    const b = e.target.closest('[data-sticker]'); if (!b) return;
    if (stickers.length >= MAX_STICKERS) { showToast(`That is plenty: ${MAX_STICKERS} stickers at most. Tap one to remove it.`, 2800); return; }
    const text = b.classList.contains('txt');
    picked = {
      id: b.dataset.sticker, s: text ? 84 : 110, r: (Math.random() - 0.5) * 0.3,
      x: OUT_W / 2 + (Math.random() - 0.5) * 140, y: OUT_H / 2 + (Math.random() - 0.5) * 220,
    };
    stickers.push(picked); draw();
  });

  const bake = () => { picked = null; draw(); return canvas; };           // the selection box is DOM, so the canvas is already clean
  root.querySelector('.be-dl').addEventListener('click', () => {
    const a = document.createElement('a'); a.download = 'our-photo-strip.jpg'; a.href = bake().toDataURL('image/jpeg', 0.92);
    document.body.appendChild(a); a.click(); a.remove();
  });
  root.querySelector('.be-save').addEventListener('click', () => { const cb = done, c = bake(); close(); cb?.(c); });

  // keys belong to the editor while it is open (no walking off, no second photo): Enter saves
  window.addEventListener('keydown', e => {
    if (root.hidden) return;
    e.stopPropagation();
    if (e.code === 'Enter') root.querySelector('.be-save').click();
  }, true);

  function close() { root.hidden = true; base = null; done = null; }

  return {
    get isOpen() { return !root.hidden; },
    /** base: the raw picture canvas; onSave(canvas) gets the finished picture */
    open(baseCanvas, when, onSave) {
      base = baseCanvas; ts = when; done = onSave;
      frame = FRAMES[0].id; stickers = []; picked = null; drag = null;
      root.hidden = false; draw();
    },
  };
}
