/**
 * ZK PARTY online, in the hall: the ONLINE card on the hub, the name and face editor, and the
 * lobby of a room (its code to share, the four seats, the host's settings, Ready and Start).
 *
 * - No wallet: a name (profile.p.nick, "Snark#4071" until picked) and a face (profile.p.avatar: a
 *   zkSNARK, or one of the city's cast), kept in this browser.
 * - Private rooms only: made here, shared as a code or a link (party.html?room=CODE, which opens
 *   straight on the room). Empty seats are the AI's once the host starts.
 * - The host's start hands the room to `onRoomStart` (roomstart.ts), the next phase's door.
 *
 * The room's connection is src/net/rooms.ts; the protocol server/rooms/protocol.ts.
 */
import { T } from "../i18n/lang";
import { profile, randomNick } from "../game/profile";
import { personImage } from "./people";
import { RoomClient, createRoom, roomLink, roomsOnline } from "../net/rooms";
import { DEFAULT_SETTINGS, MODES, NAME_MAX, SEATS, cleanCode, cleanName, validAvatar, type RoomView, type Settings, type StartSeat } from "../../server/rooms/protocol";
import { MAPS } from "./board/maps";
import { SEAT, SEAT_DARK, sfx } from "./kit";
import { LEVELS } from "./select";
import { onRoomStart } from "./roomstart";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const BASE = import.meta.env?.BASE_URL ?? "/";
/** A board's picture (as on the hub's board card). */
const boardArt = (key: string) => `${BASE}party/thumbs/${key === "genesis" ? "board" : `board-${key}`}.jpg`;
const TURNS = [10, 15, 20] as const;
const MODE_NAME: Record<string, [string, string]> = { board: ["Board game", "棋盘游戏"] };
/** The room this tab was in (a reload goes straight back, without asking for the name again). */
const SKEY = "pt-room";
const ON_PAGE = /\/party(?:\.html)?$/.test(location.pathname);

const ICON = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  crown: `<svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
  dice: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.4"/><circle cx="15" cy="15" r="1.4"/><circle cx="15" cy="9" r="1.4"/><circle cx="9" cy="15" r="1.4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>`,
};

export interface OnlineHooks {
  toast(s: string, kind?: "info" | "win" | "lose"): void;
  /** The hub must be drawn again (a new name, the lobby closed). */
  hub(): void;
  /** Play the room's game on the stage (the hall's board, online); resolves when it is over. */
  play?(room: RoomClient, seed: number, seats: StartSeat[], settings: Settings): Promise<void>;
}

export class Online {
  readonly el: HTMLElement;
  /** The lobby is on the screen. */
  open = false;
  private dlg: HTMLElement;
  private dlgEsc: (() => void) | null = null;
  private room: RoomClient | null = null;
  private offs: (() => void)[] = [];
  /** The game the room started (shown as "Starting…" until the next phase takes the screen). */
  private started: { seed: number; seats: StartSeat[] } | null = null;
  private last: RoomView | null = null;
  /** The seats drawn last (seat:name): a new one pops in, the others stay still at a redraw. */
  private drawn = new Set<string>();
  private making = false;
  private netT: ReturnType<typeof setInterval> | undefined;

  constructor(
    parent: HTMLElement,
    private hooks: OnlineHooks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "pt-sel pt-lobby pt-hidden";
    this.el.addEventListener("click", (e) => this.click(e));
    this.dlg = document.createElement("div");
    this.dlg.className = "pt-modal onl-modal";
    this.dlg.addEventListener("keydown", (e) => this.dlgKey(e));
    parent.append(this.el, this.dlg);
  }

  // ---- the hub's card -----------------------------------------------------------------------------

