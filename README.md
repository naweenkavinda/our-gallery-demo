# Our Gallery (Demo)

A walk-through 3D gallery with a planetarium, a cinema and a dog you can play, built with three.js.

▶ **[Open it live](https://naweenkavinda.github.io/our-gallery-demo/)**. Works on phones (hold it sideways), tablets and computers. Source: [`source/`](source).

## What it does

- You come in as Teddy, the gallery dog. Walk with W A S D (or the stick on a phone), run with Shift, hop with Space, and press 1 to 3 for tricks. Press E at a picture to look closer, or anywhere else to bark. Press 9 to slide up the full list of controls.
- Rooms along a red carpet, each with its own colour, ceiling and lighting. A garden has a skylight that follows the real time of day, and a planetarium behind a pair of doors fills its dome with stars: press E at the projector to change the sky.
- A small cinema with a popcorn stand, a hidden room behind an iron gate, eight hidden hearts and six notes to find. Press G near the dog for a hint that names the room, its wall colour and the nearest picture.

## Notes and limits

- This is the cut-down public copy of a private gallery. Every picture here is drawn by a script, the names are made up, and there are no people in it.
- No server: the two-player parts of the private version (voice chat, shared photo booth, mailbox) are switched off, so you explore on your own.
- Needs a browser with WebGL. Phones get lighter textures so the page does not run out of memory.

## Tech

- three.js 3D scene: rooms generated from a floor plan, spotlights, shadows, a real-time sky
- Vite build, written to the repository root so GitHub Pages can serve it (the source is in `source/`)
- Procedural sound and pictures: music, chimes and the gallery art are all generated, not downloaded
- Assets: floor and wall textures and the potted plants from Poly Haven (CC0), the dog model by Quaternius (CC0)

---

Part of my portfolio: [naweenkavinda.github.io/portfolio](https://naweenkavinda.github.io/portfolio/)
