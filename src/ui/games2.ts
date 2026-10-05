/**
 * More of the ZK TOWER's games: ZK KART (top-down kart racing against two rivals), SHIELDED
 * INVADERS (shoot the transparent leaks before they land), FLAPPY ZEC, AIR HOCKEY (against the
 * house) and WHACK-A-LEAK. Each takes its screen, a score line and a game-over callback, and
 * returns a stop function.
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

/** Held keys, captured before the walker or the page sees them; released on stop. */
function keys(watch: string[]) {
  const down = new Set<string>();
  const on = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!watch.includes(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown") down.add(k);
    else down.delete(k);
  };
  window.addEventListener("keydown", on, true);
  window.addEventListener("keyup", on, true);
  return { down, off: () => (window.removeEventListener("keydown", on, true), window.removeEventListener("keyup", on, true)) };
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

const LEFT = ["arrowleft", "a", "q"],
  RIGHT = ["arrowright", "d"],
  UP = ["arrowup", "w", "z"],
  DOWN = ["arrowdown", "s"];
const any = (down: Set<string>, ks: string[]) => ks.some((k) => down.has(k));

// ---- ZK KART -------------------------------------------------------------------------------------

export function kart(host: HTMLElement, score: Score, over: Over) {
  const { g } = makeCanvas(host);
  const K = keys([...LEFT, ...RIGHT, ...UP, ...DOWN]);
  // the track: a rounded loop round the middle; its centre line, sampled, guides the rivals
  const CX = 220,
    CY = 220,
    RX = 150,
    RY = 120,
    HALF = 34;
  const centre = (a: number) => ({ x: CX + Math.cos(a) * (RX + Math.sin(a * 2) * 18), y: CY + Math.sin(a) * RY });
  const onTrack = (x: number, y: number) => {
    let best = Infinity;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const p = centre(a);
      best = Math.min(best, Math.hypot(x - p.x, y - p.y));
    }
    return best < HALF;
  };
  const angleOf = (x: number, y: number) => (Math.atan2(y - CY, x - CX) + Math.PI * 2) % (Math.PI * 2);
  type Kart = { x: number; y: number; dir: number; v: number; color: string; lap: number; prog: number; ai: number; name: string };
  const start = centre(Math.PI / 2);
  const karts: Kart[] = [
    { x: start.x - 14, y: start.y - 12, dir: Math.PI, v: 0, color: "#f4b728", lap: 0, prog: Math.PI / 2, ai: 0, name: "YOU" },
    { x: start.x + 6, y: start.y + 8, dir: Math.PI, v: 0, color: "#3ee08f", lap: 0, prog: Math.PI / 2, ai: 0.93, name: "ORCHARD" },
    { x: start.x + 26, y: start.y - 6, dir: Math.PI, v: 0, color: "#eb6834", lap: 0, prog: Math.PI / 2, ai: 0.88, name: "SAPLING" },
  ];
  const LAPS = 3;
  let t0 = 0,
    countdown = 3,
    done = false;
  const grass = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 440;
    const gg = c.getContext("2d")!;
    gg.fillStyle = "#1f4a2a";
    gg.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 400; i++) {
      gg.fillStyle = i % 2 ? "#245632" : "#1a4024";
      gg.fillRect((i * 97) % 440, (i * 53) % 440, 3, 3);
    }
    // the road, its kerbs and the start line
    for (let a = 0; a < Math.PI * 2 + 0.05; a += 0.02) {
      const p = centre(a);
      gg.fillStyle = Math.floor(a * 12) % 2 ? "#d0504a" : "#eeeeee";
      gg.beginPath();
      gg.arc(p.x, p.y, HALF + 4, 0, Math.PI * 2);
      gg.fill();
    }
    for (let a = 0; a < Math.PI * 2 + 0.05; a += 0.02) {
      const p = centre(a);
      gg.fillStyle = "#3a3a44";
      gg.beginPath();
      gg.arc(p.x, p.y, HALF, 0, Math.PI * 2);
      gg.fill();
    }
    const s = centre(Math.PI / 2);
    for (let i = -HALF; i < HALF; i += 6) for (let j = 0; j < 2; j++) {
      gg.fillStyle = (i / 6 + j) % 2 ? "#ffffff" : "#111111";
      gg.fillRect(s.x - 3 + j * 3, s.y + i, 3, 6);
    }
    gg.fillStyle = "rgba(244,183,40,0.8)";
    gg.font = '700 18px "JetBrains Mono", monospace';
    gg.fillText("ZK KART", CX - 38, CY + 6);
    return c;
  })();
  const stop = loop((dt, t) => {
    if (!t0) t0 = t;
    countdown = Math.max(0, 3 - (t - t0));
    const go = countdown <= 0 && !done;
    for (const k of karts) {
      if (go) {
        if (!k.ai) {
          const acc = any(K.down, UP) ? 180 : any(K.down, DOWN) ? -200 : -60;
          k.v = Math.max(-40, Math.min(onTrack(k.x, k.y) ? 165 : 70, k.v + acc * dt));
          const steer = (any(K.down, LEFT) ? -1 : 0) + (any(K.down, RIGHT) ? 1 : 0);
          k.dir += steer * dt * 2.8 * Math.min(1, Math.abs(k.v) / 60) * Math.sign(k.v || 1);
        } else {
          // rivals aim a little ahead on the centre line
          const target = centre((k.prog + 0.35) % (Math.PI * 2));
          const want = Math.atan2(target.y - k.y, target.x - k.x);
          let d = want - k.dir;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          k.dir += Math.max(-3, Math.min(3, d * 4)) * dt;
          k.v = Math.min(158 * k.ai + Math.sin(t * 0.7 + k.ai * 10) * 8, k.v + 150 * dt);
        }
        k.x += Math.cos(k.dir) * k.v * dt;
        k.y += Math.sin(k.dir) * k.v * dt;
        k.x = Math.max(8, Math.min(432, k.x));
        k.y = Math.max(8, Math.min(432, k.y));
        // laps: progress round the loop, counted when it wraps past the start
        const a = angleOf(k.x, k.y);
        let da = a - (k.prog % (Math.PI * 2));
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.6) k.prog += da;
        k.lap = Math.floor((k.prog - Math.PI / 2) / (Math.PI * 2));
      }
    }
    g.drawImage(grass, 0, 0);
    for (const k of karts) {
      g.save();
      g.translate(k.x, k.y);
      g.rotate(k.dir);
      g.fillStyle = "#111";
      g.fillRect(-9, -8, 5, 3);
      g.fillRect(-9, 5, 5, 3);
      g.fillRect(4, -8, 5, 3);
      g.fillRect(4, 5, 5, 3);
      g.fillStyle = k.color;
      g.fillRect(-9, -6, 18, 12);
      g.fillStyle = "#fff";
      g.fillRect(2, -3, 4, 6);
      g.restore();
    }
    const me = karts[0];
    const place = 1 + karts.slice(1).filter((k) => k.prog > me.prog).length;
    const elapsed = go || done ? t - t0 - 3 : 0;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, 440, 30);
    g.fillStyle = "#f4b728";
    g.font = '700 15px "JetBrains Mono", monospace';
    g.fillText(`LAP ${Math.min(LAPS, Math.max(1, me.lap + 1))}/${LAPS}   P${place}/3   ${Math.max(0, elapsed).toFixed(1)}s`, 12, 20);
    if (countdown > 0) {
      g.fillStyle = "#fff";
      g.font = '800 70px "JetBrains Mono", monospace';
      g.textAlign = "center";
      g.fillText(String(Math.ceil(countdown)), 220, 240);
      g.font = '600 14px "JetBrains Mono", monospace';
      g.fillText("↑ go · ↓ brake · ← → steer", 220, 280);
      g.textAlign = "left";
    }
    score(`P${place} · ${Math.max(0, elapsed).toFixed(1)}s`);
    if (!done && me.lap >= LAPS) {
      done = true;
      // the score is the time, a podium finish takes ten seconds off
      over(Math.round((elapsed - (place === 1 ? 10 : 0)) * 10) / 10);
      return false;
    }
  });
  return () => (stop(), K.off());
}

