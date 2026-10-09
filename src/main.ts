import * as THREE from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { connectFeed, ZScan } from "./data/zscan";
import { busLocal, type BlockBus } from "./scene/bus";
import { BUS } from "./scene/voxel/vehicles";
import { CameraRig } from "./scene/camera";
import { AREAS, buildCity, CITY, CURB, CUT_VOX, DISTRICTS, type Occluder } from "./scene/city";
import { RIVER, ST } from "./scene/city/plan";
import { VOX } from "./scene/voxel/model";
import { Director } from "./scene/director";
import { buildDecor } from "./scene/decor";
import { Soundscape } from "./audio";
import { memeStats, posterHit, updateMemes } from "./scene/memes";
import { cityMemes } from "./scene/memewalls";
import { LampLights, tiltShift } from "./scene/post";
import { FinishPass, GradePass, ScenePass } from "./scene/finish";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { applyTheme, setRainWanted, type Theme } from "./scene/theme";
import type { Snark } from "./scene/snark";
import { Overlays } from "./ui/overlays";
import { buildMuseum } from "./interior/museum";
import { buildStadium } from "./interior/stadium";
import { buildPrison } from "./interior/prison";
import { buildMall } from "./interior/mall";
import { buildHotel } from "./interior/hotel";
import { buildNeedle } from "./interior/needle";
import { buildPyramid } from "./interior/pyramid";
import { buildEiffel } from "./interior/eiffel";
import { buildColosseum } from "./interior/colosseum";
import { buildReserve } from "./interior/reserve";
import { buildWalletTower } from "./interior/wallettower";
import { buildUniversity } from "./interior/university";
import { buildOpera } from "./interior/opera";
import { buildBigBen } from "./interior/bigben";
import { buildStatue } from "./interior/statue";
import { buildArab } from "./interior/arab";
import { buildGardens } from "./interior/gardens";
import { buildPalm } from "./interior/palm";
import { buildOrchard } from "./interior/zktowers/orchard";
import { buildSapling } from "./interior/zktowers/sapling";
import { buildHalo } from "./interior/zktowers/halo";
import { buildCemetery } from "./interior/cemetery";
import { StadiumLive } from "./scene/stadium";
import { type RideKind, Sky } from "./scene/sky";
import { Shibuya } from "./scene/shibuya";
import { GoldenGate } from "./scene/goldengate";
import { WalletCrowns } from "./scene/walletcrowns";
import { Forest } from "./scene/forest";
import { Cemetery } from "./scene/cemetery";
import { Chatter } from "./scene/chatter";
import { bubbles, drawBubbles } from "./scene/speech";
import { PLACE_LORE } from "./data/lore";
import { Hud } from "./ui/hud";
import { Venues } from "./ui/venues";
import { BlockShelf } from "./scene/shelf";
import { MiningHall } from "./scene/mining";
import { MempoolLive } from "./scene/mempoolhq";
import { InteriorManager } from "./interior/manager";
import { WalkControls } from "./interior/walk";
import type { Interior, InteriorContext } from "./interior/types";
import { buildFactory } from "./interior/factory";
import { buildMempool } from "./interior/mempool";
import { buildLibrary } from "./interior/library";
import { buildTower } from "./interior/tower/index";
import { Arcade } from "./ui/arcade";
import { newsTicker } from "./scene/press";
import { Reader } from "./ui/reader";
import { Joystick } from "./ui/joystick";
import { Quality } from "./scene/quality";
import { warm, idle, warmTarget } from "./scene/warm";
import { pxPerMetre } from "./scene/farview";
import { LightBudget } from "./scene/lights";
import { streetLife, Residents } from "./scene/residents";
import { CityPulse } from "./scene/pulse";
import { Metro, NU7_LINE } from "./scene/metro";
import { Tram } from "./scene/tram";
import { CityTraffic } from "./scene/citytraffic";
import { Life } from "./scene/life";
import { Alive } from "./scene/alive";
import { slotId, type Crowd } from "./scene/alive/crowd";
import { Agents } from "./game/agents";
import { Npcs } from "./game/npcs";
import { Horns } from "./scene/horns";
import { Prison, PRISON } from "./scene/prison";
import { policeModel } from "./scene/voxel/vehicles";
import { toObject } from "./scene/voxel/mesher";
import { storeInfo } from "./ui/stores";
import type { PickInfo } from "./interior/types";
import { Critters } from "./scene/critters";
import { TvMode } from "./scene/tv";
import { Tracker } from "./ui/track";
import { Nu7 } from "./scene/nu7";
import { Photo } from "./ui/photo";
import { Visitors } from "./scene/visitors";
import { crowdSpeaker, npcSpeaker, snarkSpeaker, Talk } from "./ui/talk";
import { Minimap, type Blip } from "./ui/minimap";
import { get } from "./data/zscan";
import type { BlockSummary, Tx } from "./data/types";
import { ChainClock } from "./game/clock";
import { GameWorld } from "./game/world";
import { GameHud } from "./game/ui";
import { profile } from "./game/profile";
import { Whale } from "./scene/whale";
import { CaseBook } from "./game/cases";
import { Gossip } from "./game/gossip";
import { PaperView } from "./game/paper";
import { Mayor } from "./game/mayor";
import { Editor } from "./build/editor";
import { Plots } from "./build/plots";
import { Works } from "./game/works";
import { Nu7Quarter } from "./game/nu7quarter";
import { Factions } from "./game/factions";
import { LiveEvents } from "./game/events";
import { Disasters } from "./game/disasters";
import { Eggs } from "./game/eggs";
import { loadSeason } from "./game/season";
import { Radio } from "./game/radio";
import { Jobs } from "./game/jobs";
import { Casino } from "./game/casino";
import { TimeTravel } from "./game/timetravel";
import { TUNNEL } from "./scene/city/plan";
import { PayDesk } from "./ui/paydesk";
import { Marks } from "./game/marks";
import { myRefs, type PayEvent } from "./data/streetpay";

// ---- renderer ----------------------------------------------------------------------------------
// The API down or rate-limiting (a portrait, a block that won't load): whoever asked just goes
// without; one quiet line in the console instead of an "Uncaught (in promise)" per request.
let netFailures = 0;
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as Error | undefined;
  const msg = String(r?.message ?? r);
  if (!(r instanceof TypeError && /fetch|network/i.test(msg)) && !/^zkSNARK #\d+: HTTP|HTTP \d{3}|Load failed|NetworkError/.test(msg)) return;
  e.preventDefault();
  if (netFailures++ % 50 === 0) console.warn(`network: ${msg} (${netFailures} request${netFailures > 1 ? "s" : ""} failed so far, the city carries on)`);
});
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
bubbles.init(renderer);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
// A dim studio environment: soft fill on every surface and something for wet asphalt to reflect.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

// ---- lights -----------------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight("#6a64a8", "#1a1420", 1.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight("#9fb0ff", 0.9);
moon.castShadow = true;
moon.shadow.mapSize.set(4096, 4096);
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);
// buses and VIP cars bring their own lights: the count the shaders see stays constant
const lightBudget = new LightBudget(scene);
const MOON_OFFSET = new THREE.Vector3(-18, 34, 22);

// ---- world ------------------------------------------------------------------------------------
// The voxel city is generated by a pool of workers; the boot screen shows how far along it is.
const bootBar = document.querySelector<HTMLElement>("#boot i");
const t0 = performance.now();
const city = await buildCity((k) => bootBar && (bootBar.style.width = `${Math.round(k * 100)}%`));
// one boot screen: the city is built, now the first snapshot of the chain
const bootText = document.querySelector<HTMLElement>("#boot p");
if (bootText) bootText.textContent = "CONNECTING TO ZCASH";
console.info(`city built in ${Math.round(performance.now() - t0)} ms`);
scene.add(city.group);
const lampLights = new LampLights(scene, city.lamps, 12);
const decor = buildDecor(scene, city);
// the NU7 upgrade: countdown on the screens, fireworks when it activates
const nu7 = new Nu7(scene, city, decor);
// the MEMPOOL shop's shelves hold the last blocks
const shelf = city.shops[0] ? new BlockShelf(scene, city.shops[0]) : null;
void get<BlockSummary[]>("/v1/blocks?limit=100").then((b) => b && shelf?.set(b));
// the mining hall in the Proof Factory: its live wall
const hall = city.factory ? new MiningHall(scene, city.factory) : null;
// the library's headline ticker, over its door (the Binhai, on the south bank, facing the river)
const libraryDoor = city.venues.find((v) => v.kind === "library")?.door;
const press = libraryDoor ? newsTicker(scene, libraryDoor.clone().add(new THREE.Vector3(0, 4.15, -0.35)), Math.PI) : null;
const sound = new Soundscape();

// ---- camera rig + post ------------------------------------------------------------------------
let hud: Hud;
// TV mode (camera cuts on its own); made once the HUD exists
let tv: TvMode | undefined;
const rig = new CameraRig(canvas, {
  cut: () => hud?.cut(),
  shot: () => syncCamera(),
});
rig.canopies = city.canopies;
const composer = new EffectComposer(renderer);
// the scene, multisampled in its own target; then AO and curvature, before the bloom
const renderPass = new ScenePass(scene, rig.camera, 0);
composer.addPass(renderPass);
const finish = new FinishPass(rig.camera, renderPass);
composer.addPass(finish);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.4, 0.95);
composer.addPass(bloom);
const tilt = tiltShift();
for (const p of tilt.passes) composer.addPass(p);
const grade = new GradePass();
composer.addPass(grade);
composer.addPass(new OutputPass());
const smaa = new SMAAPass();
composer.addPass(smaa);

/** Day, night, or "auto": follows the visitor's own clock (night from 19:00 to 7:00). */
type ThemePref = Theme | "auto";
const fixedTheme = new URLSearchParams(location.search).get("theme");
let themePref: ThemePref = (() => {
  if (fixedTheme === "day" || fixedTheme === "night" || fixedTheme === "auto") return fixedTheme;
  try {
    const v = localStorage.getItem("street.theme");
    if (v === "day" || v === "night" || v === "auto") return v;
  } catch {}
  return "auto";
})();
const clockTheme = (): Theme => {
  const h = new Date().getHours();
  return h >= 19 || h < 7 ? "night" : "day";
};
let theme: Theme = themePref === "auto" ? clockTheme() : themePref;
function setTheme(t: Theme) {
  theme = t;
  applyTheme({ renderer, scene, hemi, sun: moon, bloom, lamps: lampLights, decor, city: city.group }, t);
  grade.setTheme(t === "day");
  hud?.setNight(t === "night");
  weather(true);
  // the place you are in follows (its windows, its light); the others catch up when entered
  themeHook?.(t);
  moonShadow = moon.shadow.intensity;
  shibuyaNight?.(t === "night");
}
let shibuyaNight: ((night: boolean) => void) | null = null;
/** Set once the walk-in places exist (they are built further down). */
let themeHook: ((t: Theme) => void) | null = null;
/** The moon's shadow strength for the theme (shadows are faded out, never switched off: see frame). */
let moonShadow = 1;
function setThemePref(p: ThemePref) {
  themePref = p;
  try {
    localStorage.setItem("street.theme", p);
  } catch {}
  setTheme(p === "auto" ? clockTheme() : p);
}
// on "auto", dusk and dawn come with the visitor's clock
setInterval(() => {
  if (themePref !== "auto" || clockTheme() === theme) return;
  hud?.cut();
  setTheme(clockTheme());
}, 60_000);

// ---- weather: at night, passing showers (when rain is on), a few minutes wet, a few dry ----
let rainOn = true;
let showering = true;
/** A storm brought by the chain (crowded mempool, packed block): rain day or night. */
let chainStorm = false;
/** The game world (power cuts, chain weather); set once the HUD is up. */
let gameWorld: GameWorld | null = null;
/** Today's ZK Detective case: places hand out clues as you walk in. */
let caseBook: CaseBook | null = null;
/** The mayor's curfew: the street empties. */
let curfew = false;
/** The voxel workshop is open: the city stops drawing. */
let cityPaused = false;
/** Shielded vs Transparent, quarter by quarter (set with the game layer). */
let factions: Factions | null = null;
/** Jobs: the next bus is the visitor's to drive, and the one they drive. */
let driveNextBus = false;
let jobBus: BlockBus | null = null;
let jobs: Jobs | null = null;
/** The city's agents: the day's cast and everyone's persona (game/agents.ts). */
let agents: Agents | null = null;
const rainListeners: ((on: boolean) => void)[] = [];
function weather(now = false) {
  const raining = rainOn && ((theme === "night" && showering) || chainStorm);
  setRainWanted(rainOn && (showering || chainStorm));
  decor.setRain(raining, now);
  sound.setRain(raining);
  for (const fn of rainListeners) fn(raining);
}
(function showers() {
  setTimeout(
    () => {
      showering = !showering;
      weather();
      showers();
    },
    (showering ? 240 + Math.random() * 180 : 150 + Math.random() * 180) * 1000,
  );
})();
setTheme(theme);

function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  rig.resize(w, h);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  tilt.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
// resolution, shadows and post effects follow what the device can keep up with
const quality = new Quality((q) => {
  const dpr = Math.min(window.devicePixelRatio, q.dpr);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  if (q.shadow && moon.shadow.mapSize.x !== q.shadow) {
    moon.shadow.mapSize.set(q.shadow, q.shadow);
    moon.shadow.map?.dispose();
    moon.shadow.map = null;
  }
  bloom.enabled = q.bloom;
  tilt.allowed = q.tilt;
  finish.ao = q.ao;
  finish.ssr = q.ssr;
  // antialiasing by SMAA after tone mapping (MSAA cost a third of the frame in the dense views);
  // on a retina screen the pixels are their own antialiasing
  smaa.enabled = dpr < 1.75;
  finish.aoScale = dpr >= 1.5 ? 3 : 2;
  resize();
});
window.addEventListener("resize", resize);

// ---- choreography + HUD -----------------------------------------------------------------------
let selected: Snark | null = null;
let lastSummary: BlockSummary | null = null;
let rideNextBus = false;
let mempoolCount = 0;

