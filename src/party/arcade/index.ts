/**
 * ZK PARTY's games you play on your own or face to face with one zkSNARK, drawn flat (canvas or
 * DOM), quick to load on a phone: the ARCADE (high scores) and the new BOARD and CARD tables.
 * Light: their cards only; each game's code loads when it is opened (runner.ts).
 *
 * - ZK MERGE (merge.ts): drop round Apparitions in a jar, two alike merge into the next one.
 * - ZK JUMP (jump.ts): your zkSNARK flaps between the blocks.
 * - ZK WHO? (who.ts): guess your rival's secret zkSNARK by its traits, yes or no.
 */
import type { ArcadeMake } from "./runner";

export type Shelf = "arcade" | "board" | "cards";

export interface ArcadeDef {
  key: string;
  shelf: Shelf;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  /** How to play, one or two short lines. */
  help: string;
  helpZh: string;
  color: string;
  /** "score": a high score; "duel": a win or a loss against one zkSNARK. */
  kind: "score" | "duel";
  /** ⓩ for a result (play money; a little, so nobody farms it). */
  reward(score: number, won: boolean): number;
  load(): Promise<{ default: ArcadeMake }>;
}

export const ARCADE: ArcadeDef[] = [
  {
    key: "zkmerge",
    shelf: "arcade",
    title: "ZK MERGE",
    titleZh: "ZK 合成",
    tag: "Drop the round Apparitions; two alike merge into the next. Reach the last one.",
    tagZh: "投下圆形幽灵，两个相同的会合成下一个。合成到最后一个！",
    help: "Aim, then drop (click, tap or Space). Two alike touching merge and score. Don't let the jar fill past the line.",
    helpZh: "瞄准后投下（点击、轻触或空格）。两个相同的碰到就合成得分。别让罐子满过红线。",
    color: "#b18cff",
    kind: "score",
    reward: (s) => Math.min(80, Math.floor(s / 150)),
    load: () => import("./merge"),
  },
  {
    key: "zkjump",
    shelf: "arcade",
    title: "ZK JUMP",
    titleZh: "ZK 跳跳",
    tag: "Flap your zkSNARK between the blocks. One touch and it's over.",
    tagZh: "让你的 zkSNARK 在区块之间扑腾飞过。碰一下就结束。",
    help: "Click, tap or Space to flap. Pass between the blocks, grab the ⓩ. It speeds up.",
    helpZh: "点击、轻触或空格键扑腾。从区块之间穿过，抓住 ⓩ。会越来越快。",
    color: "#3ec6ff",
    kind: "score",
    reward: (s) => Math.min(80, s),
    load: () => import("./jump"),
  },
  {
    key: "zkwho",
    shelf: "board",
    title: "ZK WHO?",
    titleZh: "猜猜 ZK 是谁？",
    tag: "24 zkSNARKs. Guess your rival's secret one by its traits, before it guesses yours.",
    tagZh: "24 个 zkSNARK。在对手猜中你之前，凭特征猜出它的秘密 zkSNARK。",
    help: "Ask yes/no questions about the traits (Lineage, Head, Eyes…); those that don't fit fall. Guess when you're sure: a wrong guess loses.",
    helpZh: "就特征（血统、头饰、眼睛……）提出是非问题，不符合的会倒下。有把握时再猜：猜错就输。",
    color: "#ffd23f",
    kind: "duel",
    reward: (_s, won) => (won ? 40 : 0),
    load: () => import("./who"),
  },
];

export const arcadeOf = (key: string) => ARCADE.find((a) => a.key === key) ?? null;