// ---- SHIELDED INVADERS ---------------------------------------------------------------------------

export function invaders(host: HTMLElement, score: Score, over: Over) {
  const { g } = makeCanvas(host);
  const K = keys([...LEFT, ...RIGHT, " "]);
  const ALIEN = ["..#....#..", "...####...", "..######..", ".##.##.##.", "##########", "#.######.#", "#.#....#.#", "...##.##.."];
  let ship = 220,
    shots: { x: number; y: number }[] = [],
    bombs: { x: number; y: number }[] = [],
    aliens: { x: number; y: number; alive: boolean }[] = [],
    dx = 30,
    cool = 0,
    points = 0,
    wave = 0,
    lives = 3;
  const spawn = () => {
    wave++;
    aliens = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) aliens.push({ x: 50 + c * 42, y: 50 + r * 34, alive: true });
    dx = 30 + wave * 8;
  };
  spawn();
  const drawAlien = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    ALIEN.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && g.fillRect(x - 15 + i * 3, y - 12 + j * 3, 3, 3)));
  };
  const stop = loop((dt, t) => {
    if (any(K.down, LEFT)) ship -= 220 * dt;
    if (any(K.down, RIGHT)) ship += 220 * dt;
    ship = Math.max(20, Math.min(420, ship));
    cool -= dt;
    if (K.down.has(" ") && cool <= 0) {
      shots.push({ x: ship, y: 400 });
      cool = 0.35;
    }
    shots = shots.filter((s) => (s.y -= 420 * dt) > 0);
    bombs = bombs.filter((b) => (b.y += 160 * dt) < 440);
    const live = aliens.filter((a) => a.alive);
    const minX = Math.min(...live.map((a) => a.x)),
      maxX = Math.max(...live.map((a) => a.x));
    if ((dx > 0 && maxX > 420) || (dx < 0 && minX < 20)) {
      dx = -dx;
      for (const a of live) a.y += 14;
    }
    for (const a of live) a.x += dx * dt;
    if (Math.random() < dt * (0.8 + wave * 0.3) && live.length) {
      const a = live[Math.floor(Math.random() * live.length)];
      bombs.push({ x: a.x, y: a.y + 10 });
    }
    for (const s of shots)
      for (const a of live)
        if (a.alive && Math.abs(s.x - a.x) < 15 && Math.abs(s.y - a.y) < 12) {
          a.alive = false;
          s.y = -99;
          points += 10 * wave;
        }
    for (const b of bombs)
      if (Math.abs(b.x - ship) < 16 && b.y > 396 && b.y < 420) {
        b.y = 999;
        lives--;
      }
    if (!aliens.some((a) => a.alive)) spawn();
    g.fillStyle = "#05040c";
    g.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fillRect((i * 113) % 440, (i * 71 + t * 20) % 440, 1, 1);
    }
    for (const a of aliens) if (a.alive) drawAlien(a.x, a.y, Math.floor(t * 2) % 2 ? "#f06b76" : "#ff9aa4");
    g.fillStyle = "#3ee08f";
    g.fillRect(ship - 14, 404, 28, 8);
    g.fillRect(ship - 3, 396, 6, 8);
    g.fillStyle = "#7dffbe";
    for (const s of shots) g.fillRect(s.x - 1, s.y - 6, 3, 10);
    g.fillStyle = "#ffcf4a";
    for (const b of bombs) g.fillRect(b.x - 2, b.y - 4, 4, 8);
    g.fillStyle = "#e9eef7";
    g.font = '700 14px "JetBrains Mono", monospace';
    g.fillText(`WAVE ${wave}   ${"♥".repeat(Math.max(0, lives))}`, 12, 22);
    score(`${points} pts`);
    if (lives <= 0 || live.some((a) => a.y > 390)) {
      over(points);
      return false;
    }
  });
  return () => (stop(), K.off());
}