const director = new Director(scene, city, {
  stats: (s) => {
    lastSummary = s.lastBlock;
    mempoolCount = s.mempool;
    gameWorld?.setMempool(s.mempool);
    hud.setStats(s);
    if (s.lastBlock) hall?.setLast(s.lastBlock.height, s.lastBlock.miner_pool, Date.parse(s.lastBlock.time));
    decor.setLive({ height: s.lastBlock?.height ?? null, mempool: s.mempool });
    nu7.setTip(s.lastBlock?.height ?? null);
  },
  door: () => sound.chime(),
  bus: (phase, b, carried, bus, district) => {
    if (phase === "boarding") sound.busArrives();
    hud.bus(phase, b, carried, district?.name ?? null);
    if (phase === "arriving") {
      pulse.block(b);
      stadium.block(b);
      hall?.found(b.height, b.pool);
      for (const fn of blockListeners) fn(b.height, b.pool);
    }
    if (phase === "confirmed") shelf?.push({ height: b.height, hash: "", time: new Date(b.time).toISOString(), tx_count: b.txs.length + 1, size: b.size, fees: b.fees, miner_pool: b.pool });
    if (bus) rig.busEvent(phase, bus);
    if (bus) tv?.bus(phase, bus);
    residents.busEvent(phase, new THREE.Vector3(DISTRICTS[0].stopX, 0, CITY.laneEast));
    if (phase === "arriving" && rideNextBus && bus) {
      rideNextBus = false;
      rig.followTheBus(bus);
      hud.follow(null);
    }
    // the bus driver's shift: from inside, then graded when it pulls in
    if (phase === "arriving" && driveNextBus && bus) {
      driveNextBus = false;
      jobBus = bus;
      if (walking) setWalking(false);
      rig.rideIn(bus);
      hud.follow(null);
      jobs?.busArriving();
    }
    if (phase === "boarding" && bus && bus === jobBus) {
      jobBus = null;
      jobs?.busStopped();
    }
  },
  removed: (s) => {
    if (rig.following === s) {
      // its block is confirmed and it rode away: show the last step, then back to the city
      const h = s.txs.find((t) => t.height)?.height;
      if (h) hud.flowConfirmed(h);
      rig.following = null;
      setTimeout(() => {
        if (rig.mode === "follow" && !rig.following) exitFollow();
      }, 3500);
    }
    if (selected === s) select(null);
    // gone for good: free its meshes and let its portrait go (a long visit sees thousands)
    setTimeout(() => s.dispose(), 4000);
  },
});

// the people who live here: how many are out follows the device's budget and the mempool
const residents = new Residents(director);
const RESIDENTS_BY_TIER = [24, 22, 16, 10, 6];
function crowd() {
  // the street follows the visitor's clock (busy at rush hours, a few night owls), a curfew empties it
  residents.setTarget((RESIDENTS_BY_TIER[quality.level] + Math.min(8, Math.floor(director.mempoolList().length / 2))) * streetLife() * (curfew ? 0.3 : 1));
}
crowd();
setInterval(crowd, 5000);
rainListeners.push((on) => residents.setRain(on));
weather(true);
// pigeons and street cats (fewer on small devices)
const critters = new Critters(scene, director, quality.level >= 3 ? 8 : 16, quality.level >= 3 ? 2 : 3);
// the ZEC Line: the elevated metro, a train for every block
const metro = new Metro(scene, city.nav);
director.metro = metro;
// the tram, along the street under the metro
const tram = new Tram(scene, city.nav);
// traffic lights at the junctions, cars and a police car on the other streets
const cityTraffic = new CityTraffic(scene, director.traffic, [44, 36, 26, 16, 10][quality.level], city.nav);
// Shibuya: the scramble crossing, its crowd and its screens
const shibuya = new Shibuya(scene, city, cityTraffic, { count: [300, 260, 200, 140, 90][quality.level], director });
rainListeners.push((on) => shibuya.setRain(on));
shibuyaNight = (n) => shibuya.setNight(n);
shibuya.setNight(theme === "night");
// the second elevated line: the NU7 line, a shuttle north–south along the east avenue
const metro2 = new Metro(scene, city.nav, NU7_LINE());
// meme posters round the street, ZK CINEMA's films by the mall (scene/memewalls.ts)
cityMemes(city);
// horns: you (on foot) or a jaywalker in front of a vehicle; trains and trams sound off too
const earPos = new THREE.Vector3();
const horns = new Horns(
  director,
  director.traffic,
  cityTraffic,
  sound,
  () => (walking ? onFoot.camera.position : null),
  () => ({ pos: walking ? onFoot.camera.position : earPos.copy(rig.focus), right: camRight }),
);
const soundAt = (p: THREE.Vector3) => {
  const e = walking ? onFoot.camera.position : rig.focus;
  return { level: Math.max(0, 1 - p.distanceTo(e) / 80), pan: THREE.MathUtils.clamp(p.clone().sub(e).dot(camRight) / 25, -1, 1) };
};
metro.onHorn = metro2.onHorn = (p) => {
  const w = soundAt(p);
  sound.horn("metro", w.level, w.pan);
};
tram.blockers = () => (walking ? [{ x: onFoot.camera.position.x, z: onFoot.camera.position.z }] : []);
tram.onBell = (p) => {
  const w = soundAt(p);
  sound.tramBell(w.level, w.pan);
};
// the prison, on its rock in the bay; annoy the police enough and you end up in it
const prison = new Prison(scene, city.nav, director);
// the rock is a walk-in place too: the cell house, from the city's side (click the island)
{
  const box = new THREE.Box3(new THREE.Vector3(PRISON.x0, 0, PRISON.z0), new THREE.Vector3(PRISON.x1, 22, PRISON.z1));
  const door = new THREE.Vector3((PRISON.x0 + PRISON.x1) / 2, PRISON.floor, PRISON.z0 - 1);
  city.venues.push({
    kind: "prison",
    name: "the ZEC STATE PENITENTIARY",
    door,
    occluder: { full: prison.group, cut: new THREE.Group(), extras: new THREE.Group(), box, level: 1, height: 22, open: false, fixed: true },
    keeper: door.clone(),
    camPos: door.clone().add(new THREE.Vector3(0, 12, -24)),
    camLook: door.clone(),
    walls: [],
  });
}
const jailBanner = document.createElement("div");
jailBanner.className = "jail";
let jailed = false;
horns.onArrest = () => void arrest();
async function arrest() {
  if (!walking || jailed) return horns.pardoned();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const me = onFoot.camera.position.clone().setY(CURB);
  // a patrol car pulls up beside you, lights going
  const car = new THREE.Group();
  car.add(toObject(policeModel()));
  const lamps = (["#ff2a2a", "#2a6aff"] as const).map((c, i) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3.2), toneMapped: false }));
    l.position.set(0.17, 11.5 / 6, i ? 0.32 : -0.32);
    car.add(l);
    return l;
  });
  const from = me.x + 26 < CITY.maxX ? me.x + 26 : me.x - 26;
  const stopX = me.x + Math.sign(from - me.x) * 4;
  car.rotation.y = from > me.x ? Math.PI : 0;
  car.position.set(from, 0, me.z + 2.2);
  scene.add(car);
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 2600);
      car.position.x = from + (stopX - from) * (1 - (1 - k) ** 2);
      const on = Math.floor(performance.now() / 180) % 2;
      lamps[0].visible = !!on;
      lamps[1].visible = !on;
      if (k < 1) requestAnimationFrame(tick);
      else done();
    };
    tick();
  });
  const w = soundAt(car.position);
  sound.horn("police", w.level, w.pan, true);
  const flash = setInterval(() => {
    const on = Math.floor(performance.now() / 180) % 2;
    lamps[0].visible = !!on;
    lamps[1].visible = !on;
  }, 90);
  // an officer gets out
  const cop = await director.newSnark(1977 + Math.floor(Math.random() * 50));
  director.adopt(cop);
  cop.role = "Police officer";
  cop.setCap();
  cop.noClip = true;
  cop.root.position.set(car.position.x, CURB, me.z + 0.9);
  cop.say("STOP RIGHT THERE!", 2.4, "shout");
  cop.emote("!", 2);
  await cop.walk([new THREE.Vector3(me.x + Math.sign(from - me.x) * 1.1, CURB, me.z)], 2.6);
  onFoot.enabled = false;
  cop.say("YOU'RE UNDER ARREST!", 2.6, "shout");
  await wait(2600);
  cop.say("Annoying the traffic. Again.", 2.2);
  await wait(1800);
  // inside
  hud.cut();
  clearInterval(flash);
  scene.remove(car);
  director.release(cop);
  jailed = true;
  onFoot.place(prison.cell.clone(), Math.PI);
  onFoot.enabled = walking;
  for (let left = 40; left > 0; left--) {
    jailBanner.innerHTML = `<b>JAILED · 透明刑務所</b><span>disturbing the traffic · out in ${left}s</span>`;
    jailBanner.classList.add("on");
    await wait(1000);
  }
  if (prison.guard) {
    prison.guard.say("TIME SERVED. BEHAVE.", 3);
  }
  await wait(1200);
  hud.cut();
  jailBanner.classList.remove("on");
  jailed = false;
  if (walking) onFoot.place(prison.release.clone(), Math.PI);
  horns.pardoned();
}
// life in every district: anglers, boats, balconies, the park, the shōtengai
const life = new Life(scene, city, director, [1, 0.9, 0.6, 0.4, 0.25][quality.level]);
// the megalopolis busier: crowds on every pavement, street events, the sky and the bay
const alive = new Alive(scene, city, director, [1, 0.85, 0.6, 0.4, 0.25][quality.level]);
// two police officers at the avenue's junctions, watching the traffic
for (const [x, z, id] of [
  [ST.heartE + 5.4, CITY.south.z0 + 0.7, 4911],
  [ST.heartW - 5.4, CITY.north.z1 - 0.7, 1977],
] as const)
  void director.newSnark(id).then((s) => {
    director.adopt(s);
    s.role = "Police officer";
    s.setCap();
    s.root.position.set(x, CURB, z);
    s.faceDir = new THREE.Vector3(x > 0 ? -1 : 1, 0, 0);
    setInterval(() => Math.random() < 0.35 && s.emote(Math.random() < 0.5 ? "!" : "note", 1.8), 9000);
  });
// the city reacts to each real event: block, empty block, heavy shielded tx, price move
const pulse = new CityPulse(city, decor, sound, residents, nu7);
// Block Stadium: Shielded against Transparent, a match per block
const stadium = new StadiumLive(scene, city, (up) => sound.crowd(up));
// the ZEC Flyer turning by the river, the ZEC blimp over the city
const sky = new Sky(city);
let flyerRide = false;
/** Board the Flyer or the blimp: first person inside, LEAVE (Esc) goes back. */
function boardSky(kind: RideKind) {
  rig.rideTrain(sky.board(kind, rig.focus, rig.iso.zoom));
  flyerRide = true;
  hud.setRide(kind === "blimp" ? "ZEC BLIMP" : "ZEC FLYER");
}
/** The Flyer, the blimp or its mooring mast under the cursor. */
function skyAt(x: number, y: number) {
  if (walking || interiors.active) return null;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  return sky.hit(ray);
}
// the Golden Gate: traffic over it, and its deck to walk on
const goldenGate = new GoldenGate(scene, city);
// the ZODL and Vizor emblems turning over their towers
const walletCrowns = new WalletCrowns(scene, city);
// Shielded Woods: the redwood forest on the headland across the bridge, walkable off its deck
const forest = new Forest(scene, city, director, (z) => goldenGate.deckAt(z));
// the ZK Cemetery: zombie zkSNARKs rising from their graves (more of them at night)
const cemetery = new Cemetery(scene, city, director, { day: [4, 4, 3, 2, 1][quality.level], night: [10, 9, 7, 5, 3][quality.level] });
// people talk to each other wherever the camera looks
const chatter = new Chatter(director, city, scene, [3, 3, 2, 2, 1][quality.level]);
// a goal inside the stadium: the crowd's roar (or groan)
window.addEventListener("zstreet:stadium-goal", (e) => sound.crowd(!!(e as CustomEvent<{ shielded: boolean }>).detail?.shielded));

/** The line under each place's name in its hover tag. */
const PLACE_SUB: Partial<Record<Interior["key"], string>> = {
  library: "news · ZIPs",
  tower: "apartments · arcade",
  museum: "the Louvre of zkSNARKs",
  stadium: "watch the match · or play it",
  prison: "Alcatraz of crypto",
  mall: "shops · rain vortex · canal",
  hotel: "rooms · sky park pool",
  needle: "observation deck",
  pyramid: "the labyrinth",
  eiffel: "up to the summit",
  colosseum: "the arena",
  reserve: "trading floor · gold vault",
  opera: "tonight's concert",
  bigben: "up to the bell",
  statue: "climb to the crown",
  arab: "seven-star hotel · helipad",
  gardens: "Supertrees · Skyway · Cloud Forest",
  palm: "beach · villa · boardwalk · marina",
  "tower-orchard": "art deco · observatory",
  "tower-sapling": "sky gardens · infinity pool",
  "tower-halo": "trading floor · helipad",
  zodl: "tweets · releases · the crown",
  vizor: "tweets · releases · the crown",
  noir: "tweets · releases · the crown",
  university: "courses · Zakura · Tachyon · the library",
  cemetery: "the crypt · zombies inside",
};

