/**
 * The floor plan, as pure data (no 3D here, so it can be checked from Node).
 * Rooms are rectangles of different sizes joined by doorways and short passages; a few
 * free-standing walls break up the big halls. Walls, photo positions, benches, plants and
 * the dog's walking route are all generated from this list.
 *
 * x runs east, z runs south (the entrance is at the south, the garden at the far north).
 */

const PI = Math.PI;
export const WALL_T = 0.3;
const M = 0.4;                      // how close you can walk to a wall
const O = WALL_T / 2 + 0.06;        // a frame's offset from the wall centre line

// The rooms along the red carpet are classic: warm ivory, stone and blush with a painted dado and
// grand plaster ceilings. The side rooms are bolder, the way a gallery gives each wing its own
// colour: slate blue, forest green, ink navy.
//   dado: colour of the lower wall panel   ceil/design/beam: the ceiling
const ROOMS = [
  { id: 'foyer',        label: 'Welcome',         x1: -12, x2: 12,  z1: -2,  z2: 12,  wall: 0xece5d6, ceil: 0x121214, design: 'white' },
  { id: 'hello',        label: 'How We Met',      x1: -14, x2: 14,  z1: -24, z2: -2,  wall: 0xe6d9c0, ceil: 0x121214, design: 'white' },
  { id: 'moments',      label: 'Little Moments',  x1: -28, x2: -14, z1: -22, z2: -8,  wall: 0x41586f, ceil: 0xdfe7ef, design: 'cove' },
  { id: 'adventures',   label: 'Adventures',      x1: 14,  x2: 40,  z1: -30, z2: -4,  wall: 0x35503f, ceil: 0x1f3128, design: 'beams',  beam: 0x6b4a32 },
  { id: 'glances',      label: 'Stolen Glances',  x1: -18, x2: 14,  z1: -36, z2: -24, wall: 0xd2cfc8, ceil: 0x121214, design: 'white' },
  { id: 'celebrations', label: 'Celebrations',    x1: -2,  x2: 26,  z1: -56, z2: -36, wall: 0xe9cdc4, ceil: 0x121214, design: 'white' },
  { id: 'dark',         label: 'Our Quiet Place', x1: -16, x2: -2,  z1: -56, z2: -44, wall: 0x1f2640, ceil: 0x0b0f20, design: 'stars' },
  { id: 'garden',       label: 'Memory Garden',   x1: -16, x2: 26,  z1: -78, z2: -56, wall: 0xd6ddcc, ceil: 0xf7f6f3, design: 'plain' },
  // past the garden: a short, wide entrance hall, then a little cinema for two (see Cinema.js). The way in from the hall is
  // at the far end of its inner wall, so you cannot see the screen from the garden.
  { id: 'cinemaHall',   label: 'Movie Night',     x1: 26,  x2: 32,  z1: -78, z2: -56, wall: 0x3b3e46, ceil: 0x15161a, design: 'plain', noPlants: true },
  { id: 'cinema',       label: 'Movie Night',     x1: 32,  x2: 50,  z1: -78, z2: -56, wall: 0x3b3e46, ceil: 0x0b0f20, design: 'stars', noPlants: true },
  // west of the garden, behind a gate that only opens on the 9th of every month (see SurpriseRoom.js)
  // north of the garden: a small domed star theatre (see Planetarium.js)
  { id: 'planetarium',  label: 'The Planetarium', x1: -3,  x2: 13,  z1: -96, z2: -78, wall: 0x141a38, ceil: 0x05060f, design: 'dome', noPlants: true, noNav: true },
  { id: 'surprise',     label: 'The Surprise Room', x1: -30, x2: -16, z1: -72, z2: -58, wall: 0x6e3b4c, ceil: 0x1a0f16, design: 'stars', noPlants: true, noNav: true },
];

// The red carpet: from the lobby door, round the lobby heart, through How We Met and Stolen Glances,
// across Celebrations and out into the Memory Garden. Straight runs with square turns.
export const CARPET = {
  w: 2.0,
  path: [[0, 11], [0, -31], [6, -31], [6, -50], [11, -50], [11, -62.5]],
  discs: [{ x: 0, z: 5.5, r: 1.8 }, { x: 11, z: -62.5, r: 1.3 }],     // under the lobby heart; the end of the road
};
/** is (x, z) on the carpet (or within `pad` metres of it)? */
export function onCarpet(x, z, pad = 0) {
  const P = CARPET.path, h = CARPET.w / 2 + pad;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    if (x >= Math.min(ax, bx) - h && x <= Math.max(ax, bx) + h && z >= Math.min(az, bz) - h && z <= Math.max(az, bz) + h) return true;
  }
  return CARPET.discs.some(d => Math.hypot(x - d.x, z - d.z) < d.r + pad);
}

