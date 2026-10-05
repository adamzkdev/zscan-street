/**
 * The ZK TOWER's entertainment floor: BOWLING (aim, then power, ten frames), KARAOKE (sing along:
 * hit the notes on the beat while the lyrics scroll), DANCE (four arrows, a step chart) and
 * BILLIARDS (aim with the mouse, hold to power up, pot them all). Same contract as the others:
 * (screen, score line, game over) → stop.
 */

type Score = (s: string) => void;
type Over = (n: number) => void;

function makeCanvas(host: HTMLElement, w = 440, h = 440) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  host.appendChild(c);
  return { c, g: c.getContext("2d")! };
}

function loop(step: (dt: number, t: number) => boolean | void) {
  let raf = 0,
    last = 0,
    run = true;
  const tick = (t: number) => {
    if (!run) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    if (step(dt, t / 1000) === false) run = false;
  };
  raf = requestAnimationFrame(tick);
  return () => {
    run = false;
    cancelAnimationFrame(raf);
  };
}

function onKeys(fn: (k: string, e: KeyboardEvent) => boolean) {
  const h = (e: KeyboardEvent) => {
    if (fn(e.key.toLowerCase(), e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", h, true);
  return () => window.removeEventListener("keydown", h, true);
}

// ---- BOWLING -------------------------------------------------------------------------------------

export function bowling(host: HTMLElement, score: Score, over: Over) {
  const { c, g } = makeCanvas(host);
  // pins in a triangle at the top of the lane
  const PINS = [
    [220, 70],
    [205, 90],
    [235, 90],
    [190, 110],
    [220, 110],
    [250, 110],
    [175, 130],
    [205, 130],
    [235, 130],
    [265, 130],
  ];
  let standing = PINS.map(() => true);
  let frame = 1,
    roll = 1,
    total = 0,
    phase: "aim" | "power" | "rolling" | "settle" = "aim",
    aim = 0,
    power = 0,
    t0 = 0;
  let ball = { x: 220, y: 400, vx: 0, vy: 0 };
  const knocked = new Set<number>();
  const press = () => {
    if (phase === "aim") phase = "power";
    else if (phase === "power") {
      phase = "rolling";
      ball = { x: 220 + aim * 70, y: 400, vx: -aim * 40 * (0.5 + power), vy: -(260 + power * 320) };
    }
  };
  c.addEventListener("pointerdown", press);
  const offK = onKeys((k) => (k === " " ? (press(), true) : false));
  const stop = loop((dt, t) => {
    if (!t0) t0 = t;
    if (phase === "aim") aim = Math.sin((t - t0) * 2.2);
    if (phase === "power") power = (Math.sin((t - t0) * 3.4) + 1) / 2;
    if (phase === "rolling") {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.x = Math.max(150, Math.min(290, ball.x));
      PINS.forEach(([px, py], i) => {
        if (standing[i] && Math.hypot(ball.x - px, ball.y - py) < 16 + power * 10) {
          standing[i] = false;
          knocked.add(i);
          // a pin hit sends its neighbours flying too, now and then
          PINS.forEach(([qx, qy], j) => standing[j] && Math.hypot(qx - px, qy - py) < 26 && Math.random() < 0.55 && ((standing[j] = false), knocked.add(j)));
        }
      });
      if (ball.y < 40) ((phase = "settle"), (t0 = t));
    }
    if (phase === "settle" && t - t0 > 0.9) {
      total += knocked.size;
      knocked.clear();
      const strike = standing.every((s) => !s);
      if (roll === 1 && !strike) roll = 2;
      else {
        frame++;
        roll = 1;
        standing = PINS.map(() => true);
      }
      if (frame > 10) {
        over(total);
        return false;
      }
      phase = "aim";
      t0 = t;
    }
    g.fillStyle = "#14121c";
    g.fillRect(0, 0, 440, 440);
    g.fillStyle = "#d8b07a";
    g.fillRect(150, 0, 140, 440);
    g.fillStyle = "#3a3842";
    g.fillRect(140, 0, 10, 440);
    g.fillRect(290, 0, 10, 440);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = "#b0413e";
      g.beginPath();
      g.moveTo(165 + k * 18, 300);
      g.lineTo(171 + k * 18, 290);
      g.lineTo(177 + k * 18, 300);
      g.fill();
    }
    PINS.forEach(([px, py], i) => {
      if (!standing[i]) return;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(px, py, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#d0303a";
      g.fillRect(px - 5, py - 1, 10, 2);
    });
    if (phase === "aim" || phase === "power") {
      g.strokeStyle = "#3ef0ff";
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(220 + aim * 70, 400);
      g.lineTo(220 + aim * 20, 150);
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = "#2a78d6";
    g.beginPath();
    g.arc(phase === "rolling" ? ball.x : 220 + aim * 70, phase === "rolling" ? ball.y : 400, 11, 0, Math.PI * 2);
    g.fill();
    // the power gauge
    g.fillStyle = "#24202e";
    g.fillRect(330, 120, 20, 260);
    g.fillStyle = phase === "power" ? "#f4b728" : "#3a3842";
    g.fillRect(330, 380 - power * 260, 20, power * 260);
    g.fillStyle = "#e9eef7";
    g.font = '700 14px "JetBrains Mono", monospace';
    g.fillText(`FRAME ${Math.min(10, frame)}/10 · ROLL ${roll}`, 12, 22);
    g.fillText(phase === "aim" ? "SPACE: lock the aim" : phase === "power" ? "SPACE: release!" : "", 12, 42);
    score(`${total} pins`);
  });
  return () => (stop(), offK());
}

// ---- KARAOKE -------------------------------------------------------------------------------------

/** The song: a line of lyrics per bar, a note on each beat to hit with Space (or ↑). */
const SONG = [
  "Shield me, shield me, under neon rain",
  "Every note encrypted, nothing in the chain",
  "Ironwood and Orchard, let the bus go by",
  "Zero knowledge baby, you don't need to know why",
  "Seventy-five seconds and a block comes round",
  "Twenty-five tomorrow, hear that NU7 sound",
  "Shield me, shield me, under neon rain",
  "ZStreet in the night, I'm private once again",
];

export function karaoke(host: HTMLElement, score: Score, over: Over) {
  const { g } = makeCanvas(host);
  const BEAT = 0.5;
  const notes: { t: number; lane: number; hit: boolean; missed: boolean }[] = [];
  SONG.forEach((_, line) => {
    for (let b = 0; b < 8; b++) if (b % 2 === 0 || Math.random() < 0.4) notes.push({ t: 2 + line * 4 + b * BEAT, lane: Math.floor(Math.random() * 3), hit: false, missed: false });
  });
  let t0 = 0,
    now = 0,
    points = 0,
    combo = 0,
    flash = 0,
    judged = "";
  const LANE_KEYS = [
    ["arrowleft", "a", "q"],
    ["arrowup", "w", "z", " "],
    ["arrowright", "d"],
  ];
  const offK = onKeys((k) => {
    const lane = LANE_KEYS.findIndex((ks) => ks.includes(k));
    if (lane < 0) return false;
    const n = notes.find((x) => !x.hit && !x.missed && x.lane === lane && Math.abs(x.t - now) < 0.22);
    if (n) {
      n.hit = true;
      combo++;
      const perfect = Math.abs(n.t - now) < 0.08;
      points += (perfect ? 100 : 50) * (1 + Math.floor(combo / 10));
      judged = perfect ? "PERFECT" : "GOOD";
      flash = 0.3;
    } else (combo = 0), (judged = "MISS");
    return true;
  });
  const stop = loop((dt, t) => {
    if (!t0) t0 = t;
    now = t - t0;
    flash = Math.max(0, flash - dt);
    for (const n of notes) if (!n.hit && !n.missed && now - n.t > 0.25) ((n.missed = true), (combo = 0));
    g.fillStyle = "#120a20";
    g.fillRect(0, 0, 440, 440);
    // the stage lights sweep
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `hsla(${(now * 40 + i * 90) % 360} 90% 60% / 0.12)`;
      g.beginPath();
      g.moveTo(60 + i * 110, 0);
      g.lineTo(20 + i * 110 + Math.sin(now + i) * 40, 260);
      g.lineTo(100 + i * 110 + Math.sin(now + i) * 40, 260);
      g.fill();
    }
    // lyrics: the current line, the next one dimmer
    const line = Math.max(0, Math.floor((now - 2) / 4));
    g.textAlign = "center";
    g.font = '700 19px "JetBrains Mono", monospace';
    g.fillStyle = "#ff7ab0";
    if (SONG[line]) g.fillText(SONG[line], 220, 70);
    g.fillStyle = "#6a5a7a";
    g.font = '500 15px "JetBrains Mono", monospace';
    if (SONG[line + 1]) g.fillText(SONG[line + 1], 220, 98);
    // three lanes of notes falling to the line
    const HIT = 360;
    for (let lane = 0; lane < 3; lane++) {
      const x = 130 + lane * 90;
      g.fillStyle = "#1c1430";
      g.fillRect(x - 30, 130, 60, 290);
      g.strokeStyle = ["#3ef0ff", "#f4b728", "#ff3e8a"][lane];
      g.lineWidth = 3;
      g.strokeRect(x - 30, HIT - 12, 60, 24);
    }
    for (const n of notes) {
      if (n.hit) continue;
      const y = HIT - (n.t - now) * 220;
      if (y < 120 || y > 440) continue;
      g.fillStyle = n.missed ? "#3a3048" : ["#3ef0ff", "#f4b728", "#ff3e8a"][n.lane];
      g.fillRect(130 + n.lane * 90 - 24, y - 8, 48, 16);
    }
    g.fillStyle = flash > 0 ? "#fff" : "#9a8aaa";
    g.font = '800 22px "JetBrains Mono", monospace';
    if (judged) g.fillText(judged, 220, 150);
    g.font = '600 13px "JetBrains Mono", monospace';
    g.fillStyle = "#9a8aaa";
    g.fillText("← ↑ → on the beat  ·  combo ×" + combo, 220, 432);
    g.textAlign = "left";
    score(`${points}`);
    if (now > 2 + SONG.length * 4 + 1) {
      over(points);
      return false;
    }
  });
  return () => (stop(), offK());
}

// ---- DANCE ---------------------------------------------------------------------------------------

export function dance(host: HTMLElement, score: Score, over: Over) {
  const { g } = makeCanvas(host);
  const DIRS = ["←", "↓", "↑", "→"];
  const KEYS = [
    ["arrowleft", "a", "q"],
    ["arrowdown", "s"],
    ["arrowup", "w", "z"],
    ["arrowright", "d"],
  ];
  const COLS = ["#ff3e8a", "#3ef0ff", "#3ee08f", "#f4b728"];
  const steps: { t: number; d: number; hit: boolean; missed: boolean }[] = [];
  for (let i = 0; i < 90; i++) steps.push({ t: 2 + i * (0.5 - Math.min(0.2, i * 0.003)), d: Math.floor(Math.random() * 4), hit: false, missed: false });
  let t0 = 0,
    now = 0,
    points = 0,
    combo = 0,
    judged = "",
    flash = 0,
    life = 10;
  const pressed = [0, 0, 0, 0];
  const offK = onKeys((k) => {
    const d = KEYS.findIndex((ks) => ks.includes(k));
    if (d < 0) return false;
    pressed[d] = 0.15;
    const s = steps.find((x) => !x.hit && !x.missed && x.d === d && Math.abs(x.t - now) < 0.2);
    if (s) {
      s.hit = true;
      combo++;
      points += Math.abs(s.t - now) < 0.07 ? 100 : 50;
      judged = Math.abs(s.t - now) < 0.07 ? "MARVELOUS" : "GREAT";
      flash = 0.2;
    } else ((combo = 0), (judged = "BOO"));
    return true;
  });
  const stop = loop((dt, t) => {
    if (!t0) t0 = t;
    now = t - t0;
    flash = Math.max(0, flash - dt);
    for (let i = 0; i < 4; i++) pressed[i] = Math.max(0, pressed[i] - dt);
    for (const s of steps)
      if (!s.hit && !s.missed && now - s.t > 0.22) {
        s.missed = true;
        combo = 0;
        life--;
      }
    g.fillStyle = "#0a0614";
    g.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `hsla(${(i * 30 + now * 60) % 360} 80% 55% / 0.08)`;
      g.fillRect(0, i * 22, 440, 11);
    }
    const TOP = 60;
    for (let d = 0; d < 4; d++) {
      const x = 95 + d * 84;
      g.strokeStyle = COLS[d];
      g.lineWidth = pressed[d] > 0 ? 5 : 2;
      g.strokeRect(x - 30, TOP - 30, 60, 60);
      g.fillStyle = COLS[d];
      g.font = '800 34px "JetBrains Mono", monospace';
      g.textAlign = "center";
      g.globalAlpha = 0.35;
      g.fillText(DIRS[d], x, TOP + 12);
      g.globalAlpha = 1;
    }
    for (const s of steps) {
      if (s.hit) continue;
      const y = TOP + (s.t - now) * 260;
      if (y > 460 || y < -40) continue;
      g.fillStyle = s.missed ? "#3a3048" : COLS[s.d];
      g.fillText(DIRS[s.d], 95 + s.d * 84, y + 12);
    }
    g.fillStyle = flash > 0 ? "#fff" : "#b0a0c0";
    g.font = '800 26px "JetBrains Mono", monospace';
    if (judged) g.fillText(judged, 220, 250);
    g.font = '600 14px "JetBrains Mono", monospace';
    g.fillText(`combo ×${combo}`, 220, 280);
    g.textAlign = "left";
    g.fillStyle = "#24202e";
    g.fillRect(12, 420, 416, 10);
    g.fillStyle = life > 3 ? "#3ee08f" : "#f06b76";
    g.fillRect(12, 420, (416 * Math.max(0, life)) / 10, 10);
    score(`${points}`);
    if (life <= 0 || now > steps[steps.length - 1].t + 1) {
      over(points);
      return false;
    }
  });
  return () => (stop(), offK());
}

// ---- BILLIARDS -----------------------------------------------------------------------------------

export function billiards(host: HTMLElement, score: Score, over: Over) {
  const { c, g } = makeCanvas(host);
  const X0 = 30,
    Y0 = 90,
    X1 = 410,
    Y1 = 350,
    R = 9;
  const COLS = ["#f4b728", "#2a78d6", "#d0303a", "#6b4c9a", "#ff9f2e", "#2f7d5b", "#7a2a2a", "#111111", "#f4b728", "#2a78d6"];
  type Ball = { x: number; y: number; vx: number; vy: number; c: string; in: boolean; cue?: boolean };
  const balls: Ball[] = [{ x: 130, y: 220, vx: 0, vy: 0, c: "#ffffff", in: false, cue: true }];
  let k = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) balls.push({ x: 290 + row * 17, y: 220 - row * 9.5 + i * 19, vx: 0, vy: 0, c: COLS[k++], in: false });
  const pockets = [
    [X0, Y0],
    [(X0 + X1) / 2, Y0 - 4],
    [X1, Y0],
    [X0, Y1],
    [(X0 + X1) / 2, Y1 + 4],
    [X1, Y1],
  ];
  let mouse = { x: 300, y: 220 },
    charging = 0,
    holding = false,
    shots = 0,
    potted = 0;
  const moving = () => balls.some((b) => !b.in && Math.hypot(b.vx, b.vy) > 2);
  const toLocal = (e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 440, y: ((e.clientY - r.top) / r.height) * 440 };
  };
  c.addEventListener("pointermove", (e) => (mouse = toLocal(e)));
  c.addEventListener("pointerdown", () => !moving() && (holding = true));
  const release = () => {
    if (!holding) return;
    holding = false;
    const cue = balls[0];
    const a = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
    const sp = 120 + charging * 900;
    cue.vx = Math.cos(a) * sp;
    cue.vy = Math.sin(a) * sp;
    charging = 0;
    shots++;
  };
  window.addEventListener("pointerup", release);
  const stop = loop((dt) => {
    if (holding) charging = Math.min(1, charging + dt * 0.8);
    for (let step = 0; step < 4; step++) {
      const h = dt / 4;
      for (const b of balls) {
        if (b.in) continue;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.vx *= Math.pow(0.55, h);
        b.vy *= Math.pow(0.55, h);
        if (b.x < X0 + R || b.x > X1 - R) ((b.vx = -b.vx * 0.9), (b.x = Math.max(X0 + R, Math.min(X1 - R, b.x))));
        if (b.y < Y0 + R || b.y > Y1 - R) ((b.vy = -b.vy * 0.9), (b.y = Math.max(Y0 + R, Math.min(Y1 - R, b.y))));
        for (const [px, py] of pockets)
          if (Math.hypot(b.x - px, b.y - py) < 16) {
            if (b.cue) Object.assign(b, { x: 130, y: 220, vx: 0, vy: 0 });
            else ((b.in = true), potted++);
          }
      }
      for (let i = 0; i < balls.length; i++)
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i],
            b = balls[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x,
            dy = b.y - a.y,
            d = Math.hypot(dx, dy);
          if (d > 0 && d < R * 2) {
            const nx = dx / d,
              ny = dy / d;
            const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (p > 0) {
              a.vx -= p * nx;
              a.vy -= p * ny;
              b.vx += p * nx;
              b.vy += p * ny;
            }
            const push = (R * 2 - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
    }
    g.fillStyle = "#14100c";
    g.fillRect(0, 0, 440, 440);
    g.fillStyle = "#4a3020";
    g.fillRect(X0 - 18, Y0 - 18, X1 - X0 + 36, Y1 - Y0 + 36);
    g.fillStyle = "#1f6a3a";
    g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    g.fillStyle = "#0a0a0a";
    for (const [px, py] of pockets) {
      g.beginPath();
      g.arc(px, py, 14, 0, Math.PI * 2);
      g.fill();
    }
    for (const b of balls) {
      if (b.in) continue;
      g.fillStyle = b.c;
      g.beginPath();
      g.arc(b.x, b.y, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.beginPath();
      g.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2);
      g.fill();
    }
    if (!moving()) {
      const cue = balls[0];
      const a = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.setLineDash([5, 6]);
      g.beginPath();
      g.moveTo(cue.x, cue.y);
      g.lineTo(cue.x + Math.cos(a) * 300, cue.y + Math.sin(a) * 300);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = "#d8b07a";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cue.x - Math.cos(a) * (14 + charging * 40), cue.y - Math.sin(a) * (14 + charging * 40));
      g.lineTo(cue.x - Math.cos(a) * (180 + charging * 40), cue.y - Math.sin(a) * (180 + charging * 40));
      g.stroke();
      g.lineWidth = 1;
    }
    g.fillStyle = "#e9eef7";
    g.font = '700 14px "JetBrains Mono", monospace';
    g.fillText(`${potted}/10 potted · ${shots} shots`, 12, 30);
    g.font = '500 12px "JetBrains Mono", monospace';
    g.fillText("aim with the mouse · hold, then release to shoot", 12, 52);
    g.fillStyle = "#24202e";
    g.fillRect(12, 400, 416, 10);
    g.fillStyle = "#f4b728";
    g.fillRect(12, 400, 416 * charging, 10);
    score(`${potted}/10 · ${shots} shots`);
    if (potted >= 10) {
      over(shots);
      return false;
    }
  });
  return () => (stop(), window.removeEventListener("pointerup", release));
}