/** What each walk-in place is, for the people who work there. */
const PLACE_ABOUT: Record<string, string> = {
  mempool: "The MEMPOOL HQ holds every pending Zcash transaction as a parcel on the pickup table; trucks from the Proof Factory unload at its loading dock, zkSNARKs pick them up and wait at the bus stop for a block. Upstairs (1F) is the Block Archive, where any block since genesis can be rebuilt.",
  factory: "The Proof Factory is the mining hall: rows of miners per mining pool press each new block, which rolls down a conveyor. Shielded parcels leave from its dock.",
  library: "The Library keeps the Zcash news and every ZIP (Zcash Improvement Proposal) on its shelves.",
  tower: "ZK TOWER is a condo tower with flats, an arcade, a bowling alley, a gym, a pool and a rooftop.",
  museum: "The zkSNARK Museum is the city's Louvre: the Hall under the glass pyramid, the Grande Galerie of zkSNARK portraits, and zkSNARK #1, the collection's original, behind glass.",
  stadium: "Block Stadium plays Shielded against Transparent: each block is a match, its shielded transactions against its transparent ones.",
  prison: "The ZEC State Penitentiary is the city's Alcatraz, on its rock in the bay; its cells hold the most famous falls in crypto.",
  mall: "The ZK Mall: five levels of shops round an indoor waterfall, a canal with boats, a food court and the ZK Cinema.",
  hotel: "The Marina ZEC Hotel: three towers joined by the SkyPark and its infinity pool, a casino, suites with a view of the city.",
  needle: "The ZEC Needle is the tallest tower in the city, with observation decks over the whole megalopolis.",
  pyramid: "The Great Pyramid hides a labyrinth; the King's Chamber keeps the genesis block's treasure.",
  eiffel: "The Tour Eiffel: the esplanade, the glass floor of the first platform, the second floor and the summit.",
  colosseum: "The Colosseum hosts the Proof Games: a Shielded gladiator against a Transparent one, a bout per block.",
  "tower-orchard": "ZK TOWER ORCHARD is the art-deco supertall of Midtown: a gold and black marble lobby, offices, a jazz club and an observatory deck with telescopes under its steel crown.",
  "tower-sapling": "ZK TOWER SAPLING is the green tower by the marina: sky gardens every few floors, flats, and an infinity pool with a rooftop bar.",
  "tower-halo": "ZK TOWER HALO is the twisted glass tower on Wall Street: a trading floor with live Zcash charts, a VIP lounge and a helipad on the roof.",
  zodl: "The ZODL TOWER is the white tower of Zodl, the Zcash wallet (formerly Zashi) built by ZODL, across the avenue from the ZEC Reserve: the wallet's card in the lobby, a wall of its tweets on 8, the lab of its releases on 16, its black bird on white turning over the roof.",
  noir: "The NOIR TOWER is the obsidian tower of Noir, the shielded Zcash wallet in your browser (a Chrome extension web pages can ask to pay or sign), next to the ZODL TOWER on the avenue: the wallet's card in the lobby, a wall of its tweets on 8, the lab of its releases on 16, its silver eclipse and green light turning over the roof.",
  university: "ZK UNIVERSITY is the campus next to the city works, built like Stanford's Main Quad (sandstone, round arches, red tile roofs, a bell tower): free video courses on cryptography, zkSNARKs and Zcash, every claim with its source. G: the Main Quad hall and the course catalogue; 1: the Lecture Hall (theory); 2: Zakura Hall, about the Zakura node, with its real releases and announcements; 3: Tachyon Hall, about scaling Zcash with Tachyon and Ragu, with the team's real blog posts and commits; 4: the Library, where every lesson can be read.",
  vizor: "The VIZOR TOWER is the crimson tower of Vizor, the Zcash wallet from the Keplr team, across the avenue from ZK TOWER HALO: the wallet's card in the lobby, a wall of its tweets on 8, the lab of its releases on 16, its silver knight's helmet turning over the roof.",
  cemetery: "The ZK Cemetery is the Père-Lachaise of ZStreet, on the hill at the north-east edge: crooked graves with epitaphs about lost seed phrases and transparent addresses, a chapel, and the CRYPT under the mausoleum, where Zcash buries what it retired (the Sprout pool, BCTV14, the trusted setup, the Founders' Reward). Only zombie zkSNARKs live here; more of them climb out at night.",
};

// conversations with the characters (zkSNARKs on the street, people inside places); created
// once the HUD has drawn #ui
let talk: Talk;

hud = new Hud(
  {
    mode: (m) => {
      rig.setMode(m);
      hud.follow(null);
    },
    district: (key) => {
      const a = AREAS.find((x) => x.key === key);
      if (a) rig.district(new THREE.Vector3(a.x, 1, a.z), a.zoom);
    },
    lookIn: () => enterPlace("mempool"),
    follow: (s) => {
      rig.follow(s);
      hud.follow(s);
    },
    followNextBus: () => {
      const running = [...director.buses].at(-1) as BlockBus | undefined;
      if (!running) {
        rideNextBus = true;
        rig.setMode("live");
      } else {
        rig.followTheBus(running);
        hud.follow(null);
      }
    },
    pickShot: (s) => {
      rig.pick(s);
      syncCamera();
    },
    setTheme: (t) => setThemePref(t),
    setRain: (on) => {
      rainOn = on;
      // switching rain on brings a shower now
      if (on) showering = true;
      weather();
    },
    setSound: async (on) => {
      if (on) await sound.start();
      else sound.stop();
      try {
        localStorage.setItem("street.sound", on ? "1" : "0");
      } catch {}
    },
    setTv: (on) => (on ? tv?.start() : tv?.stop()),
    setAuto: (on) => {
      rig.auto = on;
      syncCamera();
    },
    zoom: (k) => rig.zoomBy(k),
    turn: (rad) => rig.turnBy(rad),
    home: () => {
      select(null);
      rig.home();
    },
    exitFollow,
    select,
    enterPlace: (k) => enterPlace(k),
    floor: (n) => {
      interiors.goTo(n);
      hud.cut();
      hud.renderIndoor(interiors.floor);
    },
    leave: () => interiors.exit(),
    talk: (s) => talk.show(snarkSpeaker(s, director, agents)),
    walk: (on) => setWalking(on),
  },
  director,
  themePref,
);
// the Hud rewrote #ui: widgets made before it go in now
document.getElementById("ui")!.append(jailBanner);
// SimCity-style data views over the city (after the HUD, which rewrites #ui)
const overlays = new Overlays(scene, document.getElementById("ui")!, {
  territory: () => factions?.scores ?? null,
  *cars() {
    for (const m of cityTraffic.movers) yield m.group.position;
    for (const v of director.traffic.vehicles) yield v.mover.group.position;
  },
  *carriers() {
    for (const s of director.snarks) if (s.txs.length && s.root.parent === scene) yield { pos: s.root.position, n: s.txs.length };
  },
  mempool: () => mempoolCount,
  buildings: city.facades.map((f) => (f.face === "s" || f.face === "n" ? { x0: f.x0, x1: f.x1, z: f.z + (f.face === "s" ? -3 : 3), height: f.height } : { x0: f.x0 + (f.face === "e" ? -3 : 3), x1: f.x0 + (f.face === "e" ? -3 : 3), z: f.z, height: f.height })),
});
hud.setNight(theme === "night");

// sound stays as it was left; browsers only let it start on the first touch or click
try {
  if (localStorage.getItem("street.sound") === "1") {
    hud.setSoundButton(true);
    window.addEventListener("pointerdown", () => void sound.start(), { once: true });
  }
} catch {}
// the street opens even if the chain is slow to answer (the strip then says OFFLINE)
setTimeout(() => hud.ready(), 15000);

// ---- walk-in places ----------------------------------------------------------------------------
const PLACES: Record<Interior["key"], string> = {
  mempool: "MEMPOOL HQ",
  factory: "PROOF FACTORY",
  library: "BINHAI LIBRARY",
  tower: "ZK TOWER",
  museum: "zkSNARK MUSEUM",
  stadium: "BLOCK STADIUM",
  prison: "ZEC PENITENTIARY",
  mall: "ZK MALL",
  hotel: "MARINA ZEC HOTEL",
  needle: "ZEC NEEDLE",
  pyramid: "GREAT PYRAMID",
  eiffel: "TOUR EIFFEL",
  colosseum: "COLOSSEUM",
  reserve: "ZEC RESERVE",
  opera: "OPERA HOUSE",
  bigben: "BIG BEN",
  statue: "zkSNARK OF LIBERTY",
  arab: "BURJ AL ZEC",
  gardens: "GARDENS BY THE BAY",
  palm: "THE PALM",
  "tower-orchard": "ZK TOWER ORCHARD",
  "tower-sapling": "ZK TOWER SAPLING",
  "tower-halo": "ZK TOWER HALO",
  cemetery: "ZK CEMETERY",
  zodl: "ZODL TOWER",
  vizor: "VIZOR TOWER",
  noir: "NOIR TOWER",
  university: "ZK UNIVERSITY",
};
const blockListeners: ((h: number, pool: string | null) => void)[] = [];
/** Panoramas of the real street for the windows of tall places, one per height, kept a minute. */
// A pool, not one per height: each 1024 px half-float cube is ~70 MB of GPU memory and a tour of
// every place asked for 50+ of them. At most VIEW_POOL cubes exist; a new height re-renders into
// the least recently used one (never the one the place you are in is showing). A place whose
// panorama was taken over gets it re-rendered when it is entered again (refreshView).
const views = new Map<string, { rt: THREE.WebGLCubeRenderTarget; at: number; used: number; theme?: Theme }>();
const VIEW_POOL = quality.level >= 3 ? 3 : 6;
/** What each place showed last (place → its cityView arguments and texture). */
const shownView = new Map<string, { up: number; back: number; tex: THREE.Texture }>();
// The GPU was reset (driver update, sleep, too many tabs): three.js re-uploads geometry and
// textures by itself, but rendered panoramas come back empty, so they are all taken again (the one
// on screen right away, the others when their place asks).
canvas.addEventListener("webglcontextrestored", () => {
  for (const e of views.values()) e.at = -Infinity;
  const i = interiors?.active;
  const s = i && shownView.get(i.key);
  if (i && s && i.scene.background === s.tex) {
    const tex = cityView(i.key, s.up, s.back);
    if (tex) i.scene.background = tex;
  }
});
function refreshView(i: Interior) {
  const s = shownView.get(i.key);
  if (!s || views.has(`${i.key}:${s.up}`) || i.scene.background !== s.tex) return;
  const tex = cityView(i.key, s.up, s.back);
  if (tex) i.scene.background = tex;
}
function cityView(place: string, up: number, back = 3): THREE.Texture | null {
  // the Proof Factory and the MEMPOOL HQ aren't venues (they have their own sites): look out from their doors
  const f = city.factory;
  const hq = city.shops[0];
  const v = place === "factory" && f?.door ? { door: f.door, occluder: f.occluder } : place === "mempool" && hq ? { door: hq.door, occluder: hq.occluder } : city.venues.find((x) => x.kind === place);
  if (!v) return null;
  const key = `${place}:${up}`;
  let e = views.get(key);
  const now = performance.now();
  // a panorama is a 6-face render of the whole city (~9,000 draw calls, a visible hitch): kept
  // ten minutes for the same day/night, only a minute if it was taken while the city still loaded
  if (e && e.theme === theme && (now - e.at < 60_000 || (e.at > 45_000 && now - e.at < 600_000))) {
    e.used = now;
    shownView.set(place, { up, back, tex: e.rt.texture });
    return e.rt.texture;
  }
  if (!e) {
    if (views.size >= VIEW_POOL) {
      // take over the least recently used panorama that nobody is looking at
      const busy = interiors?.active ? shownView.get(interiors.active.key)?.tex : null;
      let lru: string | null = null;
      for (const [k, x] of views) if (x.rt.texture !== busy && (lru === null || x.used < views.get(lru)!.used)) lru = k;
      if (lru !== null) {
        e = views.get(lru)!;
        views.delete(lru);
      }
    }
    e ??= { rt: new THREE.WebGLCubeRenderTarget(quality.level >= 3 ? 512 : 1024, { type: THREE.HalfFloatType }), at: 0, used: 0 };
  }
  e.at = e.used = now;
  e.theme = theme;
  views.set(key, e);
  shownView.set(place, { up, back, tex: e.rt.texture });
  const cam = new THREE.CubeCamera(0.5, 600, e.rt);
  cam.position.copy(v.door).add(new THREE.Vector3(0, up, -back));
  // the place itself must not block its own view
  const o = v.occluder;
  const was = [o.full.visible, o.cut.visible, o.extras.visible];
  o.full.visible = o.cut.visible = o.extras.visible = false;
  // seen from up there: the haze much further out, and the city's detail round this place
  const fog = scene.fog instanceof THREE.Fog ? [scene.fog.near, scene.fog.far] : null;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = 260 + up * 2;
    scene.fog.far = 700 + up * 4;
  }
  city.lod(cam.position, 80, 220);
  // the stadium's own live screens and crowd belong to the building hidden above
  const live = place === "stadium" ? stadium.group.visible : null;
  if (live !== null) stadium.group.visible = false;
  cam.update(renderer, scene);
  if (live !== null) stadium.group.visible = live;
  if (fog && scene.fog instanceof THREE.Fog) [scene.fog.near, scene.fog.far] = fog;
  city.lod(rig.focus, 40, 95);
  [o.full.visible, o.cut.visible, o.extras.visible] = was;
  return e.rt.texture;
}
const ictx: InteriorContext = { renderer, director, theme, onBlock: (fn) => blockListeners.push(fn), cityView };
themeHook = (t) => {
  ictx.theme = t;
  interiors.active?.setTheme?.(t);
};
const interiors = new InteriorManager(
  canvas,
  {
    mempool: () => buildMempool(ictx),
    factory: () => buildFactory(ictx),
    library: () => buildLibrary(ictx),
    tower: () => buildTower(ictx),
    museum: () => buildMuseum(ictx),
    stadium: () => buildStadium(ictx),
    prison: () => buildPrison(ictx),
    mall: () => buildMall(ictx),
    hotel: () => buildHotel(ictx),
    needle: () => buildNeedle(ictx),
    pyramid: () => buildPyramid(ictx),
    eiffel: () => buildEiffel(ictx),
    colosseum: () => buildColosseum(ictx),
    reserve: () => buildReserve(ictx),
    opera: () => buildOpera(ictx),
    bigben: () => buildBigBen(ictx),
    statue: () => buildStatue(ictx),
    arab: () => buildArab(ictx),
    gardens: () => buildGardens(ictx),
    palm: () => buildPalm(ictx),
    "tower-orchard": () => buildOrchard(ictx),
    "tower-sapling": () => buildSapling(ictx),
    "tower-halo": () => buildHalo(ictx),
    zodl: () => buildWalletTower(ictx, "zodl"),
    vizor: () => buildWalletTower(ictx, "vizor"),
    noir: () => buildWalletTower(ictx, "noir"),
    university: () => buildUniversity(ictx),
    cemetery: () => buildCemetery(ictx),
  },
  {
    entered: (i, f) => {
      i.setTheme?.(theme);
      // its panorama may have been lent to another place meanwhile
      refreshView(i);
      rig.controls.enabled = false;
      venues.close();
      hud.enterInterior(i, f);
    },
    left: () => {
      venues.close();
      hud.leaveInterior();
      if (walking && cameIn) stepOut(cameIn);
      else rig.controls.enabled = !walking;
      cameIn = null;
      syncCamera();
    },
    walked: (n) => hud.renderIndoor(n),
    ding: () => sound.liftDing(),
    fade: () => {
      lastJump = performance.now();
      hud.cut();
    },
  },
);
// phones and modest machines keep fewer walk-in places on the GPU at once
interiors.keep = quality.level >= 2 ? 3 : 8;
warmTarget(() => renderPass.rt);
interiors.compile = (s, c) => warm(renderer, s, c);
// frames during an entry, a camera flight or right after a tier change say nothing about the device
// (and neither do the boot screen's, while the city warms up and places are built ahead)
quality.busy = () => interiors.warming || rig.flying || performance.now() - lastJump < 1500 || bootUp();
function bootUp() {
  const b = document.getElementById("boot");
  return !!b && !b.dataset.gone;
}
let lastJump = 0;
interiors.walk.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => {
  interiors.walk.resize(window.innerWidth, window.innerHeight);
  onFoot.resize(window.innerWidth, window.innerHeight);
});