// ---- FLAPPY ZEC ----------------------------------------------------------------------------------

export function flappy(host: HTMLElement, score: Score, over: Over) {
  const { c, g } = makeCanvas(host);
  let y = 200,
    v = 0,
    started = false,
    passed = 0;
  let pipes: { x: number; gap: number; scored: boolean }[] = [];
  const flap = () => {
    started = true;
    v = -300;
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    flap();
  };
  window.addEventListener("keydown", key, true);
  c.addEventListener("pointerdown", flap);
  let next = 0;
  const stop = loop((dt, t) => {
    if (started) {
      v += 900 * dt;
      y += v * dt;
      next -= dt;
      if (next <= 0) {
        pipes.push({ x: 460, gap: 110 + Math.random() * 220, scored: false });
        next = 1.5;
      }
      for (const p of pipes) {
        p.x -= 150 * dt;
        if (!p.scored && p.x < 100) {
          p.scored = true;
          passed++;
        }
      }
      pipes = pipes.filter((p) => p.x > -60);
    }
    g.fillStyle = "#0a1030";
    g.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = "#14204a";
      g.fillRect((i * 60 - (t * 20) % 60), 330 - (i % 3) * 30, 40, 200);
    }
    for (const p of pipes) {
      g.fillStyle = "#1baf7a";
      g.fillRect(p.x, 0, 52, p.gap - 70);
      g.fillRect(p.x, p.gap + 70, 52, 440);
      g.fillStyle = "#3ee08f";
      g.fillRect(p.x - 4, p.gap - 86, 60, 16);
      g.fillRect(p.x - 4, p.gap + 70, 60, 16);
    }
    g.save();
    g.translate(100, y);
    g.rotate(Math.max(-0.5, Math.min(1.2, v / 600)));
    g.fillStyle = "#f4b728";
    g.beginPath();
    g.arc(0, 0, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14120f";
    g.font = '800 17px "JetBrains Mono", monospace';
    g.textAlign = "center";
    g.fillText("Z", 0, 6);
    g.restore();
    g.textAlign = "left";
    if (!started) {
      g.fillStyle = "#fff";
      g.font = '700 18px "JetBrains Mono", monospace';
      g.fillText("SPACE / CLICK TO FLAP", 110, 300);
    }
    score(`${passed}`);
    const hit = y > 425 || y < 0 || pipes.some((p) => p.x < 115 && p.x + 52 > 85 && (y - 13 < p.gap - 70 || y + 13 > p.gap + 70));
    if (started && hit) {
      over(passed);
      return false;
    }
  });
  return () => (stop(), window.removeEventListener("keydown", key, true));
}