  cardHtml() {
    const ok = roomsOnline();
    return `<section class="pt-card pt-onl" data-tab="online">
      <div class="pt-body">
        <span class="pt-badge alt">${T("New · with friends", "新 · 和好友一起")}</span>
        <h2>${T("Online", "在线对战")}</h2>
        <p>${T("Private room · up to four friends · empty seats get zkSNARK rivals", "私人房间 · 最多四位好友 · 空位由 zkSNARK 对手补上")}</p>
        <button class="onl-mebtn" data-a="on-me" title="${esc(T("Your name and face online", "你的在线名字和头像"))}">${this.meChip()}</button>
        <div class="onl-go">
          <button class="pt-play blue" data-a="on-create" ${ok ? "" : "disabled"}>${T("Create a room", "创建房间")}</button>
          <button class="pt-ghost" data-a="on-join" ${ok ? "" : "disabled"}>${T("Join with a code", "输入房间码加入")}</button>
        </div>
      </div>
    </section>`;
  }

  private meChip() {
    const p = profile.p;
    return `<img src="${personImage(p.avatar)}" alt="" /><span><small>${T("Playing as", "身份")}</small><b>${esc(p.nick)}</b></span><em>${ICON.edit}${T("Edit", "编辑")}</em>`;
  }

  /** A click on the hub's card (its data-a starts with "on-"). */
  hubClick(a: string) {
    if (a === "on-me") this.meDialog();
    else if (a === "on-create") void this.create();
    else if (a === "on-join") this.joinDialog();
  }

  // ---- in and out of a room -----------------------------------------------------------------------

  private async create() {
    if (this.making || this.room) return;
    this.making = true;
    this.keepNick();
    try {
      this.enter(await createRoom());
    } catch (e) {
      const why = (e as Error).message;
      this.hooks.toast(why === "rate" ? T("Too many rooms from here: try again in a few minutes.", "此处创建的房间太多：请几分钟后再试。") : why === "offline" ? T("The room server is out of reach.", "无法连接房间服务器。") : T("No room could be made: try again.", "无法创建房间：请重试。"), "lose");
    } finally {
      this.making = false;
    }
  }

  /** A link opened the hall (party.html?room=CODE): straight in if this tab was there, else the name first. */
  invite(raw: string) {
    const code = cleanCode(raw);
    if (!code || this.room) return;
    if (!roomsOnline()) return this.hooks.toast(T("Online rooms open soon.", "在线房间即将开放。"), "lose");
    let was = "";
    try {
      was = sessionStorage.getItem(SKEY) ?? "";
    } catch {
      /* private mode */
    }
    if (was === code) return this.enter(code);
    this.meDialog({ title: T(`You're invited · room ${code}`, `邀请你加入 · 房间 ${code}`), go: T("Join", "加入"), then: () => this.enter(code), cancel: () => this.setUrl("") });
  }

  private enter(code: string) {
    this.keepNick();
    this.closeDlg();
    const room = new RoomClient(code, { name: profile.p.nick, avatar: profile.p.avatar });
    this.room = room;
    this.started = null;
    this.last = null;
    this.offs = [
      room.on("state", (s) => {
        if (s === "reconnecting") this.hooks.toast(T("Connection lost: reconnecting…", "连接中断：正在重连…"), "lose");
        this.render();
      }),
      room.on("welcome", () => {
        try {
          sessionStorage.setItem(SKEY, code);
        } catch {
          /* private mode */
        }
      }),
      room.on("room", (r) => {
        this.news(this.last, r);
        this.last = r;
        if (r.phase === "lobby") this.started = null;
        this.render();
      }),
      room.on("start", ({ seed, seats }) => {
        // (the same start again: a reconnect while the game is on)
        if (this.started?.seed === seed && this.playingRoom) return;
        this.started = { seed, seats };
        sfx.star();
        this.render();
        onRoomStart(room, seed, seats);
        void this.playRoom(room, seed, seats);
      }),
      room.on("error", ({ code: c }) => {
        if (c === "notReady") this.hooks.toast(T("Not everyone is ready yet.", "还有人没准备好。"), "lose");
        else if (c === "rate") this.hooks.toast(T("Easy: too many taps.", "慢一点：点得太快了。"), "lose");
      }),
      room.on("closed", ({ why }) => this.closed(code, why)),
    ];
    this.setUrl(code);
    this.show();
  }

