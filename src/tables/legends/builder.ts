/**
 * ZK LEGENDS' deck builder, as the old table opens it (`new DeckBuilder(root, snd, fresh, done)`):
 * now the Collection (menus.ts) on its own, making a new deck (`fresh`) or picking one of yours to
 * edit; `done` gets the deck saved last.
 */
import type { LegendsSound } from "./sound";
import type { SavedDeck } from "./decks";
import { openCollection } from "./menus";

export class DeckBuilder {
  private h: { close(): void };
  constructor(host: HTMLElement, snd: LegendsSound, fresh: boolean, done: (saved?: SavedDeck) => void) {
    this.h = openCollection(host, snd, fresh, done);
  }
  close() {
    this.h.close();
  }
}
