# Two-Player Life Sim — Plan

An original, cosy life-simulation game for two people. Each of you plays your own character in a shared house: build and furnish it together, look after your characters' needs, and do things together. It belongs to the life-sim genre but is our own design. It is not a copy of any existing game. No borrowed names, UI, logos, invented languages or icons.

Working title: **"Our Place"** (rename anytime).

---

## 1. Core idea

| Pillar | What it means in play |
|---|---|
| **Two players, one home** | Both of you are online in the same house at once, each controlling your own character. Changes show up for the other person straight away. |
| **Build & decorate together** | A grid-based build mode: walls, floors, doors, windows, then furniture from a catalogue. Either of you can place items, and the other sees them appear. |
| **Needs & moods** | Each character has 5 needs: Energy, Hunger, Fun, Social, Hygiene. Objects meet those needs, and mood comes from how the needs are doing. |
| **Do things together** | Shared actions: cook and eat together, watch TV, dance, play a board game, sleep. Doing things together raises a shared "Bond" meter that unlocks new interactions and items. |
| **Days & money** | A day/night cycle (we already have a real-time sky from the gallery). Simple jobs or hobbies earn money, and money buys furniture. |
| **Saves** | The house and characters save to the server, so you can pick it up again tomorrow. |

**Out of scope for v1:** NPC townsfolk, aging and life stages, multiple lots, pets (but Teddy the dog from the gallery could come back later), and open-world neighbourhoods.

---

## 2. Tech stack (reuses what the gallery already proves)

The gallery repo already runs three.js, a Vite build, GitHub Pages, Poly Haven textures, Quaternius models and a phone-friendly control layer. The private version even had two-player features. So we stay on the same stack:

| Layer | Choice | Why |
|---|---|---|
| Rendering | **three.js** (+ GLTFLoader, KTX2/Draco/Meshopt) | You already know it. Runs in any browser, including phones. |
| Build | **Vite + TypeScript** | Same as the gallery. TypeScript helps once the game logic grows. |
| Multiplayer | **Colyseus** (Node.js, MIT) | Authoritative rooms with automatic state sync. Better for two players than raw WebRTC, which needs STUN/TURN and signalling. |
| Hosting | Client on **GitHub Pages**, server on a small VPS / Fly.io / Colyseus Cloud (~$15/mo) | The client stays free. The server only needs to handle one room. |
| Persistence | SQLite (or JSON files) on the server | One house and two characters, so no real database is needed. |
| Pathfinding | Grid A* on the build grid | The house is a grid anyway, so a navmesh isn't worth it. |
| Characters | Rigged GLB humanoids + **Quaternius Universal Animation Library** (CC0, 250+ animations) | Walk, sit, sleep, eat, dance and idle animations are all included. |
| Asset pipeline | Blender (headless) + **glTF Transform** | Convert, decimate, compress and generate thumbnails. |