  /** The room's game, on the hall's stage: the lobby steps aside, then comes back when it is over. */
  private playingRoom = false;
  private async playRoom(room: RoomClient, seed: number, seats: StartSeat[]) {
    if (!this.hooks.play || this.playingRoom) return;
    this.playingRoom = true;
    this.el.classList.add("pt-hidden");
    try {
      await this.hooks.play(room, seed, seats, this.last?.settings ?? DEFAULT_SETTINGS);
    } finally {
      this.playingRoom = false;
      if (this.room === room) {
        this.el.classList.remove("pt-hidden");
        this.render();
      }
    }
  }

  /** The room is over for this page: why, then back to the hub. */
  private closed(code: string, why: string) {
    const msg: Record<string, [string, string]> = {
      noRoom: [`There is no room ${code}. Check the code, or ask for a new link.`, `没有房间 ${code}。请检查房间码，或索取新链接。`],
      full: [`Room ${code} is full: four players already.`, `房间 ${code} 已满：已有四位玩家。`],
      started: [`Room ${code} has already started its game.`, `房间 ${code} 的游戏已经开始。`],
      replaced: ["This room is open in another tab or window.", "此房间已在另一个标签页或窗口中打开。"],
      expired: [`Room ${code} has closed.`, `房间 ${code} 已关闭。`],
      lost: ["The connection to the room was lost.", "与房间的连接已断开。"],
      bad: ["The room closed the connection.", "房间关闭了连接。"],
    };
    this.exit();
    if (why === "left" || why === "closed") return;
    const [en, zh] = msg[why] ?? msg.bad;
    this.alert(T("Online", "在线"), T(en, zh));
  }

  /** Leave for good (the room's "closed" then brings the hub back). */
  private leave() {
    if (this.room) this.room.leave();
    else this.exit();
  }

  private exit() {
    for (const off of this.offs) off();
    this.offs = [];
    this.room?.close();
    this.room = null;
    this.started = null;
    this.last = null;
    try {
      sessionStorage.removeItem(SKEY);
    } catch {
      /* private mode */
    }
    this.setUrl("");
    this.hide();
    this.hooks.hub();
  }

  /** Leave quietly (the hall closes). */
  shutdown() {
    if (this.room) this.leave();
    this.closeDlg();
  }

  private show() {
    this.open = true;
    this.el.classList.remove("pt-hidden");
    this.el.classList.add("pt-fresh");
    setTimeout(() => this.el.classList.remove("pt-fresh"), 1100);
    clearInterval(this.netT);
    // (the round trip, read fresh every few seconds)
    this.netT = setInterval(() => this.renderNet(), 3000);
    this.render();
  }

  private hide() {
    this.open = false;
    clearInterval(this.netT);
    this.el.classList.add("pt-hidden");
    this.el.innerHTML = "";
    this.drawn.clear();
  }

  /** Esc: a dialog closes, else the lobby asks to leave. True when it was ours. */
  esc(): boolean {
    if (this.dlg.classList.contains("on")) {
      this.dlgEsc?.();
      return true;
    }
    if (!this.open) return false;
    this.askLeave();
    return true;
  }

  private askLeave() {
    const playing = this.room?.room?.phase === "playing";
    this.confirm(T("Leave the room?", "离开房间？"), playing ? T("The game goes on without you.", "游戏会在没有你的情况下继续。") : T("Your seat goes to someone else.", "你的座位会让给别人。"), T("Leave", "离开"), () => this.leave());
  }

  /** The room's code in the address (party.html only), so a reload comes back to it. */
  private setUrl(code: string) {
    if (!ON_PAGE) return;
    const q = new URLSearchParams(location.search);
    if (code) q.set("room", code);
    else q.delete("room");
    const s = q.toString();
    history.replaceState(history.state, "", `${location.pathname}${s ? `?${s}` : ""}${location.hash}`);
  }

  /** A profile from before the rooms, or never saved: its drawn name kept now. */
  private keepNick() {
    const n = cleanName(profile.p.nick);
    if (n !== profile.p.nick || !validAvatar(profile.p.avatar))
      profile.update((p) => {
        p.nick = n || randomNick();
        if (!validAvatar(p.avatar)) p.avatar = 1 + Math.floor(Math.random() * 10_000);
      });
  }

  // ---- what changed, said in a toast -----------------------------------------------------------------

