# Islands and their crossings — the recipe

The map grows by islands round the city, each reached from the ring road by a famous crossing
(a suspension bridge, a cable-stayed bridge, an undersea tunnel, or a bridge-tunnel). The first one
is **Zaiba** (east, after Tokyo's Odaiba) over the **Rainbow Bridge**. Adding the next one is a
descriptor and a content folder; everything else reads the list.

## Files

| file | what it is |
| --- | --- |
| `types.ts` | the descriptors: `Isle` (where, its shore, its streets, parks, census areas, map labels, sound, its crossing, its content loader) and `Crossing` (kind, course, profile, cross-section, lanes, towers/anchors or tube, style) — plain data, no three.js |
| `plan.ts` | `ISLES` (the list), `COURSES` (each crossing's course), `WORLD` (the whole world's extent), `isleAt`, `crossingAt`, `crossingRuns` |
| `course.ts` | a crossing's course in numbers: the centre line every 0.5 m (corners rounded), the road's height along it (profile, eased — one long crest curve over a main span), `project(x, z)` → how far along / how far off |
| `deckkit.ts` | geometry along a course (ribbons, swept sections, boxes square to the course, bars, cables), merged per material and per 120 m stretch, each mesh at its own centre |
| `crossings/deck.ts` | the road every crossing has: carriageway and paint, median, Jersey barriers, walkways, railing, fascia, lamps; shared materials; `deckNight(k)` |
| `crossings/suspension.ts` | towers with portal beams, footings, anchorages, main cables in catenary, hangers, the necklace of lights (rainbow / white / gold), stiffening truss and lower deck, approach viaducts on piers |
| `crossings/others.ts` | `buildCrossing(course)` by kind; cable-stayed (H pylons, fans of stays); tunnel (tube: road, walkways, tiled walls, light strips, outer shell, portals, retaining walls on the ramps); bridge-tunnel (both) |
| `land.ts` | an island's ground from its descriptor: raised land, streets (photographed asphalt + paint), blocks paved and kerbed, park lawns, beaches shelving into the sea (`ground(x, z)`, `road(x, z)` are what the game asks) |
| `traffic.ts` | the island's traffic: loops over the crossing and round its blocks, smooth (interpolated, eased heading, accelerating/braking); boxes for crashes, `take()` for carjacking |
| `index.ts` | `Isles`: builds everything, answers main.ts and the game (owns, onDeck, deckAt, groundAt, footBlocked, carSurface, holdCar, sea, boxes, take, facades, parked cars, walks, names), LOD (small things hidden past 340 m) |
| `east/plan.ts`, `east/index.ts` | Zaiba: the descriptor, and its content (landmarks, buildings with street-facing doors, beach, boardwalk, park, props, trees, parked cars) |

## Adding an island (WEST, NORTH…)

1. **Where the crossing leaves the city**: add its foot to `ISLE_FEET` in `src/scene/city/plan.ts`
   (`{ x, z, dir, half }` on the ring road: the city clears its pavement furniture there).
2. **Descriptor** `src/scene/isles/<side>/plan.ts`, exporting an `Isle`:
   - `box` (everything: land, beaches, shallows), `land` (the raised, paved part), `shore` (beach
     width, wider stretches, sea floor);
   - `streets`: an axis-aligned grid — every block between streets is paved; a street may start at
     the land's edge where the crossing lands;
   - `parks`, `areas` (census: who lives there, how busy — weights relative to the heart's 14),
     `labels`, `color`, `sound` (tracks of the street's music library);
   - `crossing`: `kind`; `path` (corners, **axis-aligned runs**: each run is a street for the GPS;
     the first corner = the foot in `ISLE_FEET`, the last on the island's street it lands on);
     `profile` ([s, y] or [s, y, curve]: road height along it — under the sea for a tunnel);
     `section` (median, road, barrier, walk, rail, edge half widths); `lanes`;
     suspension: `towers`, `top`, `anchors`; cable-stayed: `towers` (pylons), `top`;
     tunnel / bridge-tunnel: `tube` [s0, s1]; `style` (paint, night: rainbow/white/gold);
   - `load: () => import("./index")`.
3. **Content** `src/scene/isles/<side>/index.ts`: `export default async function build(ctx, { root, near })`
   returning `IsleContent` (facades with their doors, parked cars, walks, places, `update`). Use the
   realistic kit (`real/lmkit.ts` Kit → `kitGeos` → merged per sector → `kitMeshes`), `placeProps`,
   `plantTrees`, Orchard Keys' beach kit (`kBeachSet`, `kLifeguard`…). Every building gets a
   `door(…)` on the face that looks at its street (the game's E walks in). Small things go under
   `near` (hidden far away); `await ctx.yieldFrame()` between big pieces.
4. Add the descriptor to `ISLES` in `plan.ts`. That is all: roads + GPS + street names
   (`src/gta/roads.ts`), the census (`src/gta/census.ts`), the game's solid shape (a lazy picture per
   island, made within 240 m, let go past 760 m: `src/gta/collide.ts`), the maps' frame and bake
   (`src/ui/minimap.ts`: `WORLD`, island land/sand, crossing decks), the orbit camera, the sounds
   (`src/audio/street.ts`: an island layer and a crossing layer), main.ts's hooks (deck, sea, doors,
   traffic, carjacking) all read the list.

## Stores and malls

An island's 24-hour stores and malls come from `src/scene/real/marts.ts` (`store`, `front`, `kiosk`
through `front`, `mall`, `parkade`, `lot`): the content keeps a `MartDecals` (their pictures, one mesh
added to `root`) and an `emptyOut()` (their doors with their names, bins and bicycles for `placeProps`,
footprints, forecourt lights for `lamps`, parking bays for parked cars), builds each into a `Kit` added
to its sectors, and pushes the doors with its facades before its lamps and trees look for room. The
door's name is what the interior is dressed after (a chain's store, a mall's atrium).

## Notes for tunnels

- The profile goes below the sea (`y` < −2): the tube is drawn from `tube[0]` to `tube[1]`, retaining
  walls up the ramps outside the portals. Where a ramp cuts into the **city's** ground (or the
  island's), the ground there must be opened: the city's pavement/kerb meshes and the coast's sand
  are not cut by this module (do it in the city's builder for that foot, or start the ramp on a pier
  over the water so the portal stands on the shore).
- The car is held on the course (`holdCar`) wherever the deck is away from its two ends, so the
  tube's walls need nothing from the game's solid shape; `footBlocked` keeps walkers between the
  railings (a tunnel's walkways: give `rail` = walkway's outer edge).
- `sea()` returns null on a course: no swimming inside a tube.
- **The sea over a tube** (Gamla's Øresund link, `west/`): the city's sea is one flat sheet at the
  water's level; wherever a tube's inside (road to ceiling) crosses that level it would show inside
  the tube. `SEA_HOLES` (`plan.ts`) cuts it out there (src/scene/city/index.ts, `coast()`), and the
  tube's roof, standing out of the water there, is covered by an embankment (`crossings/oresund.ts`:
  rock armour to the sea floor, grass on its crown, a portal building at each mouth).
- A **bridge-tunnel** (`kind: "bridge-tunnel"`, `crossings/oresund.ts`): the cable-stayed bridge on
  the longer side of the tube (free-standing twin legs, a semi-harp of stays to mid-span), the road up
  out of the cutting on the other; the islet between them is the island's content (`west/index.ts`).
- The island's ground cuts its shore's sand over a tunnel's ramp; walkers in a tube stand on its
  walkways (`groundAt`) and are held by its walls (`footBlocked`).

## Old towns: canals, hills, setts (`west/`)

- `canals`: laid out like streets (centre line, run, width) but water: the land's cells over them are
  left open to the sea's sheet (its level), stone quay walls down to a bed; where a street crosses one
  the street's cell is a bridge (`land.ts`: an arch in each face, a vault, parapets). A canal reaching
  the land's edge opens into the sea (no sand across its mouth). Swimming in them is the sea's rule
  (`sea()`); the content adds stairs down to the water to climb out.
- `hills`: a smooth mound on a block (`h`, `r`, a flat `top`): `ground()` rises over it; the content
  draws it and answers `floor()` for the walker.
- `paving: "setts"`: cobbled streets without paint, stone pavements.
- The island's traffic loops are kept only where every leg runs on a street (`loopsOf`).

## Notes for a mountain island (Zakone, north)

- **Relief**: give the descriptor `relief(x, z)` (pure, quick: the wheels and the feet call it). Off
  the paved land the ground is the higher of it and the shore's; `land.ts` leaves the cells where the
  relief wins to the content, which draws them (`north/index.ts`: tiles of `real/terrain.ts`
  `heightfield` with `natureMat`). On foot, `Isles.groundAt` answers the relief over CURB + 0.45 (the
  game's solid shape only sees up to 2.4 m), so the slopes follow the walker's own rules there:
  `IsleContent.blocked(x, z)` says what stands on them (walls, trunks). At the wheel, `Isles.holdCar`
  takes the slopes off the solid shape; `IsleContent.hold(p, r)` keeps cars on a mountain road
  between its rails and out of what stands there.
- **A mountain road** that is not axis-aligned: `north/touge.ts` (`TougeCourse`: a smoothed height
  along it, `project`), cut into the relief by the descriptor's `relief`. It is not one of the GPS's
  streets (those stay axis-aligned).
- **Seen from afar**: the game camera's far plane is 520 m and its fog gone by ~430 m, so a mountain
  across the water is drawn twice — the near ground in tiles whose fragments stop at 300 m, and a
  coarse copy as a backdrop (`farMountain`: drawn first, no depth, scaled about the camera each frame
  so the far plane never clips it, hazed by its true distance, `userData.noField` so the solid shape
  and the map's bake leave it out).
- **Water of its own** (a hot spring): `IsleContent.water(x, z)` → `{ floor, surface }`, the relief
  dug to the floor; the game wades and swims in it like the sea.
- **Brooklyn's way** for a suspension bridge: `style.tower: "gothic"` (`crossings/brooklyn.ts`: stone
  towers with twin pointed arches, four cables, the stays' web), and `crossing.promenade` (an
  elevated walk over the median: `Isles.groundAt`/`footBlocked` know it).