Optional later: voice chat over WebRTC (the gallery had it), and a "photo mode" that saves screenshots (the gallery's photo booth).

---

## 3. Assets — where they come from

### 3a. NVIDIA SimReady on Hugging Face (the library you saw)

- **What:** `nvidia/simready-assets`, ~2,677 OpenUSD assets, ~490 GB in total, released through SimReady Central (Oct 2026).
- **License:** Packages declare **CC-BY-4.0** (free to use, including in games, **with credit to NVIDIA**). But SimReady Central also lists community assets under other licences, including **non-commercial CC-BY-NC**, so **read each package's licence file**.
- **Format:** OpenUSD (`.usd` / `.usda`) with MDL materials. three.js can't load these directly, so they need converting to GLB.
- **Conversion route** (the same one a community GLB mirror, `codepawl/simready-glb`, already uses):
  1. Import the USD in Blender (headless script).
  2. Delete the physics, collision, proxy and grasp-helper prims.
  3. Export GLB, then run glTF Transform: weld, simplify (decimate), compress textures to KTX2, Meshopt.
  4. You lose physics metadata and MDL-only shader effects, which a game doesn't need anyway.
- **Honest caveats:**
  - The library is built for **robotics and industrial simulation**: warehouses, workbenches, shelving, boxes, tools, appliances. Home furniture is a small slice of it.
  - The models are **photoreal and heavy**. Next to stylised assets they will look out of place, and they will hurt frame rate on phones unless they're heavily decimated.
  - **Don't download all 490 GB.** Download only the categories you pick, or start from the community GLB mirror.
- **Best use for us:** realistic kitchen appliances, a garage or workshop room, tools, boxes and clutter, and possibly a "realistic" art-style mode later.

### 3b. Better fit for a cosy home (stylised, CC0, already GLB/glTF)

| Source | What | Licence |
|---|---|---|
| **KayKit / Kay Lousberg "Furniture Bits"** | 50+ low-poly furniture pieces, glTF | CC0 |
| **Quaternius** (furniture, characters, Universal Animation Library) | Furniture, rigged humans, 250+ animations | CC0 |
| **Kenney** (Furniture Kit, Animated Characters) | Furniture, simple rigged characters, glTF | CC0 |
| **OpenGameArt "Tiny Treats Homely House"** | 16+ house props, glTF | CC0 |
| **Mastjie "Low Poly Household Goods"** | 25 household items, glTF | Free for personal and commercial use |
| **Poly Haven / ambientCG** | Floor, wall and fabric textures, HDRIs, some props | CC0 (already used in the gallery) |
| **Mesh2Motion** | Free open-source auto-rigger, a Mixamo alternative, exports GLB | Open source |
| **Mixamo** | More animations (needs an Adobe account, no longer updated) | Free to use |

### 3c. Decision: pick ONE art style

Recommendation: **stylised low-poly (KayKit + Quaternius + Kenney) as the main look**, with SimReady items added only where they've been decimated and re-textured to match. It loads fast, runs on phones, and everything matches. The alternative is a photoreal look built around SimReady, which takes far more conversion work and needs a strong GPU.

### 3d. Asset catalogue format

Every item gets one entry in `assets/catalog.json`:

```json
{ "id": "sofa_2seat_blue", "file": "furniture/sofa_2seat_blue.glb",
  "category": "living", "price": 450, "footprint": [2,1],
  "slots": ["sit","sit"], "satisfies": {"energy": 1, "fun": 0},
  "source": "KayKit", "license": "CC0", "credit": "" }
```

- `footprint` sets the grid cells the item takes up. `slots` are the places a character can sit or stand to use it. `satisfies` sets which needs it meets.
- The `license` and `credit` fields feed an automatic **Credits** screen, which CC-BY (NVIDIA) requires.

---

## 4. Milestones

Each milestone ends with something you can both play.

| # | Milestone | Done when | Rough effort |
|---|---|---|---|
| **M0** | **Repo + asset pipeline** | New repo with Vite + TypeScript + three.js. A script turns a folder of GLB/USD into optimised GLB files, thumbnails and `catalog.json`. 30 starter items are in. | 2–3 evenings |
| **M1** | **One character in a room** | Click the floor to walk there (A* on the grid). Third-person camera that can rotate and zoom. Idle and walk animations. | 3–4 evenings |
| **M2** | **Two players** | Colyseus server; both of you join the same room by code. You see each other walk around, live. | 2–3 evenings |
| **M3** | **Build mode** | Draw walls, paint floors, place doors and windows. Pick items from the catalogue, place, rotate and sell them. Synced to both players. | 5–7 evenings |
| **M4** | **Needs & actions** | 5 needs that slowly drop. Click an object for an action menu (Sit, Sleep, Eat, Shower, Watch TV). Animations play at the object's slots. Mood face above each character. | 5–6 evenings |
| **M5** | **Together actions & Bond** | Paired interactions (chat, hug, dance, cook together, eat at the same table). A Bond meter with unlockable items. | 3–4 evenings |
| **M6** | **Character creator** | Body presets, skin tone, hair, outfit colours (material swaps on CC0 base meshes). Names. | 3–4 evenings |
| **M7** | **Time, money, saving** | Day/night cycle (reuse the gallery sky), a simple job or hobby that earns money, the server saves the house, auto-save. | 3–4 evenings |
| **M8** | **Polish** | Sound (procedural, like the gallery), music, photo mode, phone controls, Credits screen, performance pass. | ongoing |

**First playable together: end of M2, about 2 weeks.** The "real game" feeling arrives around M4–M5.

---

## 5. Project layout (new repo)

```
our-place/
  client/            Vite + three.js + TypeScript
    src/engine/      renderer, camera, input, loaders
    src/world/       grid, walls, pathfinding, build mode
    src/sim/         needs, actions, interactions (shared with server)
    src/ui/          catalogue, needs panel, menus
  server/            Colyseus room + persistence
  shared/            types and sim rules used by both sides
  tools/pipeline/    usd→glb, optimise, thumbnails, catalog builder
  assets/            optimised GLB + catalog.json (raw downloads git-ignored)
  CREDITS.md         generated from catalog.json
```

Large raw downloads (SimReady USD files, original packs) are **not committed**. Only the optimised GLB files go in the repo, and Git LFS takes over if they grow past a few hundred MB.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Mixed art styles look messy | Pick one style (3c). Run every asset through the same material and colour pass. |
| SimReady files are huge and heavy | Download selectively, decimate, compress to KTX2, and set a per-item triangle budget (e.g. ≤ 5k). |
| Licence mix-ups (CC-BY vs CC-BY-NC) | `license` is a required catalogue field. The pipeline refuses `NC` licences unless the game is kept private. A credits screen is generated automatically. |
| Character animation is hard | Use CC0 rigs that share one skeleton plus the Quaternius animation library. Don't hand-animate. |
| Scope creep | v1 = one house, two people. Nothing else until M7 is done. |
| Too close to an existing commercial game | Own name, own UI, own icons. No borrowed sounds, languages or symbols. |

---

## 7. Next steps

1. **Create the new empty GitHub repo** (e.g. `naweenkavinda/our-place`) and send me the name. I'll attach it and set up M0.
2. **Allow `huggingface.co`** (and `cdn-lfs.huggingface.co`) in this environment's network settings so the pipeline can pull SimReady assets. Right now it's blocked.
3. **Pick the art style:** stylised low-poly (recommended) or photoreal.
4. Optional: decide where the server runs (Fly.io free tier, a VPS, or Colyseus Cloud).