// ---- on foot: first person in the street, the same walk as inside, through the doors -----------
const onFoot = new WalkControls(canvas);
onFoot.camera.far = 400;
onFoot.resize(window.innerWidth, window.innerHeight);
/** On foot: the whole city, edge to edge. */
const BOARD = { x0: CITY.minX + 0.6, x1: CITY.maxX - 0.6, z0: CITY.minZ + 0.6, z1: CITY.maxZ - 0.6 };
/** Floor heights on foot off the street level: station platforms and stairs, the footbridges. */
function groundAt(x: number, z: number): number | null {
  const pg = prison.groundAt(x, z);
  if (pg !== null) return pg;
  const gg = goldenGate.groundAt(x, z);
  if (gg !== null) return gg;
  const cg = cemetery.groundAt(x, z);
  if (cg !== null) return cg;
  const fg = forest.groundAt(x, z);
  if (fg !== null) return fg;
  const sg = sky.groundAt(x, z);
  if (sg !== null) return sg;
  const m = metro.heightAt(x, z) ?? metro2.heightAt(x, z);
  // a platform 9 m up is a roof to whoever walks the street under it (the ZEC Line's station in
  // front of the Golden Gate walled the bridge off): it is the floor only once you are up there
  if (m !== null && m - onFoot.floor < 1.6) return m;
  const R = RIVER;
  for (const fx of R.foot)
    if (Math.abs(x - fx) < 1.3 && z > R.z0 - 0.5 && z < R.z1 + 0.5) {
      const t = (z - (R.z0 - 0.5)) / (R.z1 - R.z0 + 1);
      return CURB + Math.sin(t * Math.PI) * 2.2;
    }
  return null;
}
onFoot.ground = groundAt;
/** Vehicles and people, where they are right now: you walk round them, not through them. */
function dynamicHit(x: number, z: number) {
  for (const v of director.traffic.vehicles) {
    const p = v.mover.group.position;
    const half = v.mover.length / 2 + 0.35;
    if (Math.abs(x - p.x) < half && Math.abs(z - p.z) < 1.45) return true;
  }
  for (const m of cityTraffic.movers) {
    const p = m.group.position;
    const along = m.line.axis === "x";
    if (Math.abs((along ? x : z) - (along ? p.x : p.z)) < 2.4 && Math.abs((along ? z : x) - (along ? p.z : p.x)) < 1.3) return true;
  }
  if (cemetery.hit(x, z)) return true;
  for (const t of tram.sets) {
    const p = t.group.position;
    if (Math.abs(x - p.x) < 7.4 && Math.abs(z - p.z) < 1.5) return true;
  }
  for (const s of director.snarks) {
    if (!s.root.visible || s.root.parent !== scene || s.state === "riding") continue;
    const p = s.root.position;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < 0.5 * 0.5) return true;
  }
  return false;
}
onFoot.collide = (x, z) => {
  const inPrison = x > PRISON.x0 + 0.6 && x < PRISON.x1 && z > PRISON.z0 + 0.6 && z < PRISON.z1 - 0.6;
  if (!inPrison && (x < BOARD.x0 || x > BOARD.x1 || z < BOARD.z0 || z > BOARD.z1)) return true;
  const here = onFoot.floor;
  const there = groundAt(x, z) ?? CURB;
  // no walking off a platform, no walking into the side of a staircase
  if (Math.abs(there - here) > 0.75) return true;
  // on the rock: the prison's own walls and bars
  if (inPrison) return !prison.free(x, z, 0.28);
  // on the Golden Gate: between its railings
  if (goldenGate.onDeck(x, z)) return false;
  // in the woods across it: trunks, rocks, the creek, the cliffs
  if (forest.owns(x, z)) return forest.blocked(x, z);
  // up there, the street's obstacles are below you
  if (there > 1.2) return false;
  return !city.nav.free(x, z, 0.28) || dynamicHit(x, z);
};
let walking = false;
/** The place walked into, to step back out of its door. */
let cameIn: Interior["key"] | null = null;
/** Walk-in doors on the street (the Proof Factory's is on the avenue, in line with the others). */
const doors: { key: Interior["key"]; at: THREE.Vector3 }[] = [
  ...(city.shops[0] ? [{ key: "mempool" as const, at: city.shops[0].door }] : []),
  ...city.venues.map((v) => ({ key: v.kind, at: v.door })),
  ...(city.factory?.door ? [{ key: "factory" as const, at: city.factory.door }] : []),
];
/** The camera the viewer is looking through on the street. */
function viewCam() {
  return walking ? onFoot.camera : rig.camera;
}
/** The pavement side of a door: the free spot just outside it. */
function outside(at: THREE.Vector3) {
  for (const d of [1.6, -1.6, 2.4, -2.4]) if (!onFoot.collide!(at.x, at.z + d)) return { x: at.x, z: at.z + d, yaw: d > 0 ? Math.PI : 0 };
  return { x: at.x, z: at.z + 1.6, yaw: Math.PI };
}
function stepOut(key: Interior["key"]) {
  const d = doors.find((x) => x.key === key);
  if (!d) return;
  const o = outside(d.at);
  onFoot.place(new THREE.Vector3(o.x, CURB, o.z), o.yaw);
  onFoot.enabled = true;
  doorCool = 1.2;
}
let doorCool = 0;
function setWalking(on: boolean) {
  if (on === walking || interiors.active) return;
  walking = on;
  select(null);
  if (on) {
    if (rig.mode === "follow" || rig.mode === "inspect") exitFollow();
    // start where the map was looking, on the first free spot, facing the way the map faced
    const f = rig.focus;
    let at = new THREE.Vector3(f.x, CURB, f.z);
    search: for (let r = 0; r < 10; r += 0.7)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = f.x + Math.cos(a) * r,
          z = f.z + Math.sin(a) * r;
        if (!onFoot.collide!(x, z)) {
          at = new THREE.Vector3(x, CURB, z);
          break search;
        }
      }
    const dir = rig.camera.getWorldDirection(new THREE.Vector3());
    onFoot.place(at, Math.atan2(-dir.x, -dir.z));
    doorCool = 0.8;
  }
  onFoot.enabled = on;
  rig.controls.enabled = !on;
  hud.setWalking(on);
  hud.cut();
}
/** Walking into a walk-in door takes you inside. */
/** The walk-in door the walker is heading for, and how far (for the "Enter" prompt). */
const doorPrompt = document.createElement("div");
doorPrompt.className = "door-prompt hud";
document.getElementById("ui")!.append(doorPrompt);
function prompt(text: string | null) {
  if (doorPrompt.textContent !== (text ?? "")) doorPrompt.innerHTML = text ?? "";
  doorPrompt.classList.toggle("on", !!text);
}
const lastFoot = new THREE.Vector3();
function throughDoors(dt: number) {
  doorCool -= dt;
  const p = onFoot.camera.position;
  const fx = -Math.sin(onFoot.heading),
    fz = -Math.cos(onFoot.heading);
  let best: { d: (typeof doors)[number]; dist: number; facing: number } | null = null;
  for (const d of doors) {
    const dx = d.at.x - p.x,
      dz = d.at.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 5) continue;
    const facing = (dx * fx + dz * fz) / Math.max(1e-6, dist);
    if (!best || dist < best.dist) best = { d, dist, facing };
  }
  if (best && (best.facing > 0.35 || best.dist < 1.6)) prompt(`<b>${PLACES[best.d.key]}</b><span>▲ keep walking to enter</span>`);
  else prompt(null);
  if (doorCool > 0 || !best) return;
  // close to the door and walking at it (the facade's collider may stop you a step short)
  const moving = Math.hypot(p.x - lastFoot.x, p.z - lastFoot.z) > 0.002;
  lastFoot.set(p.x, 0, p.z);
  if (best.dist < 1.15 || (moving && best.dist < 2.4 && best.facing > 0.6)) {
    prompt(null);
    enterPlace(best.d.key);
  }
}
const footFocus = new THREE.Vector3();

tv = new TvMode(rig, director, (on) => hud.setTv(on));
if (new URLSearchParams(location.search).has("tv")) setTimeout(() => tv?.start(), 4000);

if (city.factory) director.spawnMiners(city.factory.patrol);
// the MEMPOOL chain live: the HQ's board and dock hands, the branches' counters and customers
const mempoolLive = new MempoolLive(city, director);

const venues = new Venues(document.getElementById("ui")!, {
  onStreet: () => [...director.snarks].filter((s) => s.state !== "resident" && s.root.visible).map((s) => s.id),
  select: (id) => {
    const s = [...director.snarks].find((x) => x.id === id);
    if (!s) return;
    venues.close();
    select(s);
    s.root.getWorldPosition(tmp);
    rig.flyTo(tmp.setY(1), 1.6);
  },
  closed: () => {},
});
const tmp = new THREE.Vector3();
const reader = new Reader(document.getElementById("ui")!);
reader.onClose = () => {
  if (interiors.active) interiors.walk.enabled = true;
};
const arcade = new Arcade(document.getElementById("ui")!);
arcade.onClose = reader.onClose;

// the places you can walk into, tagged over their doors
hud.setPlaces([
  ...(city.shops[0] ? [{ key: "mempool", label: "MEMPOOL HQ", sub: "pending tx · pickup · loading dock", at: city.shops[0].door.clone().setY(4.6) }] : []),
  ...city.venues.map((v) => ({
    key: v.kind,
    label: PLACES[v.kind],
    sub: PLACE_SUB[v.kind] ?? "",
    at: v.door.clone().setY(v.kind === "library" ? 7.8 : 5.6),
  })),
  ...(city.factory ? [{ key: "factory", label: "PROOF FACTORY", sub: "shielded tx proved here", at: (city.factory.roof ?? city.factory.hall).clone().add(new THREE.Vector3(0, 3, 0)) }] : []),
]);

/** The stadium asks first: a seat in the stands, or boots on the pitch. */
let closeChoice: (() => void) | null = null;
function stadiumChoice(): Promise<number | null> {
  closeChoice?.();
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "choice hud";
    el.innerHTML = `<div class="mh">ブロック競技場 · BLOCK STADIUM</div>
      <button data-f="0"><b>Watch the match</b><span>a seat in the stands, with the crowd</span></button>
      <button data-f="1"><b>Play on the pitch</b><span>run after the ball, score for Shielded</span></button>
      <button data-f="x" class="x">Not now</button>`;
    const done = (v: number | null) => {
      closeChoice = null;
      el.remove();
      window.removeEventListener("keydown", esc);
      resolve(v);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && done(null);
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-f]");
      if (b) done(b.dataset.f === "x" ? null : Number(b.dataset.f));
    });
    window.addEventListener("keydown", esc);
    closeChoice = () => done(null);
    document.getElementById("ui")!.appendChild(el);
  });
}

function enterPlace(key: string, floor?: number) {
  select(null);
  if (!(key === "stadium" && floor === undefined)) closeChoice?.();
  if (!(key in PLACES)) return;
  if (key === "stadium" && floor === undefined) {
    if (walking) onFoot.enabled = false;
    void stadiumChoice().then((f) => {
      if (f === null) {
        if (walking) onFoot.enabled = true;
        return;
      }
      enterPlace(key, f);
    });
    return;
  }
  // on foot, you come back out of the same door
  if (walking) {
    cameIn = key as Interior["key"];
    onFoot.enabled = false;
  }
  interiors.enter(key as Interior["key"], floor ?? 0);
  caseBook?.visit(key);
}

window.addEventListener("keydown", (e) => {
  // the elevator from the keyboard
  if ((e.key === "PageUp" || e.key === "PageDown") && interiors.active && interiors.active.floors.length > 1) {
    e.preventDefault();
    // in a lift car: the next floor up or down. Elsewhere a hidden shortcut (accessibility) jumps
    // to the next floor's landing; the way between floors is the lifts and stairs inside.
    if (interiors.circ?.carIn()) return void interiors.circ.step(e.key === "PageUp" ? 1 : -1);
    // by height, not by index (a basement may come after the roof in the list)
    const order = interiors.active.floors.map((x, k) => ({ y: x.y, k })).sort((a, b) => a.y - b.y || a.k - b.k);
    const at = order.findIndex((o) => o.k === interiors.floor);
    const n = order[at + (e.key === "PageUp" ? 1 : -1)]?.k ?? -1;
    if (n < 0) return;
    interiors.goTo(n);
    hud.cut();
    hud.renderIndoor(interiors.floor);
    return;
  }
  if (e.key !== "Escape") return;
  // one handler for Escape, innermost first
  if (arcade.open) arcade.close();
  else if (reader.open) reader.close();
  else if (venues.open) venues.close();
  else if (payDesk.open) payDesk.close();
  else if (interiors.active) {
    if (document.querySelector("#ui .panel.open")) select(null);
    else interiors.exit();
  } else if (walking && !document.querySelector("#ui .panel.open")) setWalking(false);
  else hud.escape();
});

function exitFollow() {
  rig.exit();
  venues.close();
  hud.follow(null);
}

function syncCamera() {
  hud?.camera(rig.shot, rig.mode, rig.picked, rig.auto, rig.shopSite?.name);
}

function select(s: Snark | null) {
  selected?.setSelected(false);
  selected = s;
  if (s) {
    s.setSelected(true);
    bubbles.address(s.root);
    hud.open(s);
    // the NFT's traits and rank are fetched on demand, to stay well inside the API's rate limit
    if (!s.item)
      void ZScan.zkSnark(s.id).then((item) => {
        s.item = item;
        if (selected === s) hud.open(s);
      });
  } else hud.close();
}

