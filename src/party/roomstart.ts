/**
 * ZK PARTY online: where a room's game begins. The lobby (online.ts) calls `onRoomStart` once
 * the host has started, and again for a page that comes back (or reloads) into a game already on.
 * Every page in the room gets the same seed and the same seats (an AI's where nobody sat); from
 * then on they talk through the room's ordered relay: `room.send(data)`, `room.on("game", …)`,
 * `room.mySeat`, `room.serverNow()` (src/net/rooms.ts).
 *
 * The next phase plays the game here (the board, then the lockstep mini-games). For now the lobby
 * shows "Starting…" and this only says what it was given.
 */
import type { RoomClient } from "../net/rooms";
import type { StartSeat } from "../../server/rooms/protocol";

export function onRoomStart(room: RoomClient, seed: number, seats: StartSeat[]) {
  console.info(`[rooms] start ${room.code} seed ${seed} me ${room.mySeat} seats ${JSON.stringify(seats)}`);
}