// ---- AIR HOCKEY ----------------------------------------------------------------------------------

export function hockey(host: HTMLElement, score: Score, over: Over) {
  // a square screen like the others; the 300-wide table sits in its middle
  const { c, g } = makeCanvas(host);
  const OX = 70;
  const K = keys([...LEFT, ...RIGHT]);
  let me = { x: 150, y: 400 },
    ai = { x: 150, y: 40 },
    puck = { x: 150, y: 220, vx: 120, vy: 180 },
    mine = 0,
    theirs = 0;
  c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    me.x = ((e.clientX - r.left) / r.width) * 440 - OX;
    me.y = Math.max(240, Math.min(420, ((e.clientY - r.top) / r.height) * 440));
  });
  const reset = (toMe: boolean) => (puck = { x: 150, y: 220, vx: (Math.random() - 0.5) * 200, vy: toMe ? 200 : -200 });
  const bounce = (p: { x: number; y: number }) => {
    const dx = puck.x - p.x,
      dy = puck.y - p.y,
      d = Math.hypot(dx, dy);
    if (d < 32 && d > 0) {
      const sp = Math.min(560, Math.hypot(puck.vx, puck.vy) + 60);
      puck.vx = (dx / d) * sp;
      puck.vy = (dy / d) * sp;
      puck.x = p.x + (dx / d) * 32;
      puck.y = p.y + (dy / d) * 32;
    }
  };
  const stop = loop((dt) => {
    if (any(K.down, LEFT)) me.x -= 300 * dt;
    if (any(K.down, RIGHT)) me.x += 300 * dt;
    me.x = Math.max(22, Math.min(278, me.x));
    // the house tracks the puck, a little slow
    ai.x += Math.max(-220 * dt, Math.min(220 * dt, puck.x - ai.x));
    ai.y += Math.max(-150 * dt, Math.min(150 * dt, (puck.y < 220 ? puck.y - 30 : 40) - ai.y));
    ai.y = Math.max(30, Math.min(200, ai.y));
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    puck.vx *= 0.998;
    puck.vy *= 0.998;
    if (puck.x < 12 || puck.x > 288) puck.vx = -puck.vx;
    puck.x = Math.max(12, Math.min(288, puck.x));
    const inGoal = puck.x > 95 && puck.x < 205;
    if (puck.y < 10) {
      if (inGoal) (mine++, reset(false));
      else (puck.vy = Math.abs(puck.vy), (puck.y = 10));
    }
    if (puck.y > 430) {
      if (inGoal) (theirs++, reset(true));
      else (puck.vy = -Math.abs(puck.vy), (puck.y = 430));
    }
    bounce(me);
    bounce(ai);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0e0c18";
    g.fillRect(0, 0, 440, 440);
    g.translate(OX, 0);
    g.fillStyle = "#e8f0f8";
    g.fillRect(0, 0, 300, 440);
    g.strokeStyle = "#3ef0ff";
    g.lineWidth = 3;
    g.strokeRect(4, 4, 292, 432);
    g.beginPath();
    g.moveTo(4, 220);
    g.lineTo(296, 220);
    g.stroke();
    g.beginPath();
    g.arc(150, 220, 40, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#ff3e8a";
    g.fillRect(95, 0, 110, 6);
    g.fillRect(95, 434, 110, 6);
    for (const [p, col] of [
      [me, "#3ee08f"],
      [ai, "#f06b76"],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(p.x, p.y, 20, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#14120f";
    g.beginPath();
    g.arc(puck.x, puck.y, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14120f";
    g.font = '700 16px "JetBrains Mono", monospace';
    g.fillText(`${theirs}`, 270, 200);
    g.fillText(`${mine}`, 270, 250);
    score(`${mine} – ${theirs}`);
    if (mine >= 5 || theirs >= 5) {
      over(mine >= 5 ? 10 - theirs : mine);
      return false;
    }
  });
  return () => (stop(), K.off());
}

// ---- WHACK-A-LEAK ----------------------------------------------------------------------------------

export function whack(host: HTMLElement, score: Score, over: Over) {
  const { c, g } = makeCanvas(host);
  const holes = Array.from({ length: 9 }, (_, i) => ({ x: 90 + (i % 3) * 130, y: 120 + Math.floor(i / 3) * 120, up: 0, kind: "leak" as "leak" | "shield", hit: 0 }));
  let points = 0,
    t0 = 0,
    spawn = 0;
  c.addEventListener("pointerdown", (e) => {
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 440,
      y = ((e.clientY - r.top) / r.height) * 440;
    for (const h of holes)
      if (h.up > 0 && Math.hypot(x - h.x, y - h.y + 20) < 42) {
        points += h.kind === "leak" ? 10 : -15;
        h.hit = 0.3;
        h.up = 0;
      }
  });
  const stop = loop((dt, t) => {
    if (!t0) t0 = t;
    const left = 30 - (t - t0);
    spawn -= dt;
    if (spawn <= 0) {
      const free = holes.filter((h) => h.up <= 0);
      if (free.length) {
        const h = free[Math.floor(Math.random() * free.length)];
        h.up = 0.9 + Math.random() * 0.6 - (30 - left) * 0.015;
        h.kind = Math.random() < 0.2 ? "shield" : "leak";
      }
      spawn = Math.max(0.25, 0.7 - (30 - left) * 0.015);
    }
    g.fillStyle = "#1a1430";
    g.fillRect(0, 0, 440, 440);
    for (const h of holes) {
      h.up -= dt;
      h.hit = Math.max(0, h.hit - dt);
      g.fillStyle = "#0b0814";
      g.beginPath();
      g.ellipse(h.x, h.y + 20, 48, 16, 0, 0, Math.PI * 2);
      g.fill();
      if (h.up > 0) {
        g.fillStyle = h.kind === "leak" ? "#f06b76" : "#3ee08f";
        g.fillRect(h.x - 26, h.y - 40, 52, 56);
        g.fillStyle = "#14120f";
        g.font = '800 26px "JetBrains Mono", monospace';
        g.textAlign = "center";
        g.fillText(h.kind === "leak" ? "T" : "Z", h.x, h.y - 2);
        g.textAlign = "left";
      }
      if (h.hit > 0) {
        g.fillStyle = "#ffcf4a";
        g.font = '800 20px "JetBrains Mono", monospace';
        g.fillText("BAM", h.x - 22, h.y - 50);
      }
    }
    g.fillStyle = "#e9eef7";
    g.font = '700 14px "JetBrains Mono", monospace';
    g.fillText(`${Math.max(0, left).toFixed(1)}s · whack the red T leaks, spare the green Z`, 12, 22);
    score(`${points} pts`);
    if (left <= 0) {
      over(Math.max(0, points));
      return false;
    }
  });
  return stop;
}
