/**
 * NU7 QUARTER, the second board, as data (its look: art/astana.ts and the shared kit, decor.ts).
 * (Its key, "astana", and its paths' ids stay: saves and the art module go by them.)
 */
import type { MapDef } from "../maps";

/**
 * NU7 QUARTER: ZStreet's NU7 Quarter on a snowy winter evening, under the northern lights. The
 * frozen canal winds across the board between the LEFT BANK (the start, the ZK MALL's tent, the
 * NU7 BOULEVARD with the NU7 TOWER in the middle, CITY HALL at its east end) and the RIGHT BANK
 * (the OPERA HOUSE, the GREAT PYRAMID). Every lap passes the mall (two shops under the tent).
 *
 * - From the mall, the boulevard cuts straight through to CITY HALL (the short way), or the WEST
 *   BRIDGE crosses north to the right bank (the long way round, back over the EAST BRIDGE).
 * - On the right bank, past the OPERA HOUSE, you may jump down onto the frozen canal's ICE RUN: a
 *   one-way fast lane where nobody stops (you slide on to the far bank). Every slider cracks it a
 *   little more; once cracked, it may give way under you (a cold bath, 5 coins lost, hauled back
 *   out). A broken run refreezes two turns later, or in the next BLIZZARD.
 * - The NU7 TOWER LIFT (two spaces at its foot) rides you up to the tower's golden crown, and you
 *   glide down to any of the four drop zones.
 * - A BLIZZARD (three spaces at the board's edges) blows the three rivals back two spaces each and
 *   refreezes the ice.
 */
