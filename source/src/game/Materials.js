import * as THREE from 'three';
import { LOW_MEM } from './LowMem.js';

/**
 * Real-world materials: photo-scanned PBR texture sets from Poly Haven (CC0) with colour, normal
 * and roughness maps. Each set lives in public/textures/<name>/{diff,nor,rough}.jpg.
 */

const loader = new THREE.TextureLoader();
const bases = new Map();
const cache = new Map();

// Each picture is loaded and uploaded to the graphics card once. A surface that repeats it a different number of
// times gets a clone, which shares the same upload (before, every repeat count was its own copy: 148 textures).
function base(name, kind, srgb) {
  const key = `${name}/${kind}`;
  if (bases.has(key)) return bases.get(key);
  const t = loader.load(`./textures/${name}/${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = LOW_MEM ? 4 : 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  bases.set(key, t);
  return t;
}

function tex(name, kind, srgb, rx, ry) {
  const key = `${name}/${kind}/${rx}/${ry}`;
  if (cache.has(key)) return cache.get(key);
  const t = base(name, kind, srgb).clone();
  t.repeat.set(rx, ry);
  cache.set(key, t);
  return t;
}

/** maps for a texture set, repeated rx x ry times over the surface */
export function pbr(name, rx = 1, ry = 1, normal = 0.8) {
  return {
    map: tex(name, 'diff', true, rx, ry),
    normalMap: tex(name, 'nor', false, rx, ry),
    normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: tex(name, 'rough', false, rx, ry),
  };
}
/** Scale a box's UVs so a texture that is `tile` metres wide keeps its real size on every face. */
export function boxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