// axis 'x': the wall runs along x at constant z = at.   axis 'z': it runs along z at constant x = at.
// Wide archways, so every room opens into the next and you can see far.
const DOORS = [
  { axis: 'x', at: -2,  from: -4,  to: 4 },     // foyer -> How We Met
  { axis: 'z', at: -14, from: -18, to: -12 },   // How We Met -> Little Moments
  { axis: 'z', at: 14,  from: -20, to: -12 },   // How We Met -> Adventures
  { axis: 'x', at: -24, from: -4,  to: 4 },     // How We Met -> Stolen Glances
  { axis: 'x', at: -36, from: 2,   to: 10 },    // Stolen Glances -> Celebrations
  { axis: 'z', at: -2,  from: -52, to: -47 },   // Celebrations -> Our Quiet Place
  { axis: 'x', at: -56, from: -12, to: -6 },    // Our Quiet Place -> Memory Garden
  { axis: 'x', at: -56, from: 6,   to: 16 },    // Celebrations -> Memory Garden
  { axis: 'z', at: 26,  from: -70, to: -62 },   // Memory Garden -> Movie Night hall
  { axis: 'z', at: 32,  from: -76, to: -71 },   // hall -> cinema (far end, out of line with the garden doorway)
  { axis: 'z', at: -16, from: -68, to: -62, noNav: true },   // Memory Garden -> Surprise Room (gated)
  { axis: 'x', at: -78, from: 3, to: 7, noNav: true },       // Memory Garden -> Planetarium (centred on the room, 4 m wide)
];

// Wall stretches kept free of photos (the record player and the photo booth live there)
const RESERVED = [{ room: 'dark', axis: 'x', at: -44 }, { room: 'celebrations', axis: 'z', at: 26 }, { room: 'celebrations', axis: 'x', at: -36 }];

// No free-standing walls: the rooms stay open
const PARTITIONS = [];

// How many photos hang in each room (the lobby feature photo is number 1)
const COUNTS = { hello: 6, moments: 4, adventures: 9, glances: 7, celebrations: 4, dark: 2, garden: 3 };
const ORDER = ['hello', 'moments', 'adventures', 'glances', 'celebrations', 'dark', 'garden'];
const BENCHES = { hello: 2, moments: 1, adventures: 3, glances: 2, celebrations: 2, dark: 1, garden: 2 };
const merge = list => {
  const s = [...list].sort((a, b) => a[0] - b[0]), out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
};

export function frameSize(aspect, scale = 1) {
  let ph, pw;
  if (aspect < 0.95) { ph = (aspect < 0.65 ? 2.15 : 1.95) * scale; pw = ph * aspect; }
  else { pw = 2.1 * scale; ph = pw / aspect; }
  const w = pw + 0.3, h = ph + 0.3;
  return { w, h, y: Math.max(1.9, 0.9 + h / 2) };
}

