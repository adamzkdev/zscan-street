/**
 * The screen-space bits while you play: a small scoreboard at the top, and the huge GOOOAL!
 * when someone scores. DOM elements made here and removed again when you leave the pitch.
 */

const CSS = `
.zs-board{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:40;display:flex;align-items:stretch;gap:0;
  font:800 15px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.06em;pointer-events:none;user-select:none;
  border:1px solid rgba(244,183,40,.55);background:rgba(8,8,12,.86);box-shadow:0 0 22px rgba(244,183,40,.18);backdrop-filter:blur(6px)}
.zs-board>div{padding:9px 14px;display:flex;align-items:center;gap:10px}
.zs-board .h{background:#f4b728;color:#0b0b0f}
.zs-board .a{background:#c8ccd8;color:#141824}
.zs-board .n{font-size:22px;min-width:18px;text-align:center}
.zs-board .c{color:#fff;font-size:13px;opacity:.85;min-width:58px;justify-content:center}
.zs-board .c b{color:#f4b728;font-weight:800}
.zs-keys{position:fixed;top:62px;left:50%;transform:translateX(-50%);z-index:40;pointer-events:none;
  font:600 11px/1 "JetBrains Mono",Menlo,monospace;color:rgba(255,255,255,.75);letter-spacing:.08em;display:flex;gap:14px}
.zs-keys kbd{font:inherit;color:#f4b728;border:1px solid rgba(244,183,40,.5);padding:2px 5px;margin-right:5px;background:rgba(0,0,0,.45)}
.zs-goal{position:fixed;inset:0;z-index:60;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;
  animation:zsOut .5s ease-in 3.1s forwards;overflow:hidden}
.zs-goal::before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 50% 50%,rgba(244,183,40,.55),rgba(244,183,40,.12) 35%,transparent 65%);animation:zsFlash 1.2s ease-out both}
.zs-goal::after{content:"";position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg,rgba(244,183,40,.16) 0 6deg,transparent 6deg 18deg);animation:zsSpin 4s linear both;mask:radial-gradient(circle,#000 0,transparent 60%);-webkit-mask:radial-gradient(circle,#000 0,transparent 60%)}
.zs-goal .t{position:relative;font:900 clamp(84px,17vw,280px)/.9 "JetBrains Mono",Menlo,monospace;letter-spacing:-.03em;display:flex;white-space:nowrap}
.zs-goal .t span{display:inline-block;background:linear-gradient(180deg,#fffbe8 0%,#ffe08a 30%,#f4b728 55%,#a56f05 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 18px rgba(244,183,40,.95)) drop-shadow(0 0 60px rgba(244,183,40,.55)) drop-shadow(0 10px 0 #120d02);
  animation:zsPop .55s cubic-bezier(.18,1.8,.4,1) both, zsBob 1s ease-in-out .6s infinite alternate}
.zs-goal .s{position:relative;margin-top:22px;font:800 clamp(18px,2.6vw,38px)/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.42em;color:#f4b728;
  text-shadow:0 0 16px rgba(244,183,40,.9);animation:zsSlide .6s cubic-bezier(.2,1.3,.4,1) .35s both;padding-left:.42em}
.zs-goal .u{position:relative;margin-top:14px;font:700 clamp(12px,1.4vw,18px)/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.3em;color:#fff;opacity:.9;animation:zsSlide .6s ease .6s both}
.zs-goal.silver::before{background:radial-gradient(circle at 50% 50%,rgba(200,204,216,.5),rgba(200,204,216,.1) 35%,transparent 65%)}
.zs-goal.silver::after{background:repeating-conic-gradient(from 0deg,rgba(200,204,216,.14) 0 6deg,transparent 6deg 18deg)}
.zs-goal.silver .t span{background:linear-gradient(180deg,#ffffff 0%,#e6e9f2 35%,#aeb4c4 60%,#5c6274 100%);-webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 0 18px rgba(200,204,216,.9)) drop-shadow(0 0 50px rgba(160,170,200,.5)) drop-shadow(0 10px 0 #0b0d14)}
.zs-goal.silver .s{color:#dfe3ee;text-shadow:0 0 16px rgba(200,204,216,.9)}
@keyframes zsPop{0%{transform:scale(3.2) translateY(-30px);opacity:0;filter:blur(8px)}100%{transform:none;opacity:1}}
@keyframes zsBob{to{transform:translateY(-10px) scale(1.04)}}
@keyframes zsFlash{0%{opacity:0}12%{opacity:1}100%{opacity:.55}}
@keyframes zsSpin{from{transform:rotate(0) scale(.6);opacity:0}15%{opacity:1}to{transform:rotate(60deg) scale(1.1);opacity:.6}}
@keyframes zsSlide{from{transform:translateY(30px);opacity:0;letter-spacing:1em}to{transform:none;opacity:1}}
@keyframes zsOut{to{opacity:0;transform:scale(1.15)}}
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
}

export class Overlay {
  private board: HTMLDivElement | null = null;
  private keys: HTMLDivElement | null = null;
  private goalEl: HTMLDivElement | null = null;
  private goalTimer = 0;
  private last = "";

  showBoard(on: boolean) {
    if (on && !this.board) {
      style();
      this.board = document.createElement("div");
      this.board.className = "zs-board";
      this.keys = document.createElement("div");
      this.keys.className = "zs-keys";
      this.keys.innerHTML = `<span><kbd>CLICK</kbd><kbd>SPACE</kbd><kbd>F</kbd>shoot</span><span><kbd>⇧</kbd>sprint</span>`;
      document.body.append(this.board, this.keys);
      this.last = "";
    } else if (!on && this.board) {
      this.board.remove();
      this.keys?.remove();
      this.board = this.keys = null;
    }
  }

  setScore(home: number, away: number, clock: number) {
    if (!this.board) return;
    const m = Math.floor(clock / 60),
      s = Math.floor(clock % 60);
    const key = `${home}-${away}-${m}-${s}`;
    if (key === this.last) return;
    this.last = key;
    this.board.innerHTML = `<div class="h">SHIELDED <span class="n">${home}</span></div><div class="c"><b>${String(m).padStart(2, "0")}</b>:${String(s).padStart(2, "0")}</div><div class="a"><span class="n">${away}</span> TRANSPARENT</div>`;
  }

  goal(team: 0 | 1, sub: string) {
    style();
    this.clearGoal();
    const el = document.createElement("div");
    el.className = `zs-goal${team === 1 ? " silver" : ""}`;
    const word = "GOOOAL!";
    el.innerHTML = `<div class="t">${[...word].map((c, i) => `<span style="animation-delay:${i * 0.06}s,${0.6 + i * 0.08}s">${c}</span>`).join("")}</div><div class="s">${team === 0 ? "SHIELDED SCORES" : "TRANSPARENT SCORES"}</div>${sub ? `<div class="u">${sub}</div>` : ""}`;
    document.body.appendChild(el);
    this.goalEl = el;
    this.goalTimer = window.setTimeout(() => this.clearGoal(), 3700);
  }

  clearGoal() {
    clearTimeout(this.goalTimer);
    this.goalEl?.remove();
    this.goalEl = null;
  }

  dispose() {
    this.showBoard(false);
    this.clearGoal();
  }
}
