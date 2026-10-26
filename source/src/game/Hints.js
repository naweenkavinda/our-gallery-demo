import config from '../config/gallery.json';
import { LAYOUT } from './Gallery.js';
import { PHOTOS } from './Layout.js';

/**
 * Words for a spot in the gallery, so a clue says where to look instead of "in a corner":
 * the room and the colour of its walls, which part of the room, the nearest photo (by its date or
 * caption) and the nearest thing to look for (a bench, a plant, a doorway).
 */

const COLOURS = [
  ['warm ivory', 0xece5d6], ['sand', 0xe6d9c0], ['slate blue', 0x41586f], ['forest green', 0x35503f], ['pale stone grey', 0xd2cfc8],
  ['blush pink', 0xe9cdc4], ['ink navy', 0x1f2640], ['soft sage', 0xd6ddcc], ['deep rose', 0x6e3b4c], ['charcoal', 0x3b3e46],
];
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
function colourName(hex) {
  const a = rgb(hex);
  let best = COLOURS[0][0], bd = Infinity;
  for (const [name, h] of COLOURS) {
    const b = rgb(h), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const prettyDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : ''; };

const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);

function roomPhrase(room) {
  const label = room.id === 'foyer' ? 'the Welcome lobby' : room.label;
  return `in ${label}, where the walls are ${colourName(room.wall)}`;
}

/** which part of the room: a corner, along a wall, or out in the open (north is the garden end) */
function whereIn(room, x, z) {
  const toW = x - room.x1, toE = room.x2 - x, toN = z - room.z1, toS = room.z2 - z;
  const nearX = Math.min(toW, toE), nearZ = Math.min(toN, toS);
  const ns = toN < toS ? 'north' : 'south', ew = toW < toE ? 'west' : 'east';
  if (nearX < 2.8 && nearZ < 2.8) return `in the ${ns}-${ew} corner`;
  if (Math.min(nearX, nearZ) < 2.4) return `along the ${nearX < nearZ ? ew : ns} wall`;
  return 'out in the open, away from the walls';
}

function nearPhoto(x, z) {
  let best = null, bd = 10;
  LAYOUT.photoSpots.forEach((p, i) => { const d = dist(x, z, p); if (d < bd) { bd = d; best = i; } });
  if (best == null) return '';
  const caption = config.captions?.[String(best + 1)];
  const date = prettyDate(PHOTOS[best]?.date);
  const how = bd < 4.6 ? 'close to' : 'not far from';
  if (caption && caption.length <= 36 && !/^\d/.test(caption)) return `${how} the photo "${caption}"`;
  return date ? `${how} the photo from ${date}` : '';
}

function nearThing(room, x, z) {
  const d = LAYOUT.heartPedestal && dist(x, z, LAYOUT.heartPedestal);
  if (d != null && d < 3.6) return 'near the heart on its round pedestal';
  if (LAYOUT.planter && dist(x, z, LAYOUT.planter) < LAYOUT.planter.r + 1.6) return 'by the island with the big tree';
  if (LAYOUT.benchSpots.some(b => dist(x, z, b) < 3)) return 'beside a bench';
  const plant = LAYOUT.plants.find(p => dist(x, z, p) < 2.4);
  if (plant) return plant.t === 'tree' ? 'next to a tall tree' : 'next to a plant';
  if (LAYOUT.pedestals.some(p => dist(x, z, p) < 3)) return 'near a sculpture on a pedestal';
  for (const d2 of LAYOUT.doors) {
    const cx = d2.axis === 'x' ? Math.min(Math.max(x, d2.from), d2.to) : d2.at;
    const cz = d2.axis === 'x' ? d2.at : Math.min(Math.max(z, d2.from), d2.to);
    if (Math.hypot(x - cx, z - cz) > 3.2) continue;
    const mid = (d2.from + d2.to) / 2, side = d2.axis === 'x' ? [[mid, d2.at - 1.5], [mid, d2.at + 1.5]] : [[d2.at - 1.5, mid], [d2.at + 1.5, mid]];
    const other = side.map(([sx, sz]) => LAYOUT.roomAt(sx, sz)).find(r => r && r.id !== room.id);
    if (other) return `near the doorway to ${other.id === 'foyer' ? 'the Welcome lobby' : other.label}`;
  }
  return '';
}

/** e.g. "in Little Moments, where the walls are slate blue: in the north-west corner, close to the photo from 11 July, beside a plant" */
export function describeSpot(spot) {
  const room = (spot.room && LAYOUT.byId[spot.room]) || LAYOUT.roomAt(spot.x, spot.z);
  if (!room) return 'somewhere in the gallery';
  const parts = [whereIn(room, spot.x, spot.z), nearPhoto(spot.x, spot.z), nearThing(room, spot.x, spot.z)].filter(Boolean);
  return `${roomPhrase(room)}: ${parts.join(', ')}`;
}