// ---- picking ----------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down: { x: number; y: number } | null = null;
const pickable = () => [...director.snarks].filter((s) => s.root.visible && s.state !== "riding").map((s) => s.body);
function hitAt(x: number, y: number) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  return ray.intersectObjects(pickable(), false).find((h) => opaqueAt(h));
}
/** The block bus under the cursor, if any. */
function busAt(x: number, y: number) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  let best: { b: BlockBus; d: number } | null = null;
  for (const b of director.buses) {
    const h = ray.intersectObject(b.group, true)[0];
    if (h && (!best || h.distance < best.d)) best = { b, d: h.distance };
  }
  return best?.b ?? null;
}
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY };
  rig.interrupt();
});
canvas.addEventListener("pointerup", (e) => {
  // inside a place: a click (not a look-around drag) inspects what is under it
  if (interiors.active) {
    if (e.button !== 0 || interiors.walk.dragged) return;
    // the people inside: talk to them
    const npc = interiors.snarkAt(e.clientX, e.clientY);
    if (npc && interiors.active) {
      bubbles.address(npc.root);
      const place = interiors.active;
      const floor = place.floors[interiors.floor];
      const job = npc.role ?? "visitor";
      return talk.show(
        npcSpeaker(
          `${place.key}-${npc.id}-${job}`,
          `${npc.name} · ${job}`,
          `${npc.name}, the ${job.toLowerCase()} at the ${place.title} in ZStreet`,
          ZScan.zkSnarkImage(npc.id),
          `Welcome to the ${place.title}! I'm the ${job.toLowerCase()} here. What can I tell you?`,
          () => `You work at the ${place.title} (${floor.name}). ${PLACE_LORE[place.key] ?? PLACE_ABOUT[place.key] ?? ""}${npc.txs.length ? ` You hold transaction ${npc.txs[0].txid} (${npc.txs[0].kind}).` : ""}`,
          director,
        ),
      );
    }
    const info = interiors.pickAt(e.clientX, e.clientY);
    if (info?.panel === "wallets" || info?.panel === "guestbook") {
      interiors.walk.enabled = false;
      return info.panel === "wallets" ? payDesk.gallery(info.wallet ?? null) : payDesk.compose("guestbook");
    }
    if (info?.panel) return venues.show(info.panel);
    // the tower: its elevator doors, its arcade games
    // old elevator doors, escalators: no teleport, the lift cars and the stairs are walked
    if (info?.floor !== undefined && interiors.active) return void hud.showPick({ ...info, floor: undefined, body: `${info.body ?? ""}<p>Floors are reached on foot: walk into a lift car and press a floor, or take the stairs and escalators.</p>` });
    if (info?.game) {
      interiors.walk.enabled = false;
      return void arcade.show(info.game);
    }
    // a book in the library: open it and read
    if (info?.book) {
      interiors.walk.enabled = false;
      return void reader.show(info.book);
    }
    if (info) hud.showPick(info);
    return;
  }
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  // the game's things in the city: a treasure coin, the whale
  if (e.button === 0) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, viewCam());
    if (mayor.treasure.click(ray)) return;
    if (plots.click(ray)) return;
    if (works.click(ray)) return;
    if (eggs.click(ray)) return;
    const ci = critters.catAt(ray);
    if (ci >= 0) return adoptCat(ci);
    if (whale.hit(ray)) return;
  }
  const hit = hitAt(e.clientX, e.clientY);
  const s = hit ? (hit.object.userData.snark as Snark) : null;
  if (!s && e.button === 0) {
    const item = itemAt(e.clientX, e.clientY);
    if (item) select(null);
    if (item?.block) return void hud.showBlock(item.block);
    if (item?.tx) return void hud.showTx(item.tx);
    // a metro train: ride it, from inside
    const car = trainCarAt(e.clientX, e.clientY);
    if (car) {
      if (walking) setWalking(false);
      rig.rideTrain(car);
      hud.follow(null);
      return syncCamera();
    }
    // a bus: ride it, from inside
    const bus = busAt(e.clientX, e.clientY);
    if (bus) {
      if (walking) setWalking(false);
      rig.rideIn(bus);
      hud.follow(null);
      return syncCamera();
    }
    // a meme poster on a wall, a film poster: what it is
    const mp = posterAtCity(e.clientX, e.clientY);
    if (mp) return void hud.showPick(mp.info());
    // a shop of the shōtengai: its counter, live
    const st = storeAt(e.clientX, e.clientY);
    if (st) return void openStore(st.id);
    // the ZEC Flyer: board a capsule and go round once, the city below
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, viewCam());
    const ride = walking ? null : sky.hit(ray);
    if (ride) return boardSky(ride);
    // a walk-in place: in you go
    const place = placeAt(e.clientX, e.clientY);
    if (place) return enterPlace(place);
  }
  select(s);
  // clicking another zkSNARK while following switches the camera to it
  if (s && rig.mode === "follow") {
    rig.follow(s);
    hud.follow(s);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (interiors.active) {
    highlight(null);
    if (e.buttons) return void hud.hover(null);
    const label = interiors.hoverAt(e.clientX, e.clientY);
    canvas.style.cursor = label ? "pointer" : "grab";
    if (label) hud.hoverText(label, e.clientX, e.clientY);
    else hud.hover(null);
    return;
  }
  if (e.buttons) return void hud.hover(null);
  const hit = hitAt(e.clientX, e.clientY);
  const item = hit ? null : itemAt(e.clientX, e.clientY);
  const train = hit || item ? null : trainCarAt(e.clientX, e.clientY);
  const bus = hit || item || train ? null : busAt(e.clientX, e.clientY);
  const poster = hit || item || bus || train ? null : posterAtCity(e.clientX, e.clientY);
  const store = hit || item || bus || poster ? null : storeAt(e.clientX, e.clientY);
  const place = hit || item || bus || store || poster ? null : placeAt(e.clientX, e.clientY);
  canvas.style.cursor = hit || item || place || bus || store || train || poster ? "pointer" : "";
  // hovering a place lights it up, with its name and the way in over its door
  if (place) hud.hoverPlace(place);
  highlight(place);
  if (hit) hud.hover(hit.object.userData.snark as Snark, e.clientX, e.clientY);
  else if (item?.block) hud.hoverText(`<b>Block ${item.block.height.toLocaleString("en-US")}</b><span>${Math.max(0, item.block.tx_count - 1)} tx · click to open</span>`, e.clientX, e.clientY);
  else if (item?.tx) hud.hoverText(`<b>Parcel</b><span>${item.tx.kind} tx waiting for a block</span>`, e.clientX, e.clientY);
  else if (train) hud.hoverText(`<b>ZEC LINE</b><span>click to ride inside</span>`, e.clientX, e.clientY);
  else if (store) hud.hoverText(`<b>${store.name}</b><span>click for the counter</span>`, e.clientX, e.clientY);
  else if (poster) hud.hoverText(poster.hover, e.clientX, e.clientY);
  else if (bus) hud.hoverText(`<b>Block bus${bus.blockHeight ? ` ${bus.blockHeight.toLocaleString("en-US")}` : ""}</b><span>click to ride inside</span>`, e.clientX, e.clientY);
  else {
    const flying = place ? null : skyAt(e.clientX, e.clientY);
    if (flying) canvas.style.cursor = "pointer";
    if (flying) hud.hoverText(flying === "blimp" ? `<b>ZEC BLIMP</b><span>click to board · city tour</span>` : `<b>ZEC FLYER</b><span>click to ride a capsule</span>`, e.clientX, e.clientY);
    else hud.hover(null);
  }
});
canvas.addEventListener("pointerleave", () => {
  hud.hover(null);
  highlight(null);
});

/** A car of a metro train under the cursor. */
function trainCarAt(x: number, y: number) {
  if (!metro.trains.length && !metro2.trains.length) return null;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  for (const t of [...metro.trains, ...metro2.trains])
    for (const c of t.cars) {
      if (!c.visible) continue;
      if (ray.intersectObject(c, true).length) return c;
    }
  return null;
}

/** A meme poster (or a film poster) on the street under the cursor, not too far away. */
function posterAtCity(x: number, y: number) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  return posterHit(ray, scene, 70);
}

/** A shop of the shōtengai under the cursor. */
function storeAt(x: number, y: number) {
  if (rig.mode === "inspect" || rig.mode === "follow" || !city.stores.length) return null;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  let best: { s: (typeof city.stores)[number]; d: number } | null = null;
  for (const st of city.stores) {
    const o = st.occluder;
    const h = ray.intersectObject(o.full.visible ? o.full : o.cut, true)[0];
    if (h && (!best || h.distance < best.d)) best = { s: st, d: h.distance };
  }
  return best?.s ?? null;
}

async function openStore(id: string) {
  const info = await storeInfo(id, {
    mempool: () => director.mempoolList(),
    lastBlock: () => (lastSummary ? { height: lastSummary.height, time: Date.parse(lastSummary.time), txs: lastSummary.tx_count, pool: lastSummary.miner_pool } : null),
    nu7: () => ({ height: nu7.height, date: nu7.date, activated: nu7.activated, tip: director.blockHeight }),
  });
  if ("game" in info && !("title" in info)) return void arcade.show(info.game);
  const mood = gameWorld?.shop(id);
  if (mood) {
    (info as PickInfo).tag = mood.tag;
    if (mood.bonus) profile.pay(mood.bonus, "happy hour");
  }
  hud.showPick(info as PickInfo);
}

function shopAt(x: number, y: number) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  for (const site of city.shops) {
    const o = site.occluder;
    const target = o.full.visible ? o.full : o.cut;
    if (ray.intersectObject(target, true).length) return site;
  }
  return null;
}
// the wheel button turns the view; keep the browser from starting its autoscroll
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1) e.preventDefault();
});

/** A block box on the shop shelves or a parcel on its rack, once the camera can see inside. */
function itemAt(x: number, y: number): { block?: BlockSummary; tx?: Tx } | null {
  const site = city.shops[0];
  if (!site || (rig.mode !== "inspect" && site.occluder.level > 0.5)) return null;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  const h = ray.intersectObjects([...(shelf?.meshes ?? []), ...director.rackMeshes()], false)[0];
  return h ? { block: h.object.userData.block, tx: h.object.userData.tx } : null;
}

/** The building of a walk-in place. */
function occluderOf(key: Interior["key"]) {
  if (key === "mempool") return city.shops[0]?.occluder ?? null;
  if (key === "factory") return city.factory?.occluder ?? null;
  return city.venues.find((v) => v.kind === key)?.occluder ?? null;
}

/** A warm glow on the hovered building (its materials are its own copies, so this is safe). */
let lit: Interior["key"] | null = null;
function highlight(key: Interior["key"] | null) {
  if (key === lit) return;
  const set = (k: Interior["key"] | null, on: boolean) => {
    const o = k && occluderOf(k);
    if (!o) return;
    for (const root of [o.full])
      root.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat?.isMeshStandardMaterial) {
          mat.emissive.set(on ? "#f4b728" : "#000000");
          mat.emissiveIntensity = on ? 0.2 : 1;
        }
      });
  };
  set(lit, false);
  set(key, true);
  lit = key;
  // and a gold outline around it
  const o = key && occluderOf(key);
  outline.visible = !!o;
  if (o) {
    o.box.getCenter(outline.position);
    o.box.getSize(outline.scale).addScalar(0.3);
  }
}
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.9 }),
);
outline.visible = false;
scene.add(outline);

/** The walk-in place under the cursor: the MEMPOOL shop, the card shop, the bank, the factory. */
function placeAt(x: number, y: number): Interior["key"] | null {
  if (rig.mode === "inspect" || rig.mode === "follow") return null;
  const v = venueAt(x, y);
  if (v) return v.kind;
  if (factoryAt(x, y)) return "factory";
  return shopAt(x, y) ? "mempool" : null;
}

function factoryAt(x: number, y: number) {
  const f = city.factory;
  if (!f || f.occluder.level < 0.5) return false;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  return ray.intersectObject(f.occluder.full, true).length > 0;
}

function venueAt(x: number, y: number) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, viewCam());
  let best: { v: (typeof city.venues)[number]; d: number } | null = null;
  for (const v of city.venues) {
    const o = v.occluder;
    const h = ray.intersectObject(o.full.visible ? o.full : o.cut, true)[0];
    if (h && (!best || h.distance < best.d)) best = { v, d: h.distance };
  }
  return best?.v ?? null;
}

/** Only the drawn pixels of the portrait are clickable, not its transparent corners. */
function opaqueAt(h: THREE.Intersection) {
  const map = ((h.object as THREE.Mesh).material as THREE.MeshBasicMaterial).map;
  const img = map?.image as HTMLCanvasElement | undefined;
  if (!h.uv || !img?.getContext) return true;
  const x = Math.min(img.width - 1, Math.floor(h.uv.x * img.width));
  const y = Math.min(img.height - 1, Math.floor((1 - h.uv.y) * img.height));
  return img.getContext("2d")!.getImageData(x, y, 1, 1).data[3] > 0;
}

// ---- live feed --------------------------------------------------------------------------------
let first = true;
talk = new Talk(document.getElementById("ui")!);

// "follow your transaction": paste a txid or open zstreet.cash/?tx=…
const tracker = new Tracker(document.getElementById("ui")!, director, {
  follow: (s) => {
    if (interiors.active) interiors.exit();
    if (walking) setWalking(false);
    select(s);
    rig.follow(s);
    hud.follow(s);
    syncCamera();
  },
  archive: (h) => {
    if (interiors.active?.key !== "mempool") enterPlace("mempool");
    interiors.goTo(1);
    hud.renderIndoor(1);
    window.dispatchEvent(new CustomEvent("zstreet:archive", { detail: h }));
  },
});

// the other visitors in the city, live (presence through the API)
const visitors = new Visitors(scene, document.getElementById("ui")!, () => {
  const p = walking ? onFoot.camera.position : rig.focus;
  return { x: p.x, z: p.z, mode: interiors.active ? 2 : walking ? 1 : 0, place: interiors.active?.key ?? null };
});

// photo mode: the HUD steps aside, a filter, a signed PNG of the frame
let grabbers: ((c: HTMLCanvasElement) => void)[] = [];
new Photo(document.getElementById("ui")!, canvas, {
  grab: (fn) => grabbers.push(fn),
  height: () => director.blockHeight,
});

// ---- the game: one block = one turn ----
const chainClock = new ChainClock();
const gameHud = new GameHud(document.getElementById("ui")!);
gameWorld = new GameWorld(chainClock, decor, lampLights, city.factory?.hall ?? null, {
  power: (st) => sound.power(st === "down"),
  storm: (on) => {
    chainStorm = on;
    weather();
  },
  thunder: () => sound.thunder(),
  inside: () => interiors.active !== null,
  mail: (k, title, text) => gameHud.mail(k, title, text),
});

caseBook = new CaseBook(gameHud, (h) => {
  if (interiors.active?.key !== "mempool") enterPlace("mempool");
  interiors.goTo(1);
  hud.renderIndoor(1);
  window.dispatchEvent(new CustomEvent("zstreet:archive", { detail: h || chainClock.height || director.blockHeight }));
});

// the street's gossip about each block (one model call per block, shared), and the morning paper
// every citizen an agent: personas for all, a turn per block for the day's cast
agents = new Agents(chainClock, director);
residents.brain = agents;
agents.onTurn(() => residents.replan());
const gossip = new Gossip(chainClock);
gossip.on((g) => chatter.gossip(g.lines));
setTimeout(() => void gossip.fetch(), 4000);
new Radio(gossip, gameHud, () => sound.on);
const paper = new PaperView(document.getElementById("ui")!);
void paper.load().then((p) => {
  if (!p) return;
  let seen = "";
  try {
    seen = localStorage.getItem("street.paper") ?? "";
    localStorage.setItem("street.paper", p.day);
  } catch {}
  if (seen !== p.day) gameHud.mail("paper", "The ZStreet Daily", p.headline, { label: "Read", fn: () => void paper.open() });
});

