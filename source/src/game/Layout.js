import photos from '../config/photos.json';
import { buildLayout, WALL_T } from './layoutCore.js';

export const PHOTOS = photos;
export const LAYOUT = buildLayout(photos);
export { WALL_T };

if (LAYOUT.errors.length) console.warn('[Layout]', LAYOUT.errors);