  private news(was: RoomView | null, now: RoomView) {
    const mine = this.room?.mySeat ?? -1;
    if (!was) return;
    for (let i = 0; i < SEATS; i++) {
      const a = was.seats[i];
      const b = now.seats[i];
      if (i === mine) continue;
      if (!a && b) this.hooks.toast(T(`${b.name} joined`, `${b.name} 加入了`), "info");
      else if (a && !b) this.hooks.toast(T(`${a.name} left`, `${a.name} 离开了`), "info");
      else if (a && b && a.online && !b.online && !b.gone) this.hooks.toast(T(`${b.name} lost the connection…`, `${b.name} 掉线了…`), "info");
      else if (a && b && !a.online && b.online) this.hooks.toast(T(`${b.name} is back`, `${b.name} 回来了`), "info");
    }
    if (was.host !== now.host && now.host >= 0) {
      if (now.host === mine) this.hooks.toast(T("You're the host now", "你现在是房主"), "win");
      else if (now.seats[now.host]) this.hooks.toast(T(`${now.seats[now.host]!.name} is the host now`, `${now.seats[now.host]!.name} 现在是房主`), "info");
    }
    if (was.phase === "playing" && now.phase === "lobby") this.hooks.toast(T("Back in the lobby", "回到大厅"), "info");
  }

  // ---- the lobby ----------------------------------------------------------------------------------

  private render() {
    const c = this.room;
    if (!this.open || !c) return;
    const keep = this.el.querySelector<HTMLElement>(".onl-main")?.scrollTop ?? 0;
    const first = !this.el.querySelector(".onl-code");
    const r = c.room;
    this.el.innerHTML = `
      <div class="sel-bg"><i></i></div>
      <header class="sel-head">
        <button class="sel-back" data-o="leave" title="${esc(T("Leave the room (Esc)", "离开房间（Esc）"))}">${ICON.back}<span>${T("Leave", "离开")}</span></button>
        <div class="sel-title"><small>ZK PARTY · ${T("ONLINE", "在线")}</small><b>${T("Room", "房间")}</b></div>
        ${this.netHtml()}
      </header>
      ${
        r
          ? `<div class="onl-main">
        <div class="onl-col">
          ${this.codeHtml(c.code, first)}
          <section class="onl-seats">${r.seats.map((_, i) => this.seatHtml(r, i)).join("")}</section>
        </div>
        <div class="onl-col">
          ${this.setHtml(r)}
          ${this.actsHtml(r)}
        </div>
      </div>`
          : ""
      }
      ${this.overHtml(c.code)}`;
    const m = this.el.querySelector<HTMLElement>(".onl-main");
    if (m) m.scrollTop = keep;
    this.drawn = new Set(r ? r.seats.map((s, i) => `${i}:${s?.name ?? ""}`) : []);
  }

  private netHtml() {
    const c = this.room;
    const s = c?.state ?? "connecting";
    const label =
      s === "open" ? (c!.rtt ? T(`Online · ${c!.rtt} ms`, `在线 · ${c!.rtt} 毫秒`) : T("Online", "在线")) : s === "reconnecting" ? T("Reconnecting…", "重连中…") : s === "connecting" ? T("Connecting…", "连接中…") : T("Offline", "离线");
    return `<span class="onl-net" data-s="${s}" role="status"><i></i><span>${label}</span></span>`;
  }

  private renderNet() {
    const n = this.el.querySelector(".onl-net");
    if (n) n.outerHTML = this.netHtml();
  }

  private codeHtml(code: string, pop: boolean) {
    const share = matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function";
    return `<section class="onl-codebox">
      <small>${T("Room code", "房间码")}</small>
      <div class="onl-code${pop ? " pop" : ""}" aria-label="${esc(T(`Room code ${[...code].join(" ")}`, `房间码 ${[...code].join(" ")}`))}">${[...code].map((ch, i) => `<i style="--i:${i}">${ch}</i>`).join("")}</div>
      <button class="pt-play blue onl-share" data-o="share">${share ? ICON.share : ICON.copy}${share ? T("Share", "分享") : T("Copy link", "复制链接")}</button>
      <small class="onl-hint">${T("Friends open the link, or pick Join with a code in the hall.", "好友打开链接，或在大厅中选择输入房间码加入。")}</small>
    </section>`;
  }