// the mayor: a decree every 40 blocks (festival, curfew, treasure hunt) that changes the city
const mayor = new Mayor(scene, chainClock, decor, gameHud, {
  effect: (e) => {
    curfew = e === "curfew";
    crowd();
    if (e === "festival") decor.pulse("#ff7aa8", 8);
  },
  party: (sec) => nu7.party(sec),
  spots: () => city.lamps.filter((l) => Math.abs(l.pos.x) < 140 && Math.abs(l.pos.z) < 120).map((l) => new THREE.Vector3(l.pos.x, CURB, l.pos.z)),
});
setTimeout(() => void mayor.fetch(), 5000);

// Shielded vs Transparent: today's transactions and the visitors' deeds hold the quarters
factions = new Factions(chainClock, gameHud);
setTimeout(() => chainClock.height && void factions?.seed(chainClock.height), 9000);
caseBook.onSolved = () => factions?.deed(10);

// the city's live events: everyone gets the same reminders, the toast takes you in
const liveEvents = new LiveEvents(gameHud, decor, (place) => enterPlace(place, place === "stadium" ? 0 : undefined), () => chainClock.height || director.blockHeight || 0);

// Builders' Row: visitors' own buildings, made in the voxel workshop, kept by the API
const editor = new Editor(document.body);
const plots = new Plots(scene, document.getElementById("ui")!, editor, {
  say: (h) => gameHud.say(h),
  pause: (on) => {
    cityPaused = on;
    document.getElementById("ui")!.style.visibility = on ? "hidden" : "";
  },
});
visitors.onPlot(() => plots.changed());

// the city works: the day's agents propose buildings, visitors vote, the winner goes up block by block
const works = new Works(scene, document.getElementById("ui")!, renderer, chainClock, gameHud, decor, {
  go: (x, z) => {
    if (interiors.active) interiors.exit();
    if (walking) setWalking(false);
    rig.district(new THREE.Vector3(x, 1, z), 0.42);
  },
  near: () => (walking ? onFoot.camera.position : rig.focus),
});
visitors.onWorks(() => works.changed());

// the wallet layer: pay ZStreet from your own wallet (QR code, or address and memo copied) and the
// memo plays for everyone once mined: a message on the ground, a guestbook line, a sealed vote, a tip
/** Where the walker stands (feet), for a message left on the ground; null off foot. */
function standing() {
  if (interiors.active) {
    const p = interiors.walk.camera.position;
    return { place: interiors.active.key, floor: interiors.floor, x: p.x, y: p.y - 1.6, z: p.z };
  }
  if (!walking) return null;
  const p = onFoot.camera.position;
  return { place: "street", floor: 0, x: p.x, y: p.y - 1.6, z: p.z };
}
const payDesk = new PayDesk(document.getElementById("ui")!, {
  here: standing,
  closed: () => {
    if (interiors.active) interiors.walk.enabled = true;
  },
});
works.hooks.sealedVote = (round, idx, name) => payDesk.compose("vote", { round, idx, title: name });
const marks = new Marks(scene, document.getElementById("ui")!, {
  walker: () =>
    interiors.active
      ? { eye: interiors.walk.camera.position, place: interiors.active.key, floor: interiors.floor }
      : walking
        ? { eye: onFoot.camera.position, place: "street", floor: 0 }
        : null,
  placeScene: () => (interiors.active ? { key: interiors.active.key, scene: interiors.active.scene } : null),
  read: (m) => {
    if (interiors.active) interiors.walk.enabled = false;
    payDesk.read(m);
  },
});
// N on foot: leave a sealed message where you stand
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyN" || e.repeat || (!walking && !interiors.active) || payDesk.open || (e.target as HTMLElement).closest?.("input,textarea")) return;
  e.preventDefault();
  if (interiors.active) interiors.walk.enabled = false;
  payDesk.compose("mark", { here: standing() });
});
visitors.onMark((e) => marks.onMark(e));
function onPayEvent(e: PayEvent) {
  marks.onPay(e);
  const mine = !!e.ref && myRefs.has(e.ref);
  if (e.action === "guestbook") window.dispatchEvent(new CustomEvent("zstreet:guestbook"));
  if (e.action === "tip") {
    nu7.party(e.sponsor ? 30 : 12);
    decor.alert({ kind: "game", title: "THANK YOU  感謝", big: e.name ? e.name.toUpperCase() : "A SHIELDED TIP", line: `${e.amount ?? ""} ZEC · BLOCK ${e.height.toLocaleString("en-US")}`, color: "#ff9a3c" });
  }
  if (!mine) {
    if (e.action === "mark" && e.place === "street") gameHud.mail("chain", "A new message on the ground", `“${(e.text ?? "").slice(0, 120)}” — sealed in block ${e.height.toLocaleString("en-US")}.`);
    return;
  }
  const what =
    e.action === "mark" ? "Your message glows where you stood." : e.action === "guestbook" ? "Your line is on the wallet towers' guestbook." : e.action === "vote" ? "Your sealed vote counts in City Works." : "Thank you! Fireworks over the avenue.";
  gameHud.mail("chain", `Sealed in block ${e.height.toLocaleString("en-US")}`, what);
}
visitors.onPay(onPayEvent);

// the NU7 quarter: the NU7 Tower and the karting go up as NU7 gets closer
const nu7Quarter = new Nu7Quarter(scene, gameHud, {
  go: (x, z, zoom = 0.4) => {
    if (interiors.active) interiors.exit();
    if (walking) setWalking(false);
    rig.district(new THREE.Vector3(x, 1, z), zoom);
  },
  nu7: () => ({ date: nu7.date, height: nu7.height, activated: nu7.activated, tip: director.blockHeight || null }),
});

// a street cat to adopt: it follows you around the city (and is still yours next visit)
const CAT_NAMES = ["Mochi", "Nori", "Satoshi", "Zooko", "Halo", "Sapling", "Orchard", "Nullifier", "Tofu", "Yuzu", "Proof", "Memo"];
const catFollow = () => (walking ? onFoot.camera.position : rig.focus);
function adoptCat(i: number) {
  const own = profile.p.cat;
  if (own && critters.petIndex === i) return void gameHud.say(`<b>${own.name}</b> · purrs`);
  const name = CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)];
  profile.update((p) => (p.cat = { id: i, name }));
  critters.adopt(i, catFollow);
  gameHud.say(`<b>🐈 ${name}</b> · ${own ? `swapped ${own.name} for a new friend` : "adopted you"}: it follows you everywhere now`);
}
if (profile.p.cat) critters.adopt(profile.p.cat.id, catFollow);

// the season follows the last network upgrade (its colour on every block's neon swing)
void loadSeason();

// jobs: courier, miner, bus driver (from the citizen card)
jobs = new Jobs(gameHud, chainClock, {
  walkFrom: (at) => {
    if (interiors.active) interiors.exit();
    if (walking) setWalking(false);
    rig.controls.target.copy(at);
    setWalking(true);
  },
  onFoot: () => (walking ? onFoot.camera.position : null),
  project,
  depot: () => city.docks.find((d) => d.kind === "depot")?.at?.clone() ?? null,
  hq: () => director.shopSites()[0]?.site.door.clone() ?? null,
  mempoolTx: () => {
    const l = director.mempoolList();
    return l.length ? l[Math.floor(Math.random() * l.length)] : null;
  },
  rideNextBus: () => {
    if (interiors.active) interiors.exit();
    driveNextBus = true;
  },
  busX: () => jobBus?.group.position.x ?? null,
  stopX: DISTRICTS[0].stopX,
  factory: () => enterPlace("factory"),
});

// the Block Casino: settled by the next block's hash (from the citizen card or the gacha shop)
new Casino(gameHud, chainClock);

// the Genesis Line: back through Zcash's history, the city shrinking to what it was
const genesis = new TimeTravel(scene, canvas, decor, gameHud);

// secrets the chain unlocks: a door opens somewhere on a rare block, first visitor there wins
const eggs = new Eggs(scene, chainClock, city.facades, decor, gameHud, (h) => visitors.emit("egg", h));

// when the network shakes, so does the city: a reorg is an earthquake, a hashrate drop trips the power station
const disasters = new Disasters(chainClock, decor, gameHud, {
  rumble: () => sound.thunder(),
  react: () => residents.react("!", null, 0.8),
  blackout: (r, at) => gameWorld?.blackout(r, at),
  powerPlant: () => (city.factory ? new THREE.Vector2(city.factory.hall.x, city.factory.hall.z) : new THREE.Vector2(-175, 104)),
});

// the whale: a big public amount swims over the avenue until visitors shield it
const WHALE_ZAT = 500e8;
const whale = new Whale(scene, document.getElementById("ui")!, { x0: -TUNNEL.mouth + 10, x1: TUNNEL.mouth - 10, z: (CITY.road.z0 + CITY.road.z1) / 2 }, {
  hit: () => {
    profile.pay(5, "proof");
    sound.event("hit");
    visitors.emit("whale");
  },
  shielded: (tx) => {
    profile.pay(100, "whale");
    profile.update((p) => p.stats.whales++);
    factions?.deed(15);
    nu7.party(5);
    sound.crowd(true);
    gameHud.say(`<b>WHALE SHIELDED</b> · ${((tx.visible ?? 0) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZEC out of sight · ⓩ +100`);
  },
  escaped: () => {
    sound.crowd(false);
  },
  project,
});
// on foot: the radar in the corner, M for the whole map
const minimap = new Minimap(document.getElementById("ui")!, renderer, scene);
let minimapOn = false;
/** Each place's sign on the map, in the city's kanji. */
const PLACE_ICON: Record<Interior["key"], string> = {
  mempool: "待",
  factory: "工",
  library: "書",
  tower: "塔",
  museum: "美",
  stadium: "球",
  prison: "獄",
  mall: "店",
  hotel: "宿",
  needle: "針",
  pyramid: "金",
  eiffel: "鉄",
  colosseum: "闘",
  reserve: "銀",
  opera: "歌",
  bigben: "鐘",
  statue: "像",
  arab: "帆",
  gardens: "園",
  palm: "椰",
  "tower-orchard": "楼",
  "tower-sapling": "緑",
  "tower-halo": "環",
  cemetery: "霊",
  zodl: "鳥",
  vizor: "視",
  noir: "黒",
  university: "学",
};
const placeBlips: Blip[] = doors.map((d) => ({ x: d.at.x, z: d.at.z, kind: "place", label: PLACES[d.key], icon: PLACE_ICON[d.key] }));
function mapBlips(): Blip[] {
  const out = [...placeBlips];
  const g = jobs?.goal;
  if (g) out.push({ x: g.x, z: g.z, kind: "goal" });
  const e = eggs.where;
  if (e) out.push({ x: e.x, z: e.z, kind: "secret" });
  if (whale.active) out.push({ x: whale.position.x, z: whale.position.z, kind: "whale" });
  for (const c of mayor.treasure.spots) out.push({ x: c.x, z: c.z, kind: "coin" });
  const wb = works.blip();
  if (wb) out.push({ x: wb.x, z: wb.z, kind: "place", label: wb.label, icon: "建" });
  const nb = nu7Quarter.blip();
  out.push({ x: nb.x, z: nb.z, kind: "place", label: nb.label, icon: "七" });
  for (const p of visitors.positions()) out.push({ x: p.x, z: p.z, kind: "visitor" });
  for (const s of director.snarks) if (s.state === "resident" && s.root.visible && s.root.parent === scene) out.push({ x: s.root.position.x, z: s.root.position.z, kind: "agent" });
  return out;
}
// on foot: walk up to anyone and press E to talk (residents, carriers, the crowd on the pavements)
type TalkTarget = { s: Snark; i?: undefined; id: number; at: THREE.Vector3 } | { s?: undefined; i: number; id: number; at: THREE.Vector3 };
const crowdOf = () => (alive.named.people as unknown as { crowd?: Crowd } | undefined)?.crowd ?? null;
const talkPrompt = document.createElement("button");
talkPrompt.className = "talk-prompt hud";
document.getElementById("ui")!.append(talkPrompt);
let talkNear: TalkTarget | null = null;
let talkWith: TalkTarget | null = null;
let talkScan = 0;
const talkTmp = new THREE.Vector3();
function findTalker(): TalkTarget | null {
  const p = onFoot.camera.position;
  const fx = -Math.sin(onFoot.heading),
    fz = -Math.cos(onFoot.heading);
  // in front of you, close enough to talk
  const ahead = (x: number, z: number) => {
    const dx = x - p.x,
      dz = z - p.z;
    const d = Math.hypot(dx, dz);
    return d < 3.4 && (d < 1.2 || (dx * fx + dz * fz) / d > 0.45) ? d : Infinity;
  };
  let best: TalkTarget | null = null,
    bd = Infinity;
  for (const s of director.snarks) {
    if (!s.root.visible || s.root.parent !== scene || s.state === "riding" || s.state === "boarding" || s.state === "chauffeured") continue;
    const d = ahead(s.root.position.x, s.root.position.z);
    if (d < bd) (bd = d), (best = { s, id: s.id, at: s.root.position });
  }
  const crowd = crowdOf();
  if (crowd) {
    const i = crowd.nearest(p.x, p.z, 3.4, talkTmp);
    if (i >= 0) {
      const d = ahead(talkTmp.x, talkTmp.z);
      if (d < bd) best = { i, id: slotId(crowd.people[i].slot ?? 0), at: talkTmp.clone() };
    }
  }
  return best;
}
function showTalkPrompt(t: TalkTarget | null) {
  if (!t || talk.open || doorPrompt.classList.contains("on")) {
    talkPrompt.classList.remove("on");
    return;
  }
  const html = `<span><kbd>E</kbd> talk</span>`;
  if (talkPrompt.innerHTML !== html) talkPrompt.innerHTML = html;
  talkPrompt.classList.add("on");
}
function talkTo(t: TalkTarget) {
  const me = onFoot.camera.position;
  talkWith = t;
  talkPrompt.classList.remove("on");
  if (t.s) {
    const s = t.s;
    const face = s.faceDir;
    s.paused = true;
    s.faceDir = new THREE.Vector3(me.x - s.root.position.x, 0, me.z - s.root.position.z).normalize();
    talk.show(snarkSpeaker(s, director, agents), () => {
      s.paused = false;
      s.faceDir = face;
      talkWith = null;
    });
  } else {
    const crowd = crowdOf();
    if (!crowd || !agents) return;
    const i = t.i;
    crowd.hold(i, me.x - t.at.x, me.z - t.at.z);
    talk.show(crowdSpeaker(t.id, director, agents), () => {
      crowd.release(i);
      talkWith = null;
    });
  }
}
function talkUpdate(dt: number) {
  // walked away mid-conversation: they carry on with their day
  if (talkWith && talk.open && Math.hypot(talkWith.at.x - onFoot.camera.position.x, talkWith.at.z - onFoot.camera.position.z) > 7) talk.close();
  if ((talkScan -= dt) > 0) return;
  talkScan = 0.12;
  talkNear = talk.open ? null : findTalker();
  showTalkPrompt(talkNear);
}
talkPrompt.addEventListener("click", () => talkNear && talkTo(talkNear));
// everyone round you on foot: now and then someone notices you and says something
const npcs = new Npcs(scene, agents!, {
  snarks: () => [...director.snarks].filter((s) => s.root.parent === scene),
  crowd: crowdOf,
  me: () => (walking && !interiors.active ? { p: onFoot.camera.position, heading: onFoot.heading } : null),
  gossip: () => gossip.latest?.lines.map((l) => l.text) ?? [],
  height: () => chainClock.height,
  mempool: () => director.mempoolList().length,
  busy: (id) => talk.open && talkWith?.id === id,
  open: (x, z) => !city.nav.wall(x, z),
});
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyE" || !walking || interiors.active || talk.open || !talkNear || (e.target as HTMLElement).closest?.("input,textarea")) return;
  e.preventDefault();
  talkTo(talkNear);
});
visitors.onEvent((e) => {
  if (e.k === "whale") whale.remote();
  if (e.k === "egg" && e.n) eggs.taken(e.n);
});
director.onTx((tx) => {
  if (whale.active || tx.kind === "shielded" || (tx.visible ?? 0) < WHALE_ZAT) return;
  whale.spawn(tx, visitors.others_count);
  gameHud.mail("whale", "Whale alert", `${((tx.visible ?? 0) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZEC moving in public over the avenue. Tap it to shield it.`, {
    label: "Go",
    fn: () => {
      if (!whale.active) return;
      if (interiors.active) interiors.exit();
      if (walking) setWalking(false);
      rig.district(whale.position.clone().setY(1).add(new THREE.Vector3(30, 0, 0)), AREAS[0]?.zoom ?? 1);
    },
  });
  decor.alert({ kind: "game", title: "WHALE ALERT  鯨", big: `${((tx.visible ?? 0) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZEC`, line: "IN PLAIN SIGHT · SHIELD IT", color: "#5fb4ee" });
});
profile.checkIn();

