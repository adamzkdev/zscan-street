import * as THREE from "three";
import type { Course } from "../../data/university";
import { Surface } from "../zktowers/kit";
import { drawTitleCard } from "./draw";

/**
 * A lecture hall's big screen: the chosen course's video (Remotion, university/video) while you
 * are in the hall, its title card otherwise. Like ZK CINEMA's rooms: the <video> is made when you
 * are there, paused the moment the hall's floor stops ticking (another floor, the city), thrown
 * away a little later. Muted: the films carry their words on screen.
 */
export class CourseScreen {
  readonly mat: THREE.MeshBasicMaterial;
  private card: Surface;
  private course: Course | null = null;
  private video: HTMLVideoElement | null = null;
  private vtex: THREE.VideoTexture | null = null;
  private seen = 0;
  private away = 0;
  private failed = false;

  constructor(
    readonly hall: string,
    readonly color: string,
  ) {
    this.card = new Surface(1280, 720, 1.0);
    this.mat = new THREE.MeshBasicMaterial({ map: this.card.tex, toneMapped: false });
    this.drawCard();
    void document.fonts?.ready.then(() => this.drawCard());
    // nobody ticked the screen for a moment: the walker left the hall
    setInterval(() => {
      if (this.video && performance.now() - this.seen > 1200) this.pause(1.2);
    }, 1000);
  }

  get current() {
    return this.course;
  }

  /** Show this course (from its start). */
  select(c: Course | null) {
    if (c === this.course) {
      if (this.video) this.video.currentTime = 0;
      return;
    }
    this.drop();
    this.course = c;
    this.failed = false;
    this.drawCard();
  }

  private drawCard() {
    const c = this.course;
    const note = !c ? "" : c.video && !this.failed ? "loading the lecture…" : "The video for this course is being rendered · read it in the Library on 4";
    this.card.draw((g, W, H) => drawTitleCard(g, W, H, c, this.hall, this.color, note));
    if (this.mat.map !== this.card.tex) this.mat.map = this.card.tex;
  }

  /** Every frame while the walker is in the hall. */
  tick() {
    this.seen = performance.now();
    this.away = 0;
    const c = this.course;
    if (!c?.video || this.failed) return;
    if (!this.video) {
      const v = document.createElement("video");
      // served by the API (another origin): asked with CORS, or WebGL may not sample it
      v.crossOrigin = "anonymous";
      v.src = c.video;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("playsinline", "");
      v.addEventListener("error", () => {
        this.failed = true;
        this.drop();
        this.drawCard();
      });
      this.video = v;
      this.vtex = new THREE.VideoTexture(v);
      this.vtex.colorSpace = THREE.SRGBColorSpace;
      this.vtex.generateMipmaps = false;
      this.vtex.minFilter = THREE.LinearFilter;
    }
    if (this.video.paused) void this.video.play().catch(() => {});
    if (this.video.readyState >= 2 && this.mat.map !== this.vtex) this.mat.map = this.vtex;
  }

  private pause(dt: number) {
    if (!this.video) return;
    this.video.pause();
    this.away += dt;
    if (this.away > 20) this.drop();
  }

  private drop() {
    if (!this.video) return;
    this.mat.map = this.card.tex;
    this.vtex?.dispose();
    this.video.removeAttribute("src");
    this.video.load();
    this.video = null;
    this.vtex = null;
  }

  /** For tests (?debug). */
  get debug() {
    return { course: this.course?.slug ?? null, video: !!this.video, t: this.video ? Math.round(this.video.currentTime * 10) / 10 : null, ready: this.video?.readyState ?? 0, showing: this.mat.map === this.vtex ? "film" : "card", failed: this.failed };
  }
}
