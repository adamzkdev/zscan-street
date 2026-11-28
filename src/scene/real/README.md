# src/scene/real — the realistic look (branch gta-real)

The city moves off voxels to realistic geometry and photographed PBR materials:

- `tex.ts`: the texture library (public/tex, CC0 sets from ambientCG; fetch with `node scripts/cc0-textures.mjs`, then
  `sh scripts/tex-compress.sh`), `real(id, opts)` shared MeshStandardMaterials, `TILE` metres per repeat, `nightGlow(k)`.
- HDR skies for reflections: public/hdr (Poly Haven, CC0).
- Geometry carries UVs in metres / TILE; merge per material to keep draw calls low.
- `martdata.ts` / `marts.ts`: the 24-hour convenience stores (four chains of the game's own: ZK MART, SHIELD 24, KONBINI Z,
  24/ZEC) and the malls — the stand-alone store with its forecourt, the konbini on a ground floor, the kiosk, the mall's
  box with its atrium and anchors, car parks — in the kit's geometry plus one shared sign atlas (`MartDecals`, one draw).
  Their doors carry the chain's or the mall's name: src/interior/building.ts dresses the inside after it (mart.ts,
  islemall.ts). Placed in the city by src/scene/city/plan.ts `CITY_MARTS`, on the islands by their content.