connectFeed({
  snapshot: (txs, last) => {
    director.snapshot(txs, last);
    if (last) chainClock.start(last.height);
    if (first) {
      first = false;
      const q = new URLSearchParams(location.search).get("interior");
      if (q) setTimeout(() => enterPlace(q, Number(new URLSearchParams(location.search).get("floor") ?? 0)), 800);
      setTimeout(() => hud.ready(), 700);
      setTimeout(() => tracker.fromUrl(), 1200);
    }
  },
  tx: (tx) => {
    director.addTx(tx);
    pulse.tx(tx);
  },
  block: (b) => {
    director.block(b);
    chainClock.feed(b);
  },
  mempool: (ids) => director.sweep(ids),
  status: (s) => hud.setStatus(s),
});

if (new URLSearchParams(location.search).has("debug")) {
  Object.assign(window, {
    street: {
      finish,
      grade,
      scene3: scene,
      composer,
      setSamples: (n: number) => renderPass.setSamples(n),
      /** The game layer: feed a made-up block (n transactions, "shielded" kind), cut the power… */
      game: {
        clock: chainClock,
        world: gameWorld,
        profile,
        block: (n = 0, kind: Tx["kind"] = "shielded") =>
          chainClock.feed({
            height: chainClock.height + 1,
            time: Date.now(),
            size: 2000,
            fees: 0,
            pool: null,
            txs: Array.from({ length: n }, (_, i) => ({ txid: `test${chainClock.height}-${i}`, kind, fee: 1000, size: 2000, actions: 2, transparentOut: 0, seenAt: Date.now() }) as Tx),
          }),
        blackout: (r = 420) => gameWorld?.blackout(r),
        whaleObj: whale,
        cases: () => caseBook,
        mayor,
        gossip,
        plots,
        works,
        nu7Quarter,
        payDesk,
        marks,
        pay: onPayEvent,
        editor,
        factions: () => factions,
        quake: (d = 1) => disasters.quake(d),
        eggs,
        jobs: () => jobs,
        agents: () => agents,
        residents,
        /** On foot at (x, z), heading `yaw`. */
        stand: (x: number, z: number, yaw = 0) => {
          if (!walking) setWalking(true);
          onFoot.place(new THREE.Vector3(x, CURB, z), yaw);
        },
        /** On foot, a step in front of `id` (a resident), facing them. */
        meet: (id: number) => {
          const s = [...director.snarks].find((x) => x.id === id);
          if (!s) return false;
          if (!walking) setWalking(true);
          const p = s.root.position;
          onFoot.place(new THREE.Vector3(p.x, CURB, p.z + 2.2), 0);
          return true;
        },
        /** On foot, facing the crowd walker nearest the street's centre. */
        meetCrowd: () => {
          const c = crowdOf();
          if (!c) return -1;
          if (!walking) setWalking(true);
          const me = onFoot.camera.position;
          const at = new THREE.Vector3();
          const i = c.nearest(me.x, me.z, 80, at);
          if (i < 0) return -1;
          const later = c.positionOf(i, new THREE.Vector3());
          onFoot.place(new THREE.Vector3(at.x, CURB, at.z + 2), 0);
          return { i, x: later.x, z: later.z };
        },
        genesis,
        events: liveEvents,
        whale: (zec = 812) => whale.spawn({ txid: "test-whale", kind: "transparent", fee: 1000, size: 400, actions: 2, transparentOut: zec * 1e8, visible: zec * 1e8, seenAt: Date.now() } as Tx),
        storm: (on = true) => {
          chainStorm = on;
          weather(true);
        },
      },
      memes: memeStats,
      director,
      renderer,
      overlays,
      shibuya,
      stadium,
      sky,
      goldenGate,
      forest,
      cemetery,
      chatter,
      rideFlyer: () => boardSky("flyer"),
      rideBlimp: () => boardSky("blimp"),
      metro,
      tram,
      cityTraffic,
      life,
      alive,
      metro2,
      horns,
      prison,
      arrest: () => arrest(),
      walk: (on: boolean) => setWalking(on),
      storeAt: (x: number, y: number) => storeAt(x, y)?.id ?? null,
      openStore: (id: string) => openStore(id),
      residents,
      pulse,
      critters,
      tv,
      sound,
      nu7,
      onFoot,
      quality,
      rig,
      city,
      testVip: (tier: "taxi" | "limo") => director.debugVip(tier),
      cars: () => director.debugCars(),
      states: () => {
        const c: Record<string, number> = {};
        for (const s of director.snarks) c[`${s.state}${s.district ? "@" + s.district.slice(0, 3) : ""}`] = (c[`${s.state}${s.district ? "@" + s.district.slice(0, 3) : ""}`] ?? 0) + 1;
        return JSON.stringify(c);
      },
      buses: () => [...director.buses].map((b) => `${b.blockHeight}:${b.phase}@${b.group.position.x.toFixed(0)}`).join(" "),
      followBus: () => {
        const b = [...director.buses].at(-1);
        if (b) rig.followTheBus(b);
      },
      lookIn: (k: string) => {
        const site = city.shops.find((x) => x.district === k);
        if (site) rig.lookIn(site);
      },
      select: (s: Snark) => select(s),
      shelf,
      venues,
      hall,
      mempoolLive,
      interiors,
      enter: (k: string) => enterPlace(k),
      hud,
      follow: (s: Snark) => {
        select(s);
        rig.follow(s);
        hud.follow(s);
      },
      // Test only: the latest real block plus whatever the street is carrying, to watch boarding.
      testBoard: async () => {
        const lb = await ZScan.latestBlock();
        const b = lb && (await ZScan.block(lb.height));
        if (!b) return;
        const carried = [...director.snarks].flatMap((s) => (!["resident", "leaving", "guard"].includes(s.state) ? s.txs : []));
        director.block({ ...b, height: b.height + 1, txs: [...b.txs, ...carried.map((t) => ({ ...t }))] });
      },
    },
  });
}

// ---- walls down -------------------------------------------------------------------------------
// Any building standing between the camera and the spot it looks at, and covering most of the
// frame, sinks to its ground floor (a clipping plane slides down, then the capped cut model takes
// over). No ghostly transparency: what is left is solid and clean.
renderer.localClippingEnabled = true;
const centre = new THREE.Vector3();
const clips = new Map<Occluder, THREE.Plane>();
const sight = new THREE.Ray();
const eye = new THREE.Vector3();
/** `allUp`: on foot nothing is in the way of a map camera, every building stands at full height. */
function wallsDown(dt: number, allUp = false) {
  const focus = rig.focus;
  const camPos = rig.shot ? rig.persp.position : rig.iso.position;
  const toCam = camPos.clone().sub(focus).normalize();
  const close = rig.shot !== null || rig.iso.zoom > 1.6;
  for (const o of city.occluders) {
    if (o.fixed) continue;
    let cover = false;
    if (allUp || rig.mode === "overview") cover = false;
    // a walk-in place opens up only when you are close and looking right into it
    else if (o.box.containsPoint(focus)) cover = o.open && close && rig.shot !== "shop";
    else
      // in the way only if it really cuts the line from what is looked at (at a person's height)
      // to the camera, not merely because it is big on screen
      for (const h of [0.4, 1.6]) {
        sight.set(eye.copy(focus).setY(focus.y + h), toCam);
        const hit = sight.intersectBox(o.box, centre);
        if (hit && hit.distanceTo(eye) < camPos.distanceTo(eye)) {
          cover = true;
          break;
        }
      }
    const target = cover ? 0 : 1;
    if (o.level === target) continue;
    o.level = THREE.MathUtils.clamp(o.level + (target ? 1 : -1) * dt * 2.8, 0, 1);
    const k = o.level * o.level * (3 - 2 * o.level);
    const cutY = CURB + CUT_VOX * VOX;
    let plane = clips.get(o);
    if (!plane) {
      plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      clips.set(o, plane);
      o.full.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.clipShadows = true;
      });
    }
    plane.constant = cutY + (o.height - cutY) * k;
    const clipped = o.level < 1;
    o.full.traverse((m) => {
      const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mat.clippingPlanes = clipped ? [plane!] : null;
    });
    o.full.visible = o.level > 0.02;
    o.cut.visible = o.level < 0.98;
    o.extras.visible = plane.constant > cutY + 1.5 || !clipped;
  }
}

// ---- in-world labels --------------------------------------------------------------------------
const projected = new THREE.Vector3();
function project(v: THREE.Vector3) {
  projected.copy(v).project(viewCam());
  if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) return null;
  return { x: ((projected.x + 1) / 2) * window.innerWidth, y: ((1 - projected.y) / 2) * window.innerHeight };
}

// ---- loop -------------------------------------------------------------------------------------
const timer = new THREE.Timer();
const camRight = new THREE.Vector3();
const camQuat = new THREE.Quaternion();

// ---- capture mode (?debug&capture): no HUD, time advanced by the script, camera set per frame ----
const CAPTURE = new URLSearchParams(location.search).has("capture");
type CapShot = { pos: [number, number, number]; look: [number, number, number]; fov?: number; tilt?: number; roll?: number; far?: number };
let capShot: CapShot | null = null;
let capT = 0;
const capCam = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 600);
if (CAPTURE) {
  document.getElementById("ui")!.style.display = "none";
  Object.assign(window, {
    capture: {
      /** Advance the world by `dt` seconds and render one frame. */
      step: (dt: number) => frame(dt),
      shot: (s: CapShot | null) => (capShot = s),
      enter: (k: Interior["key"], floor = 0) => {
        interiors.enter(k, floor);
        interiors.walk.enabled = false;
      },
      leave: () => interiors.exit(),
      theme: (t: "day" | "night") => setTheme(t),
      /** Rain on or off for good (no passing showers while filming). */
      rain: (on: boolean) => {
        rainOn = on;
        weather(true);
      },
      /** Show or hide the HUD (gameplay shots keep it). */
      ui: (on: boolean) => (document.getElementById("ui")!.style.display = on ? "" : "none"),
      /** Take the lift, as the HUD's floor buttons do. */
      floor: (n: number) => {
        interiors.goTo(n);
        hud.cut();
        hud.renderIndoor(interiors.floor);
      },
      /** Back to the city's own camera (hover and click buildings with the mouse). */
      rig: (x: number, z: number, zoom: number) => {
        capShot = null;
        rig.setMode("free");
        rig.flyTo(new THREE.Vector3(x, 1, z), zoom);
      },
      carrier: () => director.debugCarrier(),
      queue: (n: number) => director.debugQueue(n),
      /** The newest bus: its phase, and the CCTV view inside it (pos/look in world space). */
      bus: (h?: number) => {
        const b = h ? [...director.buses].find((x) => x.blockHeight === h) : [...director.buses].at(-1);
        if (!b) return null;
        const g = b.group;
        g.updateMatrixWorld(true);
        const w = (v: THREE.Vector3) => g.localToWorld(v).toArray() as [number, number, number];
        return {
          phase: b.phase,
          height: b.blockHeight,
          riding: [...director.snarks].filter((s) => s.bus === b && s.state === "riding").length,
          x: g.position.x,
          z: g.position.z,
          inside: { pos: w(busLocal(3.2, BUS.h - 4.2, 2.6)), look: w(busLocal(BUS.w - 16, BUS.floor + 3, 9.5)) },
          // from the driver's corner, looking back down the aisle at the seats
          front: { pos: w(busLocal(BUS.w - 5, BUS.h - 4.5, 3)), look: w(busLocal(8, BUS.floor + 2, 10)) },
        };
      },
      snarkPos: (txid: string) => {
        const s = director.snarkOf(txid);
        if (!s) return null;
        s.root.getWorldPosition(tmp);
        return { x: tmp.x, y: tmp.y, z: tmp.z, state: s.state };
      },
      testBlock: () => (window as unknown as { street: { testBoard(): Promise<void> } }).street.testBoard(),
    },
  });
}
function aimCapture(cam: THREE.PerspectiveCamera, s: CapShot) {
  cam.position.set(...s.pos);
  cam.lookAt(...s.look);
  if (s.roll) cam.rotateZ(s.roll);
  cam.fov = s.fov ?? 34;
  cam.far = s.far ?? 600;
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
}

const joystick = new Joystick(document.getElementById("ui")!);

/** Advance the director by `sim` seconds in steps of at most 50 ms. */
function runDirector(sim: number, t: number, q: THREE.Quaternion, right: THREE.Vector3) {
  const n = Math.max(1, Math.ceil(sim / 0.05 - 1e-6));
  for (let i = 0; i < n; i++) director.update(sim / n, t - (sim * (n - 1 - i)) / n, q, right);
}

