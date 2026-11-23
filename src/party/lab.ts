/**
 * The party's bench, without the city: /partylab.html?g=<game> plays one mini-game (`?auto`: four
 * AIs, for scripted checks; `?seed=`), `?board` the whole board (`&turns=`, `&fast=`, `&skipmini`,
 * `&dice=`, `&start=`, `&coins=`, `&nointro`, `&map=<key>` the board; `&shot` a still for the hub card), `?hub` the hub, `&track=`
 * a game's version (a kart track). window.lab tells
 * how it went. Online play without a server (net/bench.ts): `&net=loop&humans=2` (two players at one
 * keyboard through a simulated network), `?nettest=coins` (the lockstep test suite in this page).
 */
import "./party.css";
import { Stage, playMini } from "./host";
import { makePlayer, rng, type MiniDef } from "./kit";
import { DUELS, GAMES, ZK_GAMES } from "./games";
import { SAMPLE } from "./games/sample3d";
import { Board } from "./board";

const q = new URLSearchParams(location.search);
const seed = Number(q.get("seed") ?? 7);
const auto = q.has("auto");
const root = document.getElementById("lab")!;
root.classList.add("pt-root");
const stage = new Stage(root);
const ids = [4071, 1337, 77, 9001];
// (`&skill=0.9`: every AI that good)
const sk = q.get("skill");
const players = ids.map((id, i) => makePlayer(i, id, i === 0 && !auto, sk ? Number(sk) : [0.5, 0.35, 0.6, 0.85][i]));
const lab = ((window as unknown as { lab: Record<string, unknown> }).lab = { results: [] as unknown[], done: false });
const which = q.get("g");
(async () => {
  let list: MiniDef[] = which ? [...GAMES, ...DUELS, SAMPLE].filter((g) => g.key === which) : GAMES;
  // (a game not in the rotation yet: its own file, games/<key>.ts, its default export)
  if (which && !list.length) list = [((await import(`./games/${which}.ts`)) as { default: MiniDef }).default];
  if (q.has("catalog")) {
    // (the light catalog the city's GAME HOUSE draws from, src/party/catalog.ts, against the games)
    const { GAME_CARDS } = await import("./catalog");
    const bad = ZK_GAMES.filter((g) => {
      const c = GAME_CARDS.find((x) => x.key === g.key);
      return !c || c.title !== g.title || c.tag !== g.tag || c.color !== g.color;
    }).map((g) => g.key);
    lab.results.push({ catalog: bad.length ? `drifted: ${bad.join(", ")}` : "ok", n: ZK_GAMES.length });
    lab.done = true;
    return;
  }
  if (q.has("arcade")) {
    // (?arcade=<key>: one of the flat games, arcade/index.ts, in its cabinet)
    stage.dispose();
    const { arcadeOf } = await import("./arcade");
    const { Cabinet } = await import("./arcade/runner");
    const def = arcadeOf(q.get("arcade") ?? "");
    if (def) void new Cabinet(root, def, () => (lab.done = true)).start();
    return;
  }
  if (q.has("snarks")) {
    stage.dispose();
    const { snarkLab } = await import("./snarklab");
    await snarkLab(root, q);
    return;
  }
  if (q.has("nettest")) {
    const { pageTest } = await import("./net/bench");
    await pageTest(q);
    lab.done = true;
    return;
  }
  if (q.has("hub")) {
    root.classList.remove("pt-root");
    stage.dispose();
    const { openParty } = await import("./index");
    openParty({ shown: () => {} });
    return;
  }
  if (q.has("board")) {
    // (&turns=N; &fast=k speeds the clock; &skipmini plays no mini-games; &dice=3,5,… the human's
    // rolls; &start=N begins at turn N; &coins=N; &nointro)
    const num = (k: string) => (q.get(k) !== null ? Number(q.get(k)) : undefined);
    // (&map=<key>: which board, GENESIS HARBOR when left out)
    const board = new Board(stage, players, rng(seed), num("turns") ?? num("rounds") ?? 2, {}, {
      map: q.get("map") ?? undefined,
      lab: {
        speed: num("fast"),
        skipMini: q.has("skipmini"),
        dice: q.get("dice")?.split(",").map(Number),
        startTurn: num("start"),
        coins: num("coins"),
        noIntro: q.has("nointro"),
        // (&at=N: everyone starts on space N)
        at: num("at"),
      },
    });
    (window as unknown as { boardLab: unknown }).boardLab = board;
    // (&shot: a still of the board, the hub card's picture; &cam=x,y,z,ax,ay,az to aim it)
    if (q.has("shot")) {
      board.still();
      const c = q.get("cam")?.split(",").map(Number);
      if (c?.length === 6) board.aim(c);
      lab.done = true;
      return;
    }
    const r = await board.play();
    lab.results.push({ board: r });
    lab.done = true;
    return;
  }
  if (q.get("net") === "loop" && list.length === 1) {
    const { loopDemo } = await import("./net/bench");
    const variant = q.get("track") ?? undefined;
    const r = await loopDemo(stage, list[0], players, q, variant);
    lab.results.push({ game: list[0].key, order: r, net: "loop" });
    lab.done = true;
    return;
  }
  for (const def of list) {
    // (`&track=<key>`: a game's version, a kart track; none: the seed draws one)
    const variant = q.get("track") ?? undefined;
    // (a duel: the first two seats)
    const who = def.seats === 2 ? players.slice(0, 2) : players;
    const r = await playMini(stage, def, who, rng(seed), { note: "lab", prizes: ["+10", "+5", "+2", ""], variant });
    lab.results.push({ game: def.key, order: r, ...(variant ? { track: variant } : {}) });
  }
  lab.done = true;
})();
