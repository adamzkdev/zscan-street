/**
 * ZK PARTY's board game: a real party board in 3D (the board/ folder).
 *
 * - board/maps.ts: the boards as data (paths and junctions, islands, landmarks, gimmicks);
 *   GENESIS HARBOR is the first.
 * - board/core.ts: the rules and the rivals' minds, apart from any picture (simulated in Node).
 * - board/view.ts, board/props.ts: the 3D board.
 * - board/paint.ts: the HUD.
 * - board/game.ts: `Board`, the rules played out on the stage, the mini-game after every turn.
 */
export { Board, BLOCK_PRICE, TURN_CHOICES, type BoardHooks, type BoardOpts, type BoardResult } from "./board/game";