/** What the camera hears: people and traffic near the point it looks at, the zebra's signal. */
let earT = 0;
const earTmp = new THREE.Vector3();
function listen(focus: THREE.Vector3) {
  if (!sound.on) return;
  // close views hear the street; the wide map only a hint of it
  const close = walking || rig.shot ? 1 : rig.mode === "overview" ? 0.15 : THREE.MathUtils.clamp(0.25 + rig.iso.zoom * 0.25, 0.3, 0.9);
  // the district you are in (Shibuya, the bay, the park…) adds its own layer
  sound.setScene("street", 0, { x: focus.x, z: focus.z, near: close, night: theme === "night" });
  let people = 0;
  for (const s of director.snarks) {
    if (!s.root.visible || s.root.parent !== scene) continue;
    const d = s.root.position.distanceTo(focus);
    if (d < 20) people += 1 - d / 20;
  }
  let cars = 0;
  for (const v of director.traffic.vehicles) {
    const d = v.mover.group.position.distanceTo(focus);
    if (d < 32) cars += (1 - d / 32) * Math.min(1, v.v / 8 + 0.2);
  }
  const zebra = director.traffic.crossings[0];
  let crossing: { level: number; pan: number } | null = null;
  if (zebra?.busy()) {
    earTmp.set(zebra.x, 0, (CITY.road.z0 + CITY.road.z1) / 2);
    const d = earTmp.distanceTo(focus);
    if (d < 26) crossing = { level: close * (1 - d / 26), pan: earTmp.sub(focus).dot(camRight) / 12 };
  }
  sound.ambience(close * Math.min(1, people / 8), close * Math.min(1, cars / 2.5), crossing);
}

// One bad update (a module throwing on odd data) must not freeze the whole city: the frame is
// guarded, the error reported once per message, and the loop keeps going.
const frameErrors = new Set<string>();
function frame(stepDt?: number) {
  try {
    frameBody(stepDt);
  } catch (e) {
    const msg = String((e as Error)?.stack ?? e);
    if (frameErrors.size < 50 && !frameErrors.has(msg)) {
      frameErrors.add(msg);
      console.error("frame:", e);
    }
    if (!CAPTURE) requestAnimationFrame(() => frame());
    else throw e;
  }
}
function frameBody(stepDt?: number) {
  // the voxel workshop draws on its own: the city waits (one cheap frame a second keeps it alive)
  if (cityPaused && !stepDt) {
    timer.update();
    return void setTimeout(() => requestAnimationFrame(() => frame()), 500);
  }
  timer.update();
  const real = timer.getDelta();
  if (stepDt === undefined) quality.sample(real);
  // The street keeps real time even when frames are slow: the director (traffic, buses, walkers)
  // runs in steps of at most 50 ms, so a slow device no longer plays it in slow motion while the
  // buses' timers (dwell, departures) run on the wall clock. Everything else keeps the 50 ms cap
  // (a first-person step any longer could cross a thin wall).
  const sim = stepDt ?? Math.min(real, 0.25);
  const dt = stepDt ?? Math.min(real, 0.05);
  const t = stepDt !== undefined ? (capT += stepDt) : timer.getElapsed();
  const again = () => {
    if (!CAPTURE) requestAnimationFrame(() => frame());
  };

  // inside a place: its own scene and the walking camera; the city keeps living (but unseen)
  if (interiors.active) {
    interiors.update(dt, t);
    if (!interiors.active) return again();
    updateMemes(dt, interiors.walk.camera, interiors.active.scene);
    marks.update(dt);
    // near the way out (ground floor): say so
    const out = interiors.walk.exitAhead();
    // or at a lift's doors / a stairway's door: what it is
    prompt(out && out.facing && out.dist < 3.2 ? `<b>EXIT · 出口</b><span>▲ keep walking to go out</span>` : (interiors.circ?.hint() ?? null));
    if (CAPTURE && capShot) {
      interiors.walk.enabled = false;
      aimCapture(interiors.walk.camera, capShot);
    }
    runDirector(sim, t, interiors.walk.camera.quaternion, camRight.set(1, 0, 0).applyQuaternion(interiors.walk.camera.quaternion));
    // indoors the street goes quiet and the place's own soundscape plays (by floor)
    sound.setScene(interiors.active.key, interiors.floor, { name: interiors.active.floors[interiors.floor]?.name ?? "", night: theme === "night", ear: interiors.walk.camera });
    joystick.sync(interiors.walk);
    renderPass.scene = interiors.active.scene;
    renderPass.camera = finish.camera = interiors.walk.camera;
    tilt.set(0);
    // speech bubbles: only for speakers in sight, a steady size, kept apart and on screen
    bubbles.update(dt, interiors.walk.camera, window.innerWidth, window.innerHeight);
    // its shaders are still compiling: hold the last frame behind the entry fade, no stall
    if (!interiors.warming) {
      composer.render();
      drawBubbles(renderer, interiors.active.scene, interiors.walk.camera);
    }
    if (grabbers.length) {
      const g = grabbers;
      grabbers = [];
      for (const fn of g) fn(canvas);
    }
    hud.frame(() => null);
    again();
    return;
  }
  renderPass.scene = scene;
  if (!walking) prompt(null);
  const mapOn = walking && !interiors.active;
  if (mapOn !== minimapOn) minimap.show((minimapOn = mapOn));
  if (walking) {
    onFoot.update(dt);
    throughDoors(dt);
    if (interiors.active) return again();
  } else {
    rig.update(dt);
    sky.aim(rig.persp);
    // from a capsule or the gondola you see the whole city: draw farther while riding
    const far = sky.riding ? 1100 : 400;
    if (rig.persp.far !== far) (rig.persp.far = far), rig.persp.updateProjectionMatrix();
  }
  const capturing = CAPTURE && capShot;
  if (capturing) {
    aimCapture(capCam, capShot!);
    // lights and shadows follow the point the shot looks at
    rig.controls.target.set(capShot!.look[0], 1, capShot!.look[2]);
  }
  const cam = capturing ? capCam : walking ? onFoot.camera : rig.camera;
  // the fog is measured from the camera: the iso camera stands far back, so push it out by as much
  if (scene.fog instanceof THREE.Fog) {
    const iso = cam === rig.iso;
    // up high (the wheel, the blimp) the ground is far away: the fog recedes with the height
    const up = iso ? 0 : Math.max(0, cam.position.y - 15) * 3.5;
    scene.fog.near = (theme === "day" ? 170 : 150) + (iso ? 260 : 0) + up;
    scene.fog.far = (theme === "day" ? 360 : 330) + (iso ? 420 : 0) + up * 1.6;
  }
  renderPass.camera = finish.camera = cam;
  updateMemes(dt, cam, scene);
  cam.getWorldQuaternion(camQuat);
  camRight.set(1, 0, 0).applyQuaternion(camQuat);

  // lights and shadows follow what the camera looks at
  // on foot, lights and shadows follow a point a few steps ahead
  const focus = walking ? footFocus.set(-Math.sin(onFoot.heading), 0, -Math.cos(onFoot.heading)).multiplyScalar(7).add(onFoot.camera.position).setY(0) : rig.focus;
  lampLights.update(t, focus);
  // the whole-city map: the lamps' pools are a few pixels there, the lights cost a third of the frame
  lampLights.setOn(!(cam === rig.iso && pxPerMetre(renderer, rig.iso) < 6));
  const wide = rig.mode === "overview";
  const ext = wide ? 90 : 30;
  // from that far out shadows are invisible; skip them and keep the frame rate
  // Switching castShadow (or the shadow map type) changes every material's shader: each flip
  // compiled a new variant of all of them. The moon always casts; when shadows aren't wanted its
  // map just stops being rendered and the shadow is faded to nothing (a uniform).
  const shadows = !wide && quality.tier.shadow > 0;
  moon.shadow.autoUpdate = shadows;
  // (a map must exist all the same: after a resize to a new tier it is re-made once, unseen)
  if (!moon.shadow.map) moon.shadow.needsUpdate = true;
  // off: every fragment falls outside the map, so the shader skips the shadow lookups altogether
  if (!shadows) moon.shadow.matrix.makeScale(0, 0, 0).setPosition(-2, -2, -2);
  moon.shadow.intensity = shadows ? moonShadow : 0;
  Object.assign(moon.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 160 });
  moon.shadow.camera.updateProjectionMatrix();
  moon.position.copy(focus).add(MOON_OFFSET);
  moon.target.position.copy(focus);

  // miniature look: strong tilt-shift on cinematic shots, a hint of it in iso
  if (capturing) tilt.set(capShot!.tilt ?? 0, 0.5, 0.22);
  else if (walking) tilt.set(0);
  else if (rig.shot === "inside" || rig.shot === "shop") tilt.set(0.3, 0.5, 0.3);
  else if (rig.shot) tilt.set(1, 0.48, 0.14);
  else tilt.set(wide ? 0 : theme === "day" ? 0.32 : 0.55, 0.5, theme === "day" ? 0.3 : 0.26);

  if (!capturing) wallsDown(dt, walking);
  runDirector(sim, t, camQuat, camRight);
  visitors.update(dt, t, camQuat, camRight);
  critters.update(dt, cam);
  mempoolLive.update(sim, focus, wide);
  metro.update(sim);
  tram.update(sim);
  cityTraffic.update(sim);
  shibuya.update(sim, t, focus);
  overlays.update(dt);
  stadium.setMempool(mempoolCount);
  sky.setHeight(lastSummary?.height ?? null);
  sky.update(t, sim, camQuat, camRight);
  if (!walking) sky.aim(rig.persp);
  goldenGate.update(sim);
  walletCrowns.update(dt, t);
  forest.update(sim, t, cam, focus, theme === "night", walking, wide);
  cemetery.update(sim, t, cam, focus, theme === "night", walking, wide);
  // the ride is over (or the camera went elsewhere): back to the map
  if (flyerRide && (!sky.riding || rig.mode !== "follow")) {
    flyerRide = false;
    hud.setRide(null);
    // a full lap of the wheel: step out onto its deck; otherwise back to the map view you left
    const off = sky.leave();
    if (off.walk) {
      rig.setMode("live");
      setWalking(true);
      onFoot.place(off.walk.pos, off.walk.yaw, CURB);
    } else if (off.back) rig.district(off.back.at, off.back.zoom);
    else if (rig.mode === "follow") rig.setMode("live");
  }
  chatter.setLive(lastSummary?.height ?? null, mempoolCount);
  // conversations only where you can read them: on foot, in a close shot, or zoomed in on the map
  const closeUp = walking || !!rig.shot || (rig.iso.top - rig.iso.bottom) / rig.iso.zoom < 70;
  if (!interiors.active && closeUp) chatter.update(sim, walking ? onFoot.camera.position : rig.focus);
  stadium.update(sim, !interiors.active);
  metro2.update(sim);
  horns.update(sim);
  prison.update(sim);
  alive.update(sim, t, focus, cam, wide, walking);
  if ((earT += sim) > 0.2) {
    earT = 0;
    listen(focus);
  }
  tv?.update(dt);
  joystick.sync(walking ? onFoot : null);
  const lb = director.lastBlockTime;
  if (lb) decor.setLive({ since: (Date.now() - lb) / 1000 });
  nu7.update(dt);
  decor.update(t, dt, focus, capturing ? capCam.position : walking ? onFoot.camera.position : rig.shot ? rig.persp.position : rig.iso.position);
  // close-ups keep full detail further out; the whole-city view is mostly simplified
  if (wide) city.lod(focus, 0, 50);
  else city.lod(focus, rig.shot ? 60 : 40, rig.shot ? 140 : 95);
  prison.lod(focus, wide ? 50 : rig.shot ? 140 : 95);
  city.update(t, dt);
  gameWorld?.update(dt);
  whale?.update(dt);
  mayor?.treasure.update(t);
  eggs?.update(dt);
  jobs?.update(dt);
  works.update(dt);
  nu7Quarter.update(dt);
  if (walking) mayor?.treasure.near(onFoot.camera.position);
  agents?.update(dt, focus);
  marks.update(dt);
  if (walking && !interiors.active) talkUpdate(dt);
  else if (talkPrompt.classList.contains("on")) talkPrompt.classList.remove("on");
  npcs.update(dt);
  if (minimapOn) minimap.update(dt, onFoot.camera.position.x, onFoot.camera.position.z, onFoot.heading, mapBlips());
  hall?.update(t, dt);
  press?.update(t, dt);
  lightBudget.update();
  bubbles.update(dt, cam, window.innerWidth, window.innerHeight);
  // an earthquake shakes whichever camera draws this frame
  const quake = disasters?.shake(dt) ?? null;
  if (quake) cam.position.add(quake);
  composer.render();
  drawBubbles(renderer, scene, cam);
  if (quake) cam.position.sub(quake);
  // a photo is read from the canvas right after the frame is drawn (the buffer isn't kept)
  if (grabbers.length) {
    const g = grabbers;
    grabbers = [];
    for (const fn of g) fn(canvas);
  }
  hud.frame(project);
  again();
}
frame();
// Shaders of the whole city (every district, the night-only lights, the rides' cabins) compile
// while the boot screen is up, so the first flight to a district no longer stalls on them; then
// the most visited places are built ahead (only behind the boot screen or in a hidden tab: a
// build is a 0.1–0.3 s task that would show as a hitch in the live city).
idle(() => {
  const t0 = performance.now();
  warm(renderer, scene, rig.camera).then(() => console.info(`shaders warmed in ${Math.round(performance.now() - t0)} ms (${renderer.info.programs?.length ?? 0} programs)`));
  // and the variant without the lamps' lights (the whole-city map)
  lampLights.warmOff(() => warm(renderer, scene, rig.camera));
  const ahead: Interior["key"][] = quality.level >= 2 ? [] : ["tower", "mempool", "factory"];
  const unseen = () => document.hidden || bootUp();
  const next = () => {
    if (!ahead.length) return;
    if (interiors.active || !unseen()) return void document.addEventListener("visibilitychange", () => idle(next), { once: true });
    const i = interiors.prebuild(ahead.shift()!);
    if (i) warm(renderer, i.scene, interiors.walk.camera);
    setTimeout(next, 30);
  };
  setTimeout(next, 30);
  // the day textures of the roads (painted the first time the day comes: a 0.25 s stall), one per
  // idle moment, uploaded too
  const dayMaps: THREE.Material[] = [];
  city.group.traverse((o) => {
    const ms = (o as THREE.Mesh).material;
    for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) if (m.userData.dayMap && !m.userData.dayTex && !dayMaps.includes(m)) dayMaps.push(m);
  });
  const paint = () => {
    const m = dayMaps.shift();
    if (!m) return;
    if (!(m.userData.dayTex instanceof THREE.Texture)) {
      m.userData.dayTex = m.userData.dayMap();
      renderer.initTexture(m.userData.dayTex);
    }
    idle(paint, 4000);
  };
  idle(paint, 4000);
}, 100);
syncCamera();
