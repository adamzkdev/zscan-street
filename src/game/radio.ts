import type { Gossip } from "./gossip";
import type { GameHud } from "./ui";

const KEY = "street.radio";

/**
 * Radio ZStreet: a DJ (the browser's speech voice) reads the street's gossip about each block,
 * between the city's music. Opt-in from the citizen card; English, like the street's bubbles.
 */
export class Radio {
  on = false;
  private voice: SpeechSynthesisVoice | null = null;

  constructor(
    gossip: Gossip,
    private hud: GameHud,
    private soundOn: () => boolean,
  ) {
    try {
      this.on = localStorage.getItem(KEY) === "1";
    } catch {}
    const pickVoice = () => {
      const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
      this.voice = vs.find((v) => /Daniel|Samantha|Google UK English Male|Alex/.test(v.name)) ?? vs[0] ?? null;
    };
    if ("speechSynthesis" in window) {
      pickVoice();
      speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
    }
    gossip.on((g) => this.on && this.soundOn() && this.read(g.height, g.lines.map((l) => l.text)));
    hud.addRow(() => `<dt>Radio ZStreet</dt><dd><button class="caselink" data-radio>${this.on ? "📻 on air" : "off"}</button></dd>`);
    hud.root.addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest("[data-radio]")) return;
      this.on = !this.on;
      try {
        localStorage.setItem(KEY, this.on ? "1" : "0");
      } catch {}
      if (!this.on) speechSynthesis?.cancel();
      this.hud.say(this.on ? `<b>📻 RADIO ZSTREET</b> · on air from the next block${this.soundOn() ? "" : " (turn the sound on)"}` : "<b>RADIO OFF</b>");
    });
  }

  private read(height: number, lines: string[]) {
    if (!("speechSynthesis" in window) || !lines.length) return;
    const pick = lines.slice(0, 3);
    const script = [`Radio ZStreet. Block ${height.toLocaleString("en-US")} just rolled in.`, ...pick, "Stay shielded."];
    speechSynthesis.cancel();
    for (const text of script) {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = "en-US";
      u.rate = 1.04;
      u.pitch = 0.95;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    }
  }
}