export function buildLayout(photos) {
  const errors = [];
  let seed = 7;                                   // fixed seed: the same plan every time
  const rngPick = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rooms = ROOMS.map(r => ({ ...r }));
  const byId = Object.fromEntries(rooms.map(r => [r.id, r]));
  const roomAt = (x, z) => rooms.find(r => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) || null;

  /* ── walls: every room edge, merged, with the doorways cut out ── */
  const lines = new Map();
  const addEdge = (axis, at, a, b) => {
    const k = `${axis}:${at}`;
    if (!lines.has(k)) lines.set(k, { axis, at, iv: [] });
    lines.get(k).iv.push([a, b]);
  };
  for (const r of rooms) {
    addEdge('x', r.z1, r.x1, r.x2); addEdge('x', r.z2, r.x1, r.x2);
    addEdge('z', r.x1, r.z1, r.z2); addEdge('z', r.x2, r.z1, r.z2);
  }
  const pieces = [];
  for (const l of lines.values()) {
    const solid = merge(l.iv);
    const gaps = DOORS.filter(d => d.axis === l.axis && d.at === l.at);
    for (const d of gaps) {
      if (!solid.some(([a, b]) => d.from >= a - 1e-6 && d.to <= b + 1e-6)) errors.push(`door ${l.axis}:${l.at} [${d.from},${d.to}] is not on a wall`);
    }
    for (const [a, b] of solid) {
      let cur = a;
      const mine = gaps.filter(d => d.from >= a - 1e-6 && d.to <= b + 1e-6).sort((p, q) => p.from - q.from);
      for (const d of mine) {
        if (d.from > cur + 1e-6) pieces.push({ axis: l.axis, at: l.at, from: cur, to: d.from, extendA: cur === a, extendB: false });
        cur = d.to;
      }
      if (b > cur + 1e-6) pieces.push({ axis: l.axis, at: l.at, from: cur, to: b, extendA: cur === a && !mine.length ? true : cur === a, extendB: true });
    }
  }
  for (const p of PARTITIONS) pieces.push({ ...p, extendA: true, extendB: true, partition: true });

  const sideRoom = (p, along, side) => {
    const n = WALL_T / 2 + 0.3;
    const x = p.axis === 'x' ? along : p.at + side * n;
    const z = p.axis === 'x' ? p.at + side * n : along;
    return roomAt(x, z);
  };

  /* ── where you can walk ── */
  const areas = rooms.map(r => [r.x1 + M, r.x2 - M, r.z1 + M, r.z2 - M]);
  for (const d of DOORS) {
    areas.push(d.axis === 'x' ? [d.from + M, d.to - M, d.at - 0.6, d.at + 0.6] : [d.at - 0.6, d.at + 0.6, d.from + M, d.to - M]);
  }
  const boxes = [];
  const circles = [];
  for (const p of PARTITIONS) {
    const len = (p.to - p.from) / 2, mid = (p.from + p.to) / 2;
    boxes.push(p.axis === 'x' ? { x: mid, z: p.at, hx: len + 0.35, hz: 0.5 } : { x: p.at, z: mid, hx: 0.5, hz: len + 0.35 });
  }
  const inAreas = (x, z) => areas.some(([x1, x2, z1, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);
  const hitsObstacle = (x, z) =>
    circles.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) ||
    boxes.some(b => Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz);
  const canWalk = (x, z) => inAreas(x, z) && !hitsObstacle(x, z);
  const discFree = (x, z, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => canWalk(x + dx, z + dz));
  const nearDoor = (x, z, d) => DOORS.some(g => {
    const cx = g.axis === 'x' ? Math.min(Math.max(x, g.from), g.to) : g.at;
    const cz = g.axis === 'x' ? g.at : Math.min(Math.max(z, g.from), g.to);
    return Math.hypot(x - cx, z - cz) < d;
  });

  /* ── photo walls ("runs") ── */
  const runs = [];
  for (const p of pieces) {
    const a0 = p.from - (p.extendA ? WALL_T / 2 : 0), b0 = p.to + (p.extendB ? WALL_T / 2 : 0);
    for (const side of [1, -1]) {
      let cur = null;
      for (let t = p.from + 0.05; t <= p.to - 0.05 + 1e-9; t += 0.1) {
        const r = sideRoom(p, t, side);
        if (cur && cur.room === (r && r.id)) cur.to = t; else {
          if (cur && cur.room) runs.push(cur);
          cur = { piece: p, axis: p.axis, at: p.at, side, room: r && r.id, from: t, to: t };
        }
      }
      if (cur && cur.room) runs.push(cur);
    }
    void a0; void b0;
  }
  for (const r of runs) { r.from += 0.65; r.to -= 0.65; r.len = Math.max(0, r.to - r.from); }
  const usable = runs.filter(r => r.len > 1.2 && !RESERVED.some(q => q.room === r.room && q.axis === r.axis && q.at === r.at));

  /* ── foyer feature photo: first photo, left of the entrance door ── */
  const photoSpots = [];
  const asp = i => photos[i].w / photos[i].h;
  const featureSize = (() => { const ph = 3.0, pw = ph * asp(0); return { w: pw + 0.3, h: ph + 0.3, y: 2.35 }; })();
  const featureX = -8;
  photoSpots.push({ room: 'foyer', x: featureX, z: -2 + O, ry: 0, size: featureSize, photoIdx: 0, feature: true, side: 1, axis: 'x', at: -2 });

  /* ── hang the rest, room by room ── */
  let next = 1;
  const scales = [1.12, 0.95, 1.2, 0.9, 1.05, 1.0];
  for (const roomId of ORDER) {
    const want = COUNTS[roomId];
    const cand = usable.filter(r => r.room === roomId);
    const room = byId[roomId];
    const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2;
    const mid = r => (r.axis === 'x' ? [(r.from + r.to) / 2, r.at] : [r.at, (r.from + r.to) / 2]);
    cand.sort((a, b) => { const [ax, az] = mid(a), [bx, bz] = mid(b); return Math.atan2(az - cz, ax - cx) - Math.atan2(bz - cz, bx - cx); });
    // photos gather on the longer walls (weight grows faster than length), leaving calm wall between groups
    const weight = r => r.len ** 1.9;
    const totalLen = cand.reduce((s, r) => s + weight(r), 0);
    if (!cand.length || !totalLen) { errors.push(`no wall for room ${roomId}`); continue; }
    const raw = cand.map(r => want * weight(r) / totalLen);
    const cnt = raw.map(Math.floor);
    let left = want - cnt.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - cnt[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) cnt[i]++; });
    const idxs = cand.map(() => []);
    cand.forEach((r, i) => { for (let k = 0; k < cnt[i]; k++) idxs[i].push(next++); });
    const sizesFor = (list, hero) => list.map((pi, k) => frameSize(asp(pi), scales[(k + (hero ? 0 : 3)) % scales.length]));
    // make sure every run fits; if not, shrink a little, or hand a photo to a roomier run
    for (let guard = 0; guard < 8; guard++) {
      let moved = false;
      cand.forEach((r, i) => {
        const sz = sizesFor(idxs[i]);
        const need = sz.reduce((s, f) => s + f.w, 0) + (sz.length + 1) * 0.55;
        if (need > r.len + 1e-6 && idxs[i].length > 1) {
          let best = -1, spare = 0;
          cand.forEach((r2, j) => {
            if (j === i) return;
            const s2 = sizesFor(idxs[j]);
            const sp = r2.len - (s2.reduce((s, f) => s + f.w, 0) + (s2.length + 2) * 0.9) - 1.8;
            if (sp > spare) { spare = sp; best = j; }
          });
          if (best >= 0) { idxs[best].push(idxs[i].pop()); moved = true; }
        }
      });
      if (!moved) break;
    }
    cand.forEach((r, i) => {
      if (!idxs[i].length) return;
      idxs[i].sort((a, b) => a - b);
      let sz = sizesFor(idxs[i]);
      let sum = sz.reduce((s, f) => s + f.w, 0);
      const room_for = r.len - (sz.length + 1) * 0.55;
      if (sum > room_for) {
        const k = Math.max(0.6, room_for / sum);
        sz = sz.map(f => ({ w: f.w * k, h: f.h * k, y: Math.max(1.9, 0.9 + f.h * k / 2) }));
        sum *= k;
        if (room_for / (sum / k) < 0.6) errors.push(`room ${roomId}: frames too tight on a wall`);
      }
      const gap = (r.len - sum) / (sz.length + 1);
      let pos = r.from + gap;
      idxs[i].forEach((pi, k) => {
        const f = sz[k], along = pos + f.w / 2;
        pos += f.w + gap;
        const spot = r.axis === 'x'
          ? { x: along, z: r.at + r.side * O, ry: r.side > 0 ? 0 : PI }
          : { x: r.at + r.side * O, z: along, ry: r.side > 0 ? PI / 2 : -PI / 2 };
        photoSpots.push({ room: roomId, ...spot, size: f, photoIdx: pi, side: r.side, axis: r.axis, at: r.at, run: r });
      });
    });
  }
  if (next !== photos.length) errors.push(`placed ${next} of ${photos.length} photos`);
  photoSpots.sort((a, b) => a.photoIdx - b.photoIdx);

  /* ── benches facing the nearest wall of pictures ── */
  const benchSpots = [];
  const benchFits = (x, z, alongX) => {
    const hx = alongX ? 1.3 : 0.5, hz = alongX ? 0.5 : 1.3;
    return [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]].every(([dx, dz]) => canWalk(x + dx, z + dz) && !onCarpet(x + dx, z + dz, 0.25)) &&
      !nearDoor(x, z, 1.8) && !benchSpots.some(b => Math.abs(b.x - x) < 3.2 && Math.abs(b.z - z) < 2.4);
  };
  const addBench = (x, z, alongX) => {
    if (!benchFits(x, z, alongX)) return false;
    const b = { x, z, ry: 0, face: 0 };
    let best = null, bd = Infinity;
    for (const p of photoSpots) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    b.face = Math.atan2(Math.sin(best.ry + PI), Math.cos(best.ry + PI));
    b.ry = b.face; b.facing = best;
    benchSpots.push(b);
    boxes.push({ x, z, hx: alongX ? 1.35 : 0.45, hz: alongX ? 0.45 : 1.35, bench: true });
    return true;
  };
  addBench(featureX, 1.8, true);
  for (const [roomId, n] of Object.entries(BENCHES)) {
    let made = 0;
    const cand = usable.filter(r => r.room === roomId && photoSpots.some(p => p.run === r));
    cand.sort((a, b) => b.len - a.len);
    for (const r of cand) {
      if (made >= n) break;
      const along = (r.from + r.to) / 2;
      for (const dist of [3.4, 3.0, 2.7, 3.8]) {
        const alongX = r.axis === 'x';
        const x = alongX ? along : r.at + r.side * dist, z = alongX ? r.at + r.side * dist : along;
        if (addBench(x, z, alongX)) { made++; break; }
      }
    }
  }

  /* ── pedestals with small sculptures, the lobby heart, the garden island ── */
  const pedestals = [];
  const kinds = ['sphere', 'knot', 'stack', 'torus'];
  for (const [roomId, k] of [['hello', 0], ['adventures', 1], ['celebrations', 2], ['moments', 3]]) {
    const r = byId[roomId], w = r.x2 - r.x1, d = r.z2 - r.z1;
    outer: for (const fx of [0.3, 0.7, 0.2, 0.8]) for (const fz of [0.3, 0.7, 0.5]) {
      const x = r.x1 + w * fx, z = r.z1 + d * fz;
      if (discFree(x, z, 0.9) && !nearDoor(x, z, 2.2) && !onCarpet(x, z, 1.1) &&!photoSpots.some(p => Math.hypot(p.x - x, p.z - z) < 1.2)) {
        pedestals.push({ x, z, kind: kinds[k] }); circles.push({ x, z, r: 0.55 }); break outer;
      }
    }
  }
  const heartPedestal = { x: 0, z: 5.5 };
  circles.push({ x: heartPedestal.x, z: heartPedestal.z, r: 0.6 });
  const gar = byId.garden;
  const planter = { x: (gar.x1 + gar.x2) / 2, z: (gar.z1 + gar.z2) / 2 + 1, r: 2.4 };
  circles.push({ x: planter.x, z: planter.z, r: planter.r + 0.3 });

  /* ── hidden spots for the love notes and hearts (chosen first, so plants leave them free) ── */
  const nookAt = (roomId, corner, taken = []) => {
    const r = byId[roomId];
    for (let k = 0; k < 4; k++) {
      const c = (corner + k) % 4, d = 0.95;
      const x = c % 2 ? r.x2 - d : r.x1 + d, z = c < 2 ? r.z1 + d : r.z2 - d;
      if (discFree(x, z, 0.5) && !nearDoor(x, z, 1.8) && !taken.some(q => Math.hypot(q.x - x, q.z - z) < 1.5) &&
          !photoSpots.some(p => Math.hypot(p.x - x, p.z - z) < 1.1) && !benchSpots.some(b => Math.hypot(b.x - x, b.z - z) < 2)) return { x, z, room: roomId };
    }
    return null;
  };
  const noteSpots = ['foyer', 'hello', 'moments', 'adventures', 'glances', 'celebrations'].map((r, i) => nookAt(r, (i * 3 + 1) % 4)).filter(Boolean);
  const heartSpots = [];
  ['foyer', 'hello', 'moments', 'adventures', 'glances', 'celebrations', 'dark', 'garden'].forEach((r, i) => {
    const s = nookAt(r, (i * 2 + 2) % 4, [...noteSpots, ...heartSpots]);
    if (s) heartSpots.push(s);
  });

  /* ── plants in corners ── */
  const plants = [];
  const types = ['tree', 'snake', 'bush', 'tree', 'bush', 'snake'];
  let ti = 0;
  const tryPlant = (x, z, t) => {
    const rad = t === 'tree' ? 0.5 : 0.38;
    if (!discFree(x, z, rad + 0.05) || nearDoor(x, z, 1.7) || onCarpet(x, z, rad + 0.25)) return false;
    if (photoSpots.some(p => Math.hypot(p.x - x, p.z - z) < p.size.w / 2 + 0.55)) return false;
    if (plants.some(q => Math.hypot(q.x - x, q.z - z) < 1.6)) return false;
    if (benchSpots.some(b => Math.hypot(b.x - x, b.z - z) < 1.9)) return false;
    if ([...noteSpots, ...heartSpots].some(n => Math.hypot(n.x - x, n.z - z) < 1.5)) return false;
    plants.push({ t, x, z }); circles.push({ x, z, r: rad });
    return true;
  };
  for (const r of rooms) {
    if (r.corridor || r.noPlants) continue;
    const d = 1.15;
    const corners = [[r.x1 + d, r.z1 + d], [r.x2 - d, r.z1 + d], [r.x1 + d, r.z2 - d], [r.x2 - d, r.z2 - d]];
    for (const [x, z] of corners) tryPlant(x, z, types[ti++ % types.length]);
  }
  for (const [x, z] of [[-5.2, -0.9], [5.2, -0.9], [-10, 10.2], [10, 10.2], [-5, 11], [5, 11]]) tryPlant(x, z, types[ti++ % types.length]);
  // fill in along the walls, a few per room, wherever there is clear space
  for (const r of rooms) {
    if (r.corridor || r.noPlants) continue;
    const want = Math.min(7, Math.round(((r.x2 - r.x1) * (r.z2 - r.z1)) / 55));
    let have = plants.filter(p => p.x >= r.x1 && p.x <= r.x2 && p.z >= r.z1 && p.z <= r.z2).length, tries = 0;
    const d = 1.0, ring = [];
    for (let x = r.x1 + d; x <= r.x2 - d; x += 3.1) { ring.push([x, r.z1 + d], [x, r.z2 - d]); }
    for (let z = r.z1 + d; z <= r.z2 - d; z += 3.1) { ring.push([r.x1 + d, z], [r.x2 - d, z]); }
    ring.sort(() => rngPick() - 0.5);
    for (const [x, z] of ring) {
      if (have >= want || tries++ > 60) break;
      if (tryPlant(x, z, types[ti++ % types.length])) have++;
    }
  }

  /* ── the dog's walking route (and the bird's flight route) ── */
  const nodes = {};
  const ids = [];
  const addNode = (x, z) => { if (!canWalk(x, z)) return null; const id = `n${ids.length}`; nodes[id] = [x, z]; ids.push(id); return id; };
  for (const r of rooms) {
    if (r.noNav) continue;
    const step = r.corridor ? 3.2 : 4.6;
    for (let x = r.x1 + 1.3; x <= r.x2 - 1.3 + 1e-6; x += step) {
      for (let z = r.z1 + 1.3; z <= r.z2 - 1.3 + 1e-6; z += step) addNode(x, z);
    }
    if (r.corridor) addNode((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2);
  }
  for (const d of DOORS) {
    if (d.noNav) continue;
    const mid = (d.from + d.to) / 2;
    for (const off of [-1.4, 0, 1.4]) {
      if (d.axis === 'x') addNode(mid, d.at + off); else addNode(d.at + off, mid);
    }
  }
  const segFree = (a, b) => {
    const [ax, az] = nodes[a], [bx, bz] = nodes[b], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3);
    for (let i = 1; i < n; i++) if (!canWalk(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return false;
    return true;
  };
  const edges = [];
  for (let i = 0; i < ids.length; i++) {
    const near = [];
    for (let j = i + 1; j < ids.length; j++) {
      const d = Math.hypot(nodes[ids[i]][0] - nodes[ids[j]][0], nodes[ids[i]][1] - nodes[ids[j]][1]);
      if (d <= 7 && segFree(ids[i], ids[j])) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([, j]) => edges.push([ids[i], ids[j]]));
  }

  /* ── overall size, for the floor and ceiling ── */
  const bounds = rooms.reduce((b, r) => ({ x1: Math.min(b.x1, r.x1), x2: Math.max(b.x2, r.x2), z1: Math.min(b.z1, r.z1), z2: Math.max(b.z2, r.z2) }),
    { x1: Infinity, x2: -Infinity, z1: Infinity, z2: -Infinity });

  return {
    carpet: CARPET, onCarpet, rooms, byId, doors: DOORS, pieces, partitions: PARTITIONS, roomAt, sideRoom, areas, boxes, circles, canWalk,
    photoSpots, benchSpots, plants, pedestals, heartPedestal, planter, nav: { nodes, edges }, noteSpots, heartSpots,
    bounds, errors, spawn: { x: 0, z: 8 }, featureX, runs: usable,
  };
}