  private seatHtml(r: RoomView, i: number) {
    const s = r.seats[i];
    const mine = i === this.room?.mySeat;
    const style = `--c:${SEAT[i]};--d:${SEAT_DARK[i]}`;
    const pop = s && !this.drawn.has(`${i}:${s.name}`) ? " pop" : "";
    if (!s) {
      const ai = r.phase === "playing";
      return `<div class="onl-seat ai" style="${style}">
        <span class="onl-av"><i class="onl-ai">AI</i></span>
        <b>${ai ? T("zkSNARK rival", "zkSNARK 对手") : T("Open seat", "空位")}</b>
        <small>${T(`AI · ${LEVELS[r.settings.skill]?.en ?? ""}`, `AI · ${LEVELS[r.settings.skill]?.zh ?? ""}`)}</small>
      </div>`;
    }
    const host = i === r.host;
    const state = s.gone ? T("Left", "已离开") : !s.online ? T("Reconnecting…", "重连中…") : host ? T("Host", "房主") : s.ready ? T("Ready", "已准备") : T("Not ready", "未准备");
    const cls = s.gone || !s.online ? "off" : host || s.ready ? "ok" : "";
    return `<div class="onl-seat${mine ? " me" : ""}${pop}" style="${style}">
      <span class="onl-av"><img src="${personImage(s.avatar)}" alt="" />${host ? `<i class="onl-crown" title="${esc(T("Host", "房主"))}">${ICON.crown}</i>` : ""}</span>
      <b>${esc(s.name)}</b>
      <small class="onl-st ${cls}">${s.ready && !host ? "✓ " : ""}${state}</small>
      ${mine ? `<span class="onl-you">${T("You", "你")}</span>` : ""}
      ${mine && r.phase === "lobby" ? `<button class="onl-edit" data-o="me" title="${esc(T("Your name and face", "你的名字和头像"))}" aria-label="${esc(T("Your name and face", "你的名字和头像"))}">${ICON.edit}</button>` : ""}
    </div>`;
  }

  private setHtml(r: RoomView) {
    const host = !!this.room?.isHost && r.phase === "lobby";
    const dis = host ? "" : "disabled";
    const seg = (k: keyof Settings, items: [string | number, string][]) =>
      `<div class="pt-seg">${items.map(([v, label]) => `<button data-o="set" data-k="${k}" data-v="${v}" class="${r.settings[k] === v ? "on" : ""}" ${dis}>${label}</button>`).join("")}</div>`;
    return `<section class="pt-card onl-set">
      <div class="onl-sh"><b>${T("Settings", "设置")}</b><small>${host ? T("You're the host: you choose", "你是房主：由你决定") : T("The host chooses", "由房主决定")}</small></div>
      <div class="onl-opt"><small>${T("Mode", "模式")}</small>${seg(
        "mode",
        MODES.map((m) => [m, T(...((MODE_NAME[m] ?? [m, m]) as [string, string]))]),
      )}</div>
      <div class="onl-opt"><small>${T("Board", "棋盘")}</small><div class="sel-trks onl-maps" style="--c:#ff6b35">${MAPS.map(
        (m) => `<button class="sel-trk${r.settings.map === m.key ? " on" : ""}" data-o="set" data-k="map" data-v="${m.key}" title="${esc(T(m.title, m.titleZh))}" ${dis}><span class="sel-tth"><img src="${boardArt(m.key)}" alt="" draggable="false" onerror="this.remove()" /></span><b>${esc(T(m.title, m.titleZh))}</b></button>`,
      ).join("")}</div></div>
      <div class="onl-opt"><small>${T("Turns", "回合")}</small>${seg(
        "turns",
        TURNS.map((n) => [n, String(n)]),
      )}</div>
      <div class="onl-opt"><small>${T("AI rivals", "AI 对手")}</small>${seg(
        "skill",
        LEVELS.map((l, i) => [i, T(l.en, l.zh)]),
      )}</div>
    </section>`;
  }

