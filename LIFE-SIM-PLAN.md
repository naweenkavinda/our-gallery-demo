# Our Place — Plan (v2: a living city)

An original two-player city life sim. Each player has a named character who lives in a shared city around the clock. When you're online you steer your character. When you're away, it goes about its day on its own: walking between buildings, working, reading, playing. You earn credits by being in the game and by doing activities in buildings, and you spend them in the shop on new buildings and roads.

It belongs to the genre, but it's our own design. It isn't a copy of any existing game: no borrowed names, UI, icons or sounds.

**Playable prototype:** https://claude.ai/artifact/X8UiY49z5Q5xomjo6edxs4 (source: `prototype/our-place.html`)

---

## 1. Rules of the game

| System | Rule |
|---|---|
| **Characters** | One per player account. You pick a name and a shirt colour at first login. The character is drawn on the map at all times. |
| **Control** | Only the logged-in owner can move their character: WASD/arrows, click or tap to walk, Shift to run. |
| **Away mode** | When you're offline, your character follows a deterministic daily routine. Every 45 seconds it picks one of the 12 buildings nearest its home, walks there along the roads, and does that building's activity. Every viewer computes the same thing from the clock, so nobody needs a server to "run" the characters. |
| **Activities** | Walk into a building and its button appears ("Read books · 6s · +25"). Activities take 5–10 seconds, and longer ones pay more. Moving cancels the activity. |
| **Credits** | +1 credit every second you're in the game (only while the tab is visible). Plus activity rewards. New players start with 500. |
| **Shop** | 23 building types in 6 tabs (Homes, Work, Fun, Learning, Services, Land), plus roads at 5 credits a tile. You place a building on the map, and it shows green or red depending on whether the spot is valid. |
| **Demolish** | You can demolish buildings you built and get half the price back. |
| **Townsfolk** | Every home adds residents (a Cottage adds 2, Apartments add 4). They wander the city on routines too, so the city fills up as it grows. |
| **Day/night** | One in-game day lasts 12 real minutes. Windows light up at night. |

### Ideas taken from city builders
These are mechanics only, not code or art.

| From | Mechanic | How it works in Our Place |
|---|---|---|
| Micropolis (the open-source original SimCity, GPL-3) and LinCity-NG (GPL-2) | **Service radius**: parks and services help the area around them | Every leisure building (park, playground, café, cinema, spa) within 10 tiles adds +5% to activity rewards, up to +30%. |
| Same, plus OpenTTD | **Road access** | A building next to a road gets +10%. |
| Micropolis / LinCity-NG | **Zones grow population** | Homes add townsfolk. Planned next: work buildings need enough residents nearby to "open". |
| LinCity-NG | **Resources tied to land** | Mines only on barren land, sawmills and cabins only in forest, solar farms, spas and bazaars only in desert. |
| Elmridge (MIT, a three.js town sim) | **Citizen schedules** | Away-mode routines. Planned next: a time-of-day schedule (work in the day, home at night). |
| Citybound (AGPL) | **Multiplayer city** | Each building records who built it. Both players share one city. |

We don't copy GPL or AGPL code. We only reuse the ideas, so our code keeps whatever licence we choose.

---

## 2. The map

- **256 × 256 tiles** (65,536 tiles), generated from a fixed seed with noise, so it's the same for everyone.
- **Three biomes with uneven, natural borders:** barren clay in the west, forest in the north-east, desert in the south-east. Each has its own ground texture, decorations (rocks, trees, pines, cacti, shrubs) and lakes or oases.
- **The starter town** sits where the three biomes meet. It has avenues and 12 founding buildings, so the town works on day one.
- **Capacity:** about 50,000 buildable tiles. An average building takes about 9 tiles, which leaves room for **5,000+ buildings**. That easily covers the 1,000+ target, plus roads and parks.
- **Rendering:** terrain is drawn in 16×16-tile chunks that are cached and drawn only when on screen, with a whole-map overview when zoomed out. A minimap sits in the corner.

---

## 3. Data model (prototype → production)

| Data | Prototype (artifact store) | Production (own server) |
|---|---|---|
| Player | `players/<userId>` → name, colour, credits, earned, tasks, home | Same fields in Postgres/SQLite. **Credits checked by the server** (see risks). |
| Building | `buildings/<id>` → type, x, y, builtBy, at | Same. Spatial index for fast lookups. |
| Road | `roads/r_<cx>_<cy>` → list of tiles in that 16×16 chunk | Same chunking, or a bitmap. |
| Live position | Room presence (x, y, current activity), not stored | Colyseus room state |
| Away routine | Computed from clock + ids on every client | Same (deterministic) |

**Access rules in the prototype:** everyone can read players, but each person can only write their own player document. Buildings and roads can be written by anyone at Contributor level or above.

---

## 4. Assets for the full 3D version

The prototype draws everything in code. For the real game:

| Need | Source | Licence |
|---|---|---|
| City buildings, roads, props | **Kenney City Kit** (Roads, Suburban, Commercial, Industrial), all GLB | CC0 |
| Furniture and interiors | KayKit Furniture Bits, Kenney Furniture Kit, Tiny Treats | CC0 |
| Nature for the biomes (trees, rocks, cacti) | Quaternius nature packs, Kenney Nature Kit | CC0 |
| Characters and animations | Quaternius characters + Universal Animation Library (250+ animations), Mesh2Motion for rigging | CC0 |
| Realistic industrial props (factory, mine, warehouse, tools) | **NVIDIA SimReady** on Hugging Face, converted USD → GLB, credit NVIDIA | CC-BY-4.0 (check each package) |
| Ground textures, sky | Poly Haven, ambientCG | CC0 |

---

## 5. Milestones

| # | Milestone | Status |
|---|---|---|
| P | **2D prototype as a shared artifact**: map, biomes, login, characters, away routines, activities, credits per second, shop, roads, live two-player presence | **Done** |
| M0 | New repo: Vite + TypeScript. Move the prototype logic into modules (`world/`, `sim/`, `ui/`). | Next |
| M1 | Real server (Colyseus + SQLite). Server-side credit checks and building placement. Login with a simple account. | |
| M2 | Switch rendering to three.js 3D with Kenney/Quaternius GLB assets. Keep the same tile grid. | |
| M3 | Building interiors: walking in loads a small room scene where the activity plays out with animations. | |
| M4 | Deeper simulation: time-of-day schedules, jobs needing residents, needs (energy, fun, hunger), building levels/upgrades. | |
| M5 | Together actions (do an activity together for a bonus), chat, photo mode, phone controls polish. | |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Credits are client-side in the prototype, so a player could cheat | Fine for two people who trust each other. In M1 the server grants credits from time and activity events. |
| 1,000+ buildings slow down drawing | Only visible buildings are drawn. Chunk-cached terrain. Simpler drawing when zoomed out. In 3D, use instanced meshes and LOD. |
| Shared-store document limits (25,000 docs) | Buildings + road chunks + players stay well under that. Roads are already grouped by chunk. |
| GPL code from city builders | Borrow mechanics only, never code. |
| Too close to a commercial game | Own name, UI, art direction and rules. |