export const ASTANA: MapDef = {
  key: "astana",
  title: "NU7 QUARTER",
  titleZh: "NU7 街区",
  tag: "The NU7 Quarter on a snowy night · tower lift, ice run, blizzard",
  tagZh: "雪夜 NU7 街区 · 观景电梯、冰道、暴风雪",
  ambience: "wind",
  sky: ["#0b1640", "#3d5a9c"],
  sun: "#2e4a8e",
  sea: "#dfe8f6",
  start: "start",
  paths: [
    { id: "start", pts: [[12, 24], [0, 25.5], [-12, 25], [-18, 22.5]], kinds: "bbrblbbvrb", next: ["sw"], q: [6] },
    { id: "sw", pts: [[-21.5, 19.5], [-24.5, 15.5], [-26.5, 11]], kinds: "bzbr", next: ["khan"], name: ["PLAINS ROAD", "平原路"] },
    { id: "khan", pts: [[-28, 7.5], [-29, 3], [-29, -1.5], [-28, -6], [-25.5, -9.5]], kinds: "bsrbsb", next: ["wbridge"], q: [3], name: ["ZK MALL", "ZK 商场"] },
    { id: "wbridge", pts: [[-27, -13], [-28, -17.5], [-28.5, -22], [-28.5, -26.5]], kinds: "bbrbb", next: ["rbw"], q: [1], name: ["WEST BRIDGE", "西桥"] },
    { id: "rbw", pts: [[-27, -30.5], [-22, -32.5], [-16, -32], [-11.5, -30]], kinds: "brbxlb", next: [{ to: "ice", gate: "ice" }, "rbank"], q: [2], name: ["RIGHT BANK", "右岸"] },
    { id: "ice", pts: [[-7, -25], [4, -21.5], [15, -18.5], [26, -19.5], [33, -22]], y: -1.6, kinds: "bbbbb", next: ["akorda"], ice: true, name: ["ICE RUN", "冰道"] },
    { id: "rbank", pts: [[-7.5, -33], [-1, -35], [6, -34], [12, -31.5], [18, -30], [25, -30.5], [31, -32], [35.5, -31]], kinds: "bbrlbsbvbzbrxb", next: ["ebridge"], q: [1, 6, 10], name: ["GREAT PYRAMID", "大金字塔"] },
    { id: "ebridge", pts: [[38.5, -28], [39.5, -24], [39.5, -19.5], [38.5, -15.5]], kinds: "bbrbb", next: ["akorda"], q: [3] },
    { id: "akorda", pts: [[35, -12.5], [35.5, -7.5], [34, -1.5]], kinds: "blbb", next: ["se", "nurzhol"], q: [2], name: ["CITY HALL", "市政厅"] },
    { id: "se", pts: [[31.5, 2.5], [30.5, 7], [28, 11.5], [24.5, 15.5], [20, 19.5], [15.5, 22]], kinds: "bbxbzrlb", next: ["start"], q: [3], name: ["SOUTH-EAST", "东南"] },
    {
      id: "nurzhol",
      pts: [[29.5, -4], [21, -5.5], [14, -5.5], [8, -5], [6, -0.5], [3, 2.4], [0, 3.2], [-3, 2.4], [-6, -0.5], [-8, -5], [-14, -5.5], [-24, -6.5]],
      kinds: "bbrbxbebbrebrbvbb",
      next: [{ to: "khan", at: 4 }],
      q: [3, 8, 13],
      name: ["NU7 BOULEVARD", "NU7 大道"],
    },
  ],
  islands: [
    // the left bank: the start, the mall, the boulevard, City Hall (the canal's south bank up top)
    { pts: [[-44, -9.9], [-30, -13], [-22, -15.7], [-15, -18], [0, -17], [13, -13], [26, -14], [36, -18], [52, -21.4], [52, 30], [48, 33.5], [-40, 33.5], [-44, 30]], top: "#e3ebf7", depth: 3 },
    // the right bank: the Opera House, the Great Pyramid, the plains road north
    { pts: [[-44, -20.9], [-30, -24], [-22, -26.7], [-15, -29], [0, -28], [13, -24], [26, -25], [36, -29], [52, -32.4], [52, -58], [48, -61], [-40, -61], [-44, -58]], top: "#e3ebf7", depth: 3 },
  ],
  landmarks: [
    { kind: "bayterek", x: 0, z: -4, keep: 6.5, label: "NU7 TOWER" },
    { kind: "khanshatyr", x: -37.5, z: -1.5, keep: 8, label: "ZK MALL" },
    { kind: "akorda", x: 46, z: -3, rot: -Math.PI / 2, keep: 6, label: "CITY HALL" },
    { kind: "peace", x: 21, z: -44, keep: 9, label: "GREAT PYRAMID" },
    { kind: "hazret", x: -18, z: -45, keep: 9, label: "OPERA HOUSE" },
    { kind: "nuralem", x: 2, z: -49, keep: 6, label: "zkSNARK MUSEUM" },
    { kind: "golden", x: 46.5, z: -15.5, keep: 4.5, label: "GOLDEN TOWERS" },
    { kind: "eli", x: -27, z: -53, keep: 4.5, label: "zkSNARK OF LIBERTY" },
    { kind: "esil", x: 0, z: 0 },
    { kind: "bridges", x: 0, z: 0 },
    { kind: "startgate", x: 14.6, z: 23.2, rot: -1.35, label: "START" },
  ],
  stage: { x: 0, z: 11 },
  lift: {
    x: 0,
    z: -4,
    top: 24,
    drops: [
      { path: "khan", at: 3, n: ["ZK MALL", "ZK 商场"] },
      { path: "rbw", at: 2, n: ["OPERA HOUSE", "歌剧院"] },
      { path: "rbank", at: 6, n: ["GREAT PYRAMID", "大金字塔"] },
      { path: "akorda", at: 2, n: ["CITY HALL", "市政厅"] },
    ],
  },
  intro: [
    ["Welcome to the NU7 QUARTER, ZStreet on a winter's night! I'm ZEE, your host for tonight.", "欢迎来到 NU7 街区，冬夜的 ZStreet！我是 ZEE，今晚的主持人。"],
    ["Roll, run the paths and buy Z-BLOCKS. Most Z-Blocks wins the party!", "掷骰、跑图、购买 Z 方块。Z 方块最多者赢得派对！"],
    ["Ride the NU7 TOWER LIFT, slide the frozen canal… but mind the cracks, and the BLIZZARD!", "搭乘 NU7 塔观景电梯，滑过冰封的运河……小心冰裂，还有暴风雪！"],
  ],
  shops: {
    khan: ["ZK MALL SHOPS", "ZK 商场商店"],
    rbank: ["RIGHT BANK BAZAAR", "右岸集市"],
  },
  art: {
    dome: ["#03061c", "#0a1640", "#1a3270", "#36548f"],
    stars: 1,
    fog: ["#2c4378", 95, 380],
    hemi: ["#a6bff2", "#2f3c6a", 1.05],
    key: ["#b4c8ff", 1.15, [40, 70, 50]],
    rim: ["#5affc0", 0.95],
    ground: "#e3ebf7",
    patches: ["#d8e2f2", "#eef3fb", "#d2ddef", "#f4f7fd", "#dde6f4", "#e8eef8"],
    blades: ["#c4d1e8", "#f6f9ff", "#bccbe4"],
    beds: ["#c9d3e4", "#d8e0ee"],
    edge: "#b9c7de",
    pavers: ["#d9dde6", "#cfd4de", "#e3e6ee", "#c7ccd8"],
    mortar: "#a9b0c0",
    curbs: ["#bfc6d4", "#aab2c3"],
    plinth: ["#eef1f7", "#b7bfcf"],
    arrow: "#ffe9b0",
    lip: "#f4f8ff",
    earth: ["#8a8f9e", "#9ca2b2"],
    strata: ["#9aa1b3", "#8d94a7", "#80879b", "#747b90", "#686f86", "#5d647b"],
    crystals: ["#9fe8ff", "#c8b8ff"],
    water: ["#9ccbe8", "#d4ecfa", "#ffffff"],
    greens: ["#2f6a4a", "#2a5e44", "#3a7a56", "#24533e"],
    pines: 1,
    snow: true,
    lamp: "#ffd59a",
    night: true,
    puffs: ["#dfe8f6", "#cfdcf0", "#e8eefa", "#d5e0f2"],
    clouds: ["#121a3c", "#18224a", "#0f1736", "#1c2754", "#202c5e"],
    city: "night",
    terraces: 0,
  },
  tour: [
    { n: ["NU7 QUARTER", "NU7 街区"], eye: [64, 50, 64], at: [4, 0, -10] },
    { n: ["NU7 TOWER", "NU7 塔"], eye: [11, 14, 20], at: [0, 15, -4] },
    { n: ["ZK MALL", "ZK 商场"], eye: [-20, 9, 12], at: [-36, 6, -2] },
    { n: ["OPERA HOUSE", "歌剧院"], eye: [-8, 13, -22], at: [-18, 6, -44] },
    { n: ["THE FROZEN CANAL", "冰封的运河"], eye: [-14, 9, -12], at: [10, -1, -22] },
    { n: ["GREAT PYRAMID", "大金字塔"], eye: [30, 12, -22], at: [21, 7, -44] },
    { n: ["CITY HALL", "市政厅"], eye: [26, 9, 4], at: [46, 6, -3] },
    { n: ["NU7 BOULEVARD", "NU7 大道"], eye: [-6, 8, 18], at: [6, 2, 4] },
  ],
};