  private actsHtml(r: RoomView) {
    const c = this.room!;
    const mine = r.seats[c.mySeat];
    const others = r.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => s && i !== r.host && !s.gone);
    const waiting = others.filter(({ s }) => !s!.ready).map(({ s }) => s!.name);
    const humans = r.seats.filter((s) => s && !s.gone).length;
    const count = T(`${humans} ${humans === 1 ? "player" : "players"} · ${SEATS - humans} AI`, `${humans} 位玩家 · ${SEATS - humans} 个 AI`);
    let status: string;
    let btn: string;
    if (c.isHost) {
      status = waiting.length
        ? T(`Waiting for ${waiting.map(esc).join(", ")} to be ready`, `等待 ${waiting.map(esc).join("、")} 准备`)
        : others.length
          ? T("Everyone's ready: start when you like", "大家都准备好了：随时可以开始")
          : T("Start now against three AI rivals, or wait for friends", "现在就和三个 AI 对手开始，或等待好友");
      btn = `<button class="pt-play onl-main-btn" data-o="start" ${waiting.length ? "disabled" : ""}>${ICON.play}${T("Start", "开始")}</button>`;
    } else {
      status = mine?.ready ? T("You're ready: the host starts the game", "你已准备：等待房主开始") : T("Tap Ready when you are", "准备好了就点准备");
      btn = mine?.ready
        ? `<button class="pt-ghost onl-main-btn onl-isready" data-o="ready" data-v="0">✓ ${T("Ready · tap to undo", "已准备 · 点击取消")}</button>`
        : `<button class="pt-play blue onl-main-btn" data-o="ready" data-v="1">${T("Ready", "准备")}</button>`;
    }
    return `<div class="onl-acts">
      <p class="onl-status"><b>${count}</b><span>${status}</span></p>
      ${btn}
    </div>`;
  }

  /** Over the lobby: joining, or the game starting. */
  private overHtml(code: string) {
    const c = this.room!;
    if (!c.room) {
      return `<div class="onl-over"><div class="pt-dlg onl-wait"><i class="onl-spin"></i><h3>${T(`Joining room ${code}…`, `正在加入房间 ${code}…`)}</h3><p>${c.state === "reconnecting" ? T("The room server is not answering yet: trying again.", "房间服务器暂未响应：正在重试。") : T("A moment.", "请稍候。")}</p><div class="pt-dlg-a"><button class="pt-ghost" data-o="cancel">${T("Cancel", "取消")}</button></div></div></div>`;
    }
    if (!this.started) return "";
    const ai = this.started.seats.filter((s) => s.ai).length;
    return `<div class="onl-over"><div class="pt-dlg onl-wait">
      <i class="onl-spin"></i>
      <small>${T(`Room ${code} · ${4 - ai} players · ${ai} AI`, `房间 ${code} · ${4 - ai} 位玩家 · ${ai} 个 AI`)}</small>
      <h3>${T("Starting…", "即将开始…")}</h3>
      <p>${T(`Seed ${this.started.seed.toString(16).toUpperCase().padStart(8, "0")}: the same game on every screen.`, `种子 ${this.started.seed.toString(16).toUpperCase().padStart(8, "0")}：每块屏幕上都是同一局游戏。`)}</p>
      <div class="pt-dlg-a">
        <button class="pt-ghost" data-o="leave">${T("Leave", "离开")}</button>
        ${c.isHost ? `<button class="pt-play" data-o="lobby">${T("Back to the lobby", "返回大厅")}</button>` : ""}
      </div>
    </div></div>`;
  }

  // ---- taps ---------------------------------------------------------------------------------------

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-o]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const o = b.dataset.o!;
    const v = b.dataset.v ?? "";
    const c = this.room;
    sfx.blip(2);
    if (o === "leave") return this.askLeave();
    if (o === "cancel") return this.leave();
    if (o === "share") return void this.share();
    if (o === "me") return this.meDialog();
    if (!c) return;
    if (o === "ready") c.ready(v === "1");
    else if (o === "start") c.start();
    else if (o === "lobby") c.backToLobby();
    else if (o === "set") {
      const k = b.dataset.k as keyof Settings;
      c.setSettings({ [k]: k === "turns" || k === "skill" ? Number(v) : v });
    }
  }

  private async share() {
    const code = this.room?.code;
    if (!code) return;
    const url = roomLink(code);
    if (matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "ZK PARTY", text: T(`Join my ZK PARTY room ${code}`, `来我的 ZK PARTY 房间 ${code}`), url });
        return;
      } catch (e) {
        // (the sheet closed by the player: nothing more to do)
        if ((e as Error).name === "AbortError") return;
      }
    }
    if (await copy(url)) this.hooks.toast(T("Link copied", "链接已复制"), "win");
    else this.alert(T("The room's link", "房间链接"), url);
  }

  // ---- dialogs ------------------------------------------------------------------------------------

  private showDlg(html: string, onEsc: () => void) {
    this.dlg.innerHTML = html;
    this.dlg.classList.add("on");
    this.dlgEsc = onEsc;
  }
  private closeDlg() {
    this.dlg.classList.remove("on");
    this.dlg.innerHTML = "";
    this.dlgEsc = null;
    this.dlg.onclick = null;
  }
  private dlgKey(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    const go = this.dlg.querySelector<HTMLButtonElement>("[data-go]");
    if (go && !go.disabled) {
      e.preventDefault();
      go.click();
    }
  }

  private alert(title: string, body: string) {
    this.showDlg(`<div class="pt-dlg onl-dlg"><h3>${esc(title)}</h3><p class="onl-break">${esc(body)}</p><div class="pt-dlg-a"><button class="pt-play" data-go>${T("OK", "好")}</button></div></div>`, () => this.closeDlg());
    this.dlg.onclick = (e) => (e.target as HTMLElement).closest("[data-go]") && this.closeDlg();
  }

  private confirm(title: string, body: string, yes: string, then: () => void) {
    this.showDlg(
      `<div class="pt-dlg onl-dlg"><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="pt-dlg-a"><button class="pt-ghost" data-no>${T("Stay", "留下")}</button><button class="pt-play danger" data-yes>${esc(yes)}</button></div></div>`,
      () => this.closeDlg(),
    );
    this.dlg.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-no]")) return this.closeDlg();
      if (!t.closest("[data-yes]")) return;
      this.closeDlg();
      then();
    };
  }

  /** The code, typed (or pasted, a whole link too). */
  joinDialog(code = "") {
    if (!roomsOnline() || this.room) return;
    this.showDlg(
      `<div class="pt-dlg onl-dlg">
        <small>${T("Online", "在线")}</small>
        <h3>${T("Join a room", "加入房间")}</h3>
        <p>${T("The 4-letter code a friend shared with you.", "好友分享给你的 4 个字母的房间码。")}</p>
        <input class="onl-codein" value="${esc(code)}" maxlength="64" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${T("CODE", "房间码")}" aria-label="${esc(T("Room code", "房间码"))}" />
        <p class="onl-err" role="alert"></p>
        <button class="onl-mebtn" data-me>${this.meChip()}</button>
        <div class="pt-dlg-a"><button class="pt-ghost" data-x>${T("Cancel", "取消")}</button><button class="pt-play" data-go>${T("Join", "加入")}</button></div>
      </div>`,
      () => this.closeDlg(),
    );
    const input = this.dlg.querySelector<HTMLInputElement>(".onl-codein")!;
    const err = this.dlg.querySelector<HTMLElement>(".onl-err")!;
    input.addEventListener("input", () => {
      // (typed letters upper case; a pasted link becomes its code)
      const c = cleanCode(input.value);
      if (c && input.value !== c) input.value = c;
      else if (input.value.length <= 4) input.value = input.value.toUpperCase();
      err.textContent = "";
    });
    if (!matchMedia("(pointer: coarse)").matches) input.focus();
    this.dlg.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-x]")) this.closeDlg();
      else if (t.closest("[data-me]")) this.meDialog({ then: () => this.joinDialog(input.value), cancel: () => this.joinDialog(input.value) });
      else if (t.closest("[data-go]")) {
        const c = cleanCode(input.value);
        if (!c) {
          err.textContent = T("Four letters, like BKRT.", "四个字母，例如 BKRT。");
          return void input.focus();
        }
        this.enter(c);
      }
    };
  }

  /** The name and the face (then: what to do once saved, a join from a link). */
  meDialog(o: { title?: string; go?: string; then?: () => void; cancel?: () => void } = {}) {
    let face = validAvatar(profile.p.avatar) ? profile.p.avatar : 1;
    const faces = () => {
      // (your own zkSNARK, then a few of the city's, the same ones every time)
      const list = [face, profile.p.avatar];
      for (let k = 0; k < 15; k++) list.push(((profile.p.avatar * 7919 + k * 1543) % 10_000) + 1);
      return [...new Set(list.filter(validAvatar))].slice(0, 17);
    };
    const facesHtml = () =>
      faces()
        .map((id) => `<button class="onl-face${id === face ? " on" : ""}" data-face="${id}" aria-pressed="${id === face}"><img src="${personImage(id)}" alt="" /></button>`)
        .join("") + `<button class="onl-face rnd" data-rnd title="${esc(T("A random zkSNARK", "随机一个 zkSNARK"))}">${ICON.dice}</button>`;
    const inRoom = !!this.room;
    this.showDlg(
      `<div class="pt-dlg onl-dlg onl-medlg">
        <small>${T("Online · no wallet needed", "在线 · 无需钱包")}</small>
        <h3>${esc(o.title ?? T("Your name and face", "你的名字和头像"))}</h3>
        <div class="onl-namerow"><span class="onl-lab">${T("Name", "名字")}</span><input class="onl-name" value="${esc(profile.p.nick)}" maxlength="${NAME_MAX}" autocomplete="nickname" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="${esc(T("Your name", "你的名字"))}" /><button class="onl-dice" data-dice title="${esc(T("A random name", "随机名字"))}" aria-label="${esc(T("A random name", "随机名字"))}">${ICON.dice}</button></div>
        <p class="onl-err" role="alert"></p>
        <span class="onl-lab">${T("Face", "头像")}</span>
        <div class="onl-faces">${facesHtml()}</div>
        <div class="pt-dlg-a"><button class="pt-ghost" data-x>${T("Cancel", "取消")}</button><button class="pt-play" data-go>${esc(o.go ?? T("Save", "保存"))}</button></div>
      </div>`,
      () => (this.closeDlg(), o.cancel?.()),
    );
    const input = this.dlg.querySelector<HTMLInputElement>(".onl-name")!;
    const err = this.dlg.querySelector<HTMLElement>(".onl-err")!;
    const grid = this.dlg.querySelector<HTMLElement>(".onl-faces")!;
    input.addEventListener("input", () => (err.textContent = ""));
    this.dlg.onclick = (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>("[data-face]");
      if (f) {
        face = Number(f.dataset.face);
        grid.innerHTML = facesHtml();
        sfx.blip(3);
      } else if (t.closest("[data-rnd]")) {
        face = 1 + Math.floor(Math.random() * 10_000);
        grid.innerHTML = facesHtml();
        sfx.blip(3);
      } else if (t.closest("[data-dice]")) {
        e.preventDefault();
        input.value = randomNick();
        err.textContent = "";
      } else if (t.closest("[data-x]")) {
        this.closeDlg();
        o.cancel?.();
      } else if (t.closest("[data-go]")) {
        const name = cleanName(input.value);
        if (!name) {
          err.textContent = T("Pick a name (letters or numbers).", "请取个名字（字母或数字）。");
          return void input.focus();
        }
        profile.update((p) => {
          p.nick = name;
          p.avatar = face;
        });
        // (the city shows the same zkSNARK: the street's presence reads this)
        try {
          localStorage.setItem("street.avatar", String(face));
        } catch {}
        if (inRoom) this.room?.setMe(name, face);
        this.closeDlg();
        this.hooks.hub();
        o.then?.();
      }
    };
  }
}

/** Copies text: the clipboard where the page may (https, localhost), the old way elsewhere (a phone on http over the Wi-Fi). */
async function copy(s: string) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
