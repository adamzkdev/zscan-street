// node scripts/cc0-textures.mjs [work dir]: fetch the city's realistic materials from ambientCG (CC0 1.0, public domain:
// https://ambientcg.com) into public/tex/<id>/{color,normal,rough,ao?}.jpg, at 1K (2K for the ground), and list them in
// public/tex/CREDITS.md. The archives are opened in a scratch folder; only their JPEG maps are copied.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/tex");
const WORK = path.resolve(process.argv[2] ?? "/tmp/cc0-textures");
/** [id, resolution, what it is for] */
const SETS = [
  // the ground
  ["Asphalt031", "2K", "road asphalt"],
  ["Asphalt025C", "2K", "road asphalt, worn"],
  ["PavingStones130", "2K", "pavers (hexagonal)"],
  ["Concrete031", "2K", "sidewalk concrete panels"],
  ["PavingStones111", "2K", "grey slab pavement"],
  ["PavingStones128", "1K", "light stone plaza slabs"],
  ["PavingStones070", "1K", "granite setts"],
  ["Tiles074", "1K", "plaza tiles"],
  ["Concrete034", "1K", "kerbs, concrete"],
  ["Grass004", "2K", "lawns"],
  ["Ground054", "1K", "sand"],
  ["Gravel022", "1K", "gravel"],
  // walls
  ["Plaster001", "1K", "plaster / stucco (tinted)"],
  ["PaintedPlaster017", "1K", "painted plaster"],
  ["Concrete019", "1K", "concrete wall"],
  ["Bricks060", "1K", "brick (red)"],
  ["Bricks075A", "1K", "brick (light)"],
  ["Metal032", "1K", "metal panels"],
  ["Wood049", "1K", "wood"],
  ["RoofingTiles006", "1K", "roof tiles"],
  // facades (photographed: windows and walls)
  ["Facade001", "1K", "glass tower (dark panels)"],
  ["Facade005", "1K", "glass tower (green grid)"],
  ["Facade006", "1K", "office ribbon windows"],
  ["Facade017", "1K", "office with fins"],
  ["Facade018A", "1K", "brick residential"],
  ["Facade019A", "1K", "concrete residential"],
  ["Facade020A", "1K", "brick piers and windows"],
  ["Facade009", "1K", "night windows (lit)"],
  ["Facade016", "1K", "night windows (sparse)"],
  // vegetation: bark, and leaf / needle / grass atlases (PNG with an opacity map) for the trees' cards
  ["Bark012", "1K", "bark (brown)"],
  ["Bark007", "1K", "bark (grey, plane trees)"],
  ["LeafSet009", "1K", "leaves (round)", "PNG"],
  ["LeafSet010", "1K", "leaves (maple)", "PNG"],
  ["LeafSet026", "1K", "leaves (long: palm leaflets)", "PNG"],
  ["PineNeedles001", "1K", "pine needles", "PNG"],
];
const MAPS = { Color: "color", NormalGL: "normal", Roughness: "rough", AmbientOcclusion: "ao", Metalness: "metal", Opacity: "opacity" };
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const done = [];
for (const [id, res, what, fmt = "JPG"] of SETS) {
  const dir = path.join(OUT, id);
  if (fs.existsSync(path.join(dir, "color.jpg")) || fs.existsSync(path.join(dir, "color.webp")) || fs.existsSync(path.join(dir, "color.png"))) {
    done.push([id, what]);
    continue;
  }
  const zip = path.join(WORK, `${id}.zip`);
  execFileSync("curl", ["-s", "-L", "-m", "120", "-o", zip, `https://ambientcg.com/get?file=${id}_${res}-${fmt}.zip`]);
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 20000) {
    console.warn("missing", id);
    continue;
  }
  const ex = path.join(WORK, id);
  fs.mkdirSync(ex, { recursive: true });
  // (python's zipfile, names checked: nothing outside the folder, only the JPEGs)
  execFileSync("python3", ["-I", "-c", "import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nfor n in z.namelist():\n  if '/' in n or '..' in n or not n.lower().endswith(('.jpg', '.png')): continue\n  z.extract(n, sys.argv[2])", zip, ex]);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(ex)) {
    const m = f.match(/_(Color|NormalGL|Roughness|AmbientOcclusion|Metalness|Opacity)\.(jpg|png)$/);
    if (m) fs.copyFileSync(path.join(ex, f), path.join(dir, `${MAPS[m[1]]}.${m[2]}`));
  }
  if (!fs.existsSync(path.join(dir, "color.jpg")) && !fs.existsSync(path.join(dir, "color.png"))) {
    console.warn("no colour map", id);
    fs.rmSync(dir, { recursive: true, force: true });
    continue;
  }
  done.push([id, what]);
  console.log("ok", id, fs.readdirSync(dir).join(","));
}
fs.writeFileSync(
  path.join(OUT, "CREDITS.md"),
  `# Textures\n\nAll from [ambientCG](https://ambientcg.com) by Lennart Demes, under the Creative Commons CC0 1.0 Universal licence (public domain).\n\n${done.map(([id, what]) => `- [${id}](https://ambientcg.com/view?id=${id}): ${what}`).join("\n")}\n`,
);
console.log("sets", done.length, "— now run: sh scripts/tex-compress.sh");
