/**
 * MARINA NIGHTS, ZStreet's Marina Bay board, as data (its look: art/singapore.ts and the shared kit).
 */
import type { MapDef } from "../maps";

/**
 * MARINA NIGHTS: a humid neon night round ZStreet's Marina Bay. The bay in the middle, the city on
 * three banks round it: SATAY STREET's hawker stalls and the start in the south, the SKY WHEEL in
 * the east, the HELIX BRIDGE over the bay's east arm, GARDENS BY THE BAY's supertrees and their
 * SKYWAY (a toll path high among the trees) in the north-east, the MARINA ZEC HOTEL's three towers
 * with their sky park on the north shore, the BAY THEATRE's spiky twin domes in the north-west, the river and the LION FOUNTAIN in
 * the west, the SHOPHOUSE STREETS in the south-west.
 *
 * Its gimmicks: the SKY WHEEL (land on its gate, or pass it and choose to ride: it sets you down at
 * the stop its searchlight points at this turn, a different one every turn); the MONSOON (a storm
 * space: the bay floods the low promenade for two turns; whoever stands or lands on a flooded
 * space is soaked, 5 coins to the monsoon's caller). The SKYWAY is a toll shortcut (7 coins) high
 * among the Supertrees, past the gardens' long loop.
 */
export const SINGAPORE: MapDef = {
  key: "singapore",
  title: "MARINA NIGHTS",
  titleZh: "滨海之夜",
  tag: "A neon night round the bay · sky wheel, monsoon, skyway",
  tagZh: "海湾的霓虹之夜 · 摩天轮、季风暴雨、空中步道",
  ambience: "city-night",
  sky: ["#070826", "#b2457e"],
  sun: "#9fb2ff",
  sea: "#231d58",
  start: "start",
  paths: [
    // SATAY STREET: the start, east along the south bank (the hawker centre on the shore north of it)
    { id: "start", pts: [[-12.6, 21.8], [-3, 23.2], [7, 22.6], [14.6, 19.2]], kinds: "bbrbvbblbb", next: ["market", "quay"], q: [3, 8] },
    // the quay: low along the bay's south-east shore (floods)
    { id: "quay", pts: [[16.4, 16.6], [20.8, 10.8], [25.4, 4.2]], kinds: "brbblb", next: ["helix"], q: [2], low: true, name: ["QUAY", "码头"] },
    // the NIGHT MARKET: the long way round the south-east, between rows of stalls
    { id: "market", pts: [[17.4, 21.2], [23.5, 23], [29.5, 21], [32.6, 15.6], [31.6, 9.6], [29.2, 5.4]], kinds: "bsblbvbrxb", next: ["helix"], q: [2], name: ["NIGHT MARKET", "夜市"] },
    // the HELIX BRIDGE over the bay's east arm
    { id: "helix", pts: [[28, 2.2], [28, -12.8]], kinds: "bbxbrb", next: ["grove", { to: "skyway", toll: 7 }], q: [1, 3], name: ["HELIX", "螺旋桥"] },
    // the gardens: past the SKY WHEEL's gate, round GARDENS BY THE BAY's supertrees the long way
    { id: "grove", pts: [[30.8, -15], [33.6, -21], [33.6, -28], [31, -35], [25, -39], [19, -38], [16, -32.5], [15.4, -24]], kinds: "bbloobrbtbvblsb", next: ["bayfront"], q: [1], name: ["GARDENS", "花园"] },
    // the SKYWAY: high along the Supertrees (a toll)
    { id: "skyway", pts: [[25.2, -15.4], [21.4, -17.8], [17.6, -19.6]], kinds: "blbb", next: ["bayfront"], y: 5, name: ["SKYWAY", "空中步道"] },
    // the bayfront: low along the north shore, under the MARINA ZEC HOTEL (floods)
    { id: "bayfront", pts: [[14.6, -20.8], [6, -19.8], [-3, -19.4], [-11, -17.4]], kinds: "bbrblbrbb", next: ["theatre"], q: [1, 5, 8], low: true },
    // past the BAY THEATRE's domes, over the river
    { id: "theatre", pts: [[-13.6, -15.8], [-19, -14], [-23, -10.6], [-25.2, -5], [-25.2, 0.6], [-23.4, 4.6]], kinds: "brbsxbbtb", next: ["lion", "shops"], q: [2, 5, 8] },
    // the LION FOUNTAIN: low along the bay's west shore (floods)
    { id: "lion", pts: [[-20.4, 5.8], [-16, 7.8], [-12.6, 11.2], [-12, 18.8]], kinds: "blbrbbb", next: ["start"], q: [2, 5], low: true, name: ["LION", "鱼尾狮"] },
    // the SHOPHOUSE STREETS: the long way round the south-west
    { id: "shops", pts: [[-26, 6.4], [-30, 10], [-31, 16], [-27.6, 21], [-21, 22.6], [-15.4, 21.4]], kinds: "brbvbtbsbb", next: ["start"], q: [2, 6], name: ["SHOPHOUSES", "店屋"] },
  ],
  islands: [
    // the south bank: SATAY STREET, the SKY WHEEL, the shophouses
    { pts: [[-43, 1], [-20, 1], [-17.5, 2.5], [-14, 5], [-10.5, 9], [-8.4, 11.4], [-4, 10.8], [4, 11], [10, 10.6], [14.2, 9.4], [18.4, 6.4], [22.4, 2.8], [26.4, 0.2], [34, -1], [44, -1], [46.5, 8], [45, 20], [38, 28.5], [24, 31], [4, 31.5], [-16, 31], [-32, 29], [-40.5, 22], [-43.5, 10]], top: "#3d5a4a", depth: 14 },
    // the north bank: the MARINA ZEC HOTEL, GARDENS BY THE BAY, the BAY THEATRE
    { pts: [[-43, -6.5], [-20, -6.5], [-16.5, -10], [-12, -14], [-4, -16], [6, -16.5], [14, -16], [20.5, -14], [25, -11], [34, -10.5], [44, -10.5], [49, -20], [49, -32], [43, -42], [32, -49.5], [16, -50.5], [0, -49], [-18, -46.5], [-32, -38.5], [-41.5, -24]], top: "#3d5a4a", depth: 15 },
  ],
  lagoon: { pts: [[-46, -8.5], [-20, -9], [-14, -17.5], [0, -19], [16, -18.5], [24, -13.5], [34, -12.5], [48, -12.5], [48, 1], [34, 1.5], [26, 3], [21, 7.5], [16, 11.5], [4, 12.5], [-6, 12.5], [-12, 11], [-16, 6], [-20, 3], [-46, 3]], y: -0.75 },
  ride: {
    x: 41,
    z: -27,
    rot: -0.85,
    stops: [
      { path: "bayfront", at: 3, n: ["MARINA ZEC HOTEL", "滨海 ZEC 酒店"] },
      { path: "lion", at: 1, n: ["LION FOUNTAIN", "鱼尾狮"] },
      { path: "start", at: 5, n: ["SATAY STREET", "沙爹街"] },
      { path: "market", at: 4, n: ["NIGHT MARKET", "夜市"] },
    ],
  },
  landmarks: [
    // the big pieces (art/singapore.ts builds them)
    { kind: "sg-towers", x: 4, z: -31.5, keep: 9, label: "MARINA ZEC HOTEL" },
    { kind: "sg-lotus", x: 20.6, z: -13.4, keep: 2.6 },
    { kind: "sg-domes", x: -25, z: -19, keep: 3 },
    { kind: "sg-lion", x: -17.4, z: 2.4, rot: Math.PI / 2, keep: 2.2, label: "LION FOUNTAIN" },
    { kind: "sg-wheel", x: 41, z: -27, rot: -0.85, keep: 6, label: "SKY WHEEL" },
    { kind: "sg-grove", x: 25, z: -27 },
    { kind: "sg-skyway", x: 21.4, z: -17.8 },
    { kind: "sg-helix", x: 28, z: -5 },
    { kind: "sg-hawker", x: 2.6, z: 15.8, keep: 4.2, label: "HAWKER CENTRE" },
    { kind: "sg-satay", x: 0, z: 27 },
    { kind: "sg-market", x: 24, z: 15 },
    { kind: "sg-shophouses", x: -30, z: 14 },
    { kind: "sg-cbd", x: -38, z: -12 },
    { kind: "sg-bridge", x: -25.2, z: -2.6 },
    { kind: "sg-promenade", x: 0, z: 0 },
    { kind: "sg-bay", x: 4, z: -3 },
    { kind: "startgate", x: -18.2, z: 22.2, rot: 1.78, label: "START" },
    { kind: "trees", x: 0, z: 0, s: 90 },
    { kind: "garden", x: 0, z: 0, s: 1 },
    // the crowd
    { kind: "crowd", x: -6.2, z: 19.2, rot: Math.PI, s: 3 },
    { kind: "crowd", x: 9.6, z: 18.6, rot: Math.PI, s: 2 },
    { kind: "crowd", x: -8.6, z: 26, rot: Math.PI, s: 2 },
    { kind: "crowd", x: 6.6, z: 26.4, rot: Math.PI, s: 3 },
    { kind: "crowd", x: 21.6, z: 17.6, rot: 0.6, s: 2 },
    { kind: "crowd", x: 27.6, z: 26, rot: Math.PI, s: 2 },
    { kind: "crowd", x: 26.8, z: 13.2, rot: -2.2, s: 3 },
    { kind: "crowd", x: 35.8, z: 18.6, rot: -1.2, s: 2 },
    { kind: "crowd", x: 37.4, z: -21.4, rot: -2.4, s: 3 },
    { kind: "crowd", x: 29.6, z: -24.2, rot: 1.4, s: 2 },
    { kind: "crowd", x: 21.4, z: -32.6, rot: 0.4, s: 2 },
    { kind: "crowd", x: 9.4, z: -23.4, rot: 0, s: 3 },
    { kind: "crowd", x: -1.6, z: -23.6, rot: 0, s: 3 },
    { kind: "crowd", x: -18.6, z: -18.8, rot: 0.4, s: 2 },
    { kind: "crowd", x: -14.6, z: 4.2, rot: 2.4, s: 3 },
    { kind: "crowd", x: -20.6, z: 9.6, rot: 1.8, s: 2 },
    { kind: "crowd", x: -24.6, z: 18.2, rot: -2.2, s: 2 },
    { kind: "crowd", x: -33.8, z: 21.2, rot: 1.2, s: 2 },
    { kind: "crowd", x: -27.4, z: -1.6, rot: 1.6, s: 2 },
  ],
  stage: { x: -2.2, z: 26.6 },
  tour: [
    { n: ["MARINA NIGHTS", "滨海之夜"], eye: [66, 52, 66], at: [2, 0, -8] },
    { n: ["SATAY STREET", "沙爹街"], eye: [-4, 9, 36], at: [1, 3, 17] },
    { n: ["THE NIGHT MARKET", "夜市"], eye: [14, 11, 34], at: [26, 1, 15] },
    { n: ["THE HELIX BRIDGE", "螺旋桥"], eye: [40, 9, 8], at: [28, 2, -6] },
    { n: ["THE SKY WHEEL", "摩天轮"], eye: [24, 12, -4], at: [41, 9, -27] },
    { n: ["GARDENS BY THE BAY", "滨海湾花园"], eye: [12, 14, -8], at: [25, 7, -26] },
    { n: ["MARINA ZEC HOTEL", "滨海 ZEC 酒店"], eye: [-2, 14, -2], at: [4, 12, -31] },
    { n: ["THE BAY THEATRE", "海湾剧院"], eye: [-10, 9, -4], at: [-25, 3, -18] },
    { n: ["THE LION FOUNTAIN", "鱼尾狮"], eye: [-4, 7, 10], at: [-17, 3, 2] },
    { n: ["THE SHOPHOUSES", "店屋街"], eye: [-14, 10, 30], at: [-28, 3, 14] },
  ],
  intro: [
    ["Welcome to MARINA NIGHTS, ZStreet's bay that never sleeps! I'm ZEE, your host for tonight.", "欢迎来到滨海之夜，ZStreet 不夜的海湾！我是 ZEE，今晚的主持人。"],
    ["Roll round the bay and buy the Z-BLOCKS. Most Z-Blocks wins the party!", "绕着海湾掷骰，买下 Z 方块。Z 方块最多者赢得派对！"],
    ["Ride the SKY WHEEL, cross the SKYWAY… and when the MONSOON comes, keep off the low promenade!", "搭乘摩天轮，走过空中步道……季风暴雨来时，别待在低处的海滨步道！"],
  ],
  shops: { market: ["NIGHT MARKET", "夜市"], grove: ["GARDEN SHOP", "花园商店"], theatre: ["THEATRE SHOP", "剧院商店"], shops: ["KOPITIAM", "咖啡店"] },
  floors: [
    // the promenades along the bay: pale granite, a gold edge
    { kind: "quay", pts: [[-12.6, 9.4], [-9.2, 13.2], [-4, 13.4], [4, 13.8], [10, 13], [15, 11.8], [19.2, 8], [23, 3.6], [26.6, 1.2], [27, 4.6], [22.6, 9.4], [18, 14.6], [12.6, 16.6], [2, 17.4], [-8, 17.6], [-14, 16.6], [-15.6, 11]] },
    { kind: "quay", pts: [[16.4, -17.4], [6, -17.6], [-4, -17.2], [-11.6, -15.2], [-16.4, -12.4], [-12.6, -20.2], [-4, -22.6], [6, -23], [16.2, -23.2], [20, -21.4]] },
    { kind: "quay", pts: [[-21, 2.2], [-17.2, 3.6], [-13.6, 6.2], [-10.8, 10.2], [-14.4, 12.6], [-17.6, 9.4], [-22.4, 8]] },
    // SATAY STREET and the hawker centre's plaza
    { kind: "neon", pts: [[-14, 18.2], [-4, 18.6], [8, 18], [16, 14.6], [17.4, 18.4], [9, 22.2], [-4, 23], [-14.4, 22.2]] },
    { kind: "tiles", x: 2.4, z: 14.4, r: 4.8 },
    // the NIGHT MARKET's lanes
    { kind: "neon", pts: [[17, 17], [23.4, 19.2], [29, 17.6], [31.6, 13.4], [30.6, 8.6], [28.2, 5.8], [33.6, 6.8], [35, 13.6], [31.6, 21.6], [23.4, 23.4], [16.8, 21]] },
    // the towers' plaza, the theatre's, the lion's
    { kind: "plaza", x: 4, z: -25.6, r: 5.6 },
    { kind: "square", x: -21, z: -17.4, r: 4.2 },
    { kind: "square", x: -17.6, z: 2.6, r: 3.4 },
    // the shophouse streets: old slate
    { kind: "slate", x: -27, z: 14, r: 0.6, pts: [[-24.6, 4.6], [-28.6, 8.2], [-29.6, 15.6], [-26.4, 19.4], [-20.8, 20.6], [-15.6, 19.8], [-15, 23.2], [-21.4, 24.8], [-29, 23.4], [-32.8, 16.4], [-31.6, 8.6], [-27.6, 4.2]] },
    // the gardens' lawns
    { kind: "meadow", x: 25, z: -27, r: 8.5 },
    { kind: "meadow", x: 40.5, z: -34, r: 5.5 },
  ],
  art: {
    dome: ["#04051a", "#120f42", "#33186a", "#b2457e"],
    stars: 0.7,
    fog: ["#2a1850", 110, 520],
    hemi: ["#8d92ff", "#2c2148", 1.25],
    key: ["#a9b8ff", 1.15, [-40, 70, 45]],
    rim: ["#ff4fd8", 1.0],
    ground: "#2e5a48",
    patches: ["#2a5443", "#33644f", "#2d5e47", "#386a52", "#28503f", "#31604b"],
    blades: ["#24503c", "#4c8a62", "#2f6a4c"],
    beds: ["#6c6488", "#7a7298"],
    edge: "#22483a",
    pavers: ["#c3bcd6", "#b6aecc", "#cec8de", "#aaa2c2"],
    mortar: "#7f779c",
    curbs: ["#9a93b8", "#857ea6"],
    plinth: ["#d6d0ec", "#a29bc2"],
    arrow: "#ffe9a8",
    lip: "#2f6a4c",
    earth: ["#4a3c5e", "#574870"],
    strata: ["#4b406c", "#42385f", "#3a3154", "#322a4a", "#2b2440", "#241e36"],
    crystals: ["#3ef0ff", "#ff4fd8"],
    water: ["#0a1640", "#1d4a96", "#bfe6ff"],
    greens: ["#2f8f5a", "#3fa66a", "#2a7a4f", "#4cb873", "#37995e"],
    pines: 0,
    lamp: "#ffd9a0",
    night: true,
    puffs: ["#342c6e", "#3a3278", "#2f2866", "#40367e"],
    clouds: ["#4a3a7a", "#5a3f80", "#3a3070", "#6a4a8a"],
    city: "night",
    terraces: 0,
  },
};
