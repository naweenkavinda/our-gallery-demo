import photos from '../config/photos.json';

/**
 * While you are choosing a character the browser has nothing else to do, so it quietly downloads the things
 * the gallery will need first (textures, plants, the dog, the photo previews). When you walk in they are already
 * in the browser's cache. Low priority, three at a time, and nothing here can ever block or break the game.
 */
const TEXTURES = ['marble_01', 'beige_wall_001', 'oak_veneer_01', 'black_oak_veneer', 'velour_velvet']
  .flatMap(n => ['diff', 'nor', 'rough'].map(k => `./textures/${n}/${k}.jpg`));

let started = false;

export function warmAssets() {
  if (started) return;
  started = true;
  const urls = [
    ...photos.map(p => `./photos/t/${p.file}`),
    ...['01', '02', '04'].map(i => `./models/plants-lite/potted_plant_${i}.glb`),
    './models/animals/shiba.glb',
    ...TEXTURES,
  ];
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try { const r = await fetch(url, { priority: 'low' }); await r.arrayBuffer(); } catch { /* it will simply load later */ }
    }
  };
  for (let i = 0; i < 3; i++) worker();
}
