# src/scene/real — the realistic look (branch gta-real)

The city moves off voxels to realistic geometry and photographed PBR materials:

- `tex.ts`: the texture library (public/tex, CC0 sets from ambientCG; fetch with `node scripts/cc0-textures.mjs`, then
  `sh scripts/tex-compress.sh`), `real(id, opts)` shared MeshStandardMaterials, `TILE` metres per repeat, `nightGlow(k)`.
- HDR skies for reflections: public/hdr (Poly Haven, CC0).
- Geometry carries UVs in metres / TILE; merge per material to keep draw calls low.
