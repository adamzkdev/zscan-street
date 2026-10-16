/** Length of a clip (seconds). */
const SECONDS = 10;
const W = 1280;
const H = 720;
const FPS = 30;
const MONO = '"JetBrains Mono", Menlo, monospace';

/** MP4 when the browser can record it (X takes it as is), WebM otherwise. */
function pickType(): { mime: string; ext: string } {
  for (const mime of ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  return { mime: "", ext: "webm" };
}

export interface ClipInfo {
  txid: string;
  /** The line under the title, read each frame (the zkSNARK's progress). */
  line: () => string;
}

/**
 * Films the street for ten seconds: every rendered frame is copied (16:9, centred) onto a 2D
 * canvas with a ZStreet title bar and the transaction's progress, and that canvas is recorded.
 * `grab` hands over the WebGL canvas right after a frame is drawn (its buffer isn't kept).
 */
export class ClipRecorder {
  busy = false;

  constructor(private grab: (fn: (gl: HTMLCanvasElement) => void) => void) {}

  static supported() {
    return typeof MediaRecorder !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
  }

  /** Records, then resolves with the video file (null if recording failed). */
  async record(info: ClipInfo, onProgress: (left: number) => void): Promise<File | null> {
    if (this.busy) return null;
    this.busy = true;
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const g = out.getContext("2d")!;
    const { mime, ext } = pickType();
    const stream = out.captureStream(FPS);
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    const t0 = performance.now();
    let live = true;
    const draw = (gl: HTMLCanvasElement) => {
      if (!live) return;
      // cover W×H with the middle of the frame
      const s = Math.max(W / gl.width, H / gl.height);
      const sw = W / s,
        sh = H / s;
      g.drawImage(gl, (gl.width - sw) / 2, (gl.height - sh) / 2, sw, sh, 0, 0, W, H);
      overlay(g, info);
      const left = SECONDS - (performance.now() - t0) / 1000;
      onProgress(Math.max(0, left));
      if (left <= 0) {
        live = false;
        rec.stop();
        return;
      }
      this.grab(draw);
    };
    rec.start(500);
    this.grab(draw);
    await done;
    stream.getTracks().forEach((t) => t.stop());
    this.busy = false;
    if (!chunks.length) return null;
    return new File(chunks, `zstreet-${info.txid.slice(0, 8)}.${ext}`, { type: mime.split(";")[0] || "video/webm" });
  }
}

/** Title bar (ZScan charter: gold on near-black, hairline, square) and the tx's progress. */
function overlay(g: CanvasRenderingContext2D, info: ClipInfo) {
  g.fillStyle = "rgba(13,13,13,0.78)";
  g.fillRect(0, H - 76, W, 76);
  g.fillStyle = "#f4b728";
  g.fillRect(0, H - 77, W, 1);
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillStyle = "#f4b728";
  g.font = `800 26px ${MONO}`;
  g.fillText("ZSTREET", 28, H - 38);
  g.fillStyle = "#f1f1f1";
  g.font = `500 20px ${MONO}`;
  g.fillText(info.line(), 170, H - 50, W - 200 - 280);
  g.fillStyle = "#a3a3a3";
  g.font = `400 16px ${MONO}`;
  g.fillText(`tx ${info.txid.slice(0, 16)}…${info.txid.slice(-8)}`, 170, H - 24);
  g.textAlign = "right";
  g.fillStyle = "#a3a3a3";
  g.font = `500 18px ${MONO}`;
  g.fillText("zstreet.cash", W - 28, H - 38);
}
