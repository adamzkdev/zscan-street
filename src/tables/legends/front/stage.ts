/**
 * ZK LEGENDS' front end, the picture behind the menus: one of the duel arenas (maps.ts) at golden
 * hour, a duel in progress on the big table (medallions in the lanes, a hand of painted cards, the
 * decks), and a crew of zkSNARKs round it (the city's own 3D figures, front/figure.ts): your own
 * zkSNARK at the near corner, tonight's rival at the far end, a few others watching, talking, pointing,
 * cheering when a medallion strikes. The camera drifts slowly; the menus ask for a framing (`frame`):
 * the subject on the right for the main menu, wider for the collection.
 *
 * Its own WebGL canvas, drawn only while the menus are up (`dispose` frees it all).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildMap, MAPS, TABLE, type MapHandle, type MapKind } from "../maps";
import { SnarkFigure } from "./figure";
import { faces } from "./faces";
import { snarkPixels } from "../pixels";
import { paintCard, paintBack, CARD_W, CARD_H } from "../paint";
import { FACTION_INFO } from "../cards";
import { card, type Faction } from "../engine";

export type Framing = "menu" | "wide" | "low";

/** A medallion on the table: a stepped gold frame, the zkSNARK in it. */
interface Medal {
  g: THREE.Group;
  home: THREE.Vector3;
}

const GRID = 26;
const FIG_SCALE = 3.1;
const FLOOR = -1.6;

function stepShape(w: number, h: number, s: number): THREE.Shape {
  const x0 = -w / 2,
    y0 = -h / 2;
  const p: [number, number][] = [
    [x0 + 2 * s, y0],
    [x0 + w - 2 * s, y0],
    [x0 + w - 2 * s, y0 + s],
    [x0 + w - s, y0 + s],
    [x0 + w - s, y0 + 2 * s],
    [x0 + w, y0 + 2 * s],
    [x0 + w, y0 + h - 2 * s],
    [x0 + w - s, y0 + h - 2 * s],
    [x0 + w - s, y0 + h - s],
    [x0 + w - 2 * s, y0 + h - s],
    [x0 + w - 2 * s, y0 + h],
    [x0 + 2 * s, y0 + h],
    [x0 + 2 * s, y0 + h - s],
    [x0 + s, y0 + h - s],
    [x0 + s, y0 + h - 2 * s],
    [x0, y0 + h - 2 * s],
    [x0, y0 + 2 * s],
    [x0 + s, y0 + 2 * s],
    [x0 + s, y0 + s],
    [x0 + 2 * s, y0 + s],
  ];
  const sh = new THREE.Shape();
  sh.moveTo(p[0][0], p[0][1]);
  for (const q of p.slice(1)) sh.lineTo(q[0], q[1]);
  sh.closePath();
  return sh;
}

/** zkSNARK #id on a warm backdrop, crisp, as a texture (filled in when its pixels come). */
function portrait(id: number, fc: string): THREE.CanvasTexture {
  const S = 8;
  const c = document.createElement("canvas");
  c.width = GRID * S;
  c.height = Math.round(GRID * S * 1.28);
  const g = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const paint = (cells: Int32Array | null) => {
    const W = c.width,
      H = c.height;
    const bg = g.createRadialGradient(W / 2, H * 0.62, 8, W / 2, H * 0.6, H * 0.8);
    bg.addColorStop(0, fc);
    bg.addColorStop(1, "#0c0a08");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    if (!cells) return;
    const oy = H - GRID * S + S * 2;
    for (let i = 0; i < GRID * GRID; i++) {
      const v = cells[i];
      if (v < 0) continue;
      g.fillStyle = `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
      g.fillRect((i % GRID) * S, ((i / GRID) | 0) * S + oy, S, S);
    }
    t.needsUpdate = true;
  };
  paint(null);
  void snarkPixels(id).then((cells) => cells && paint(cells));
  return t;
}

export class HubStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
  private map: MapHandle;
  private figs: { f: SnarkFigure; base: THREE.Vector3; face: number; role: "me" | "rival" | "crowd"; next: number }[] = [];
  private medals: Medal[] = [];
  private disposables: { dispose(): void }[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private gone = false;
  private framing: Framing = "menu";
  private camPos = new THREE.Vector3(-18, 9, 18);
  private camAim = new THREE.Vector3(0, 0, 0);
  private ro: ResizeObserver;
  private nextStrike = 3;
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];

  constructor(
    private host: HTMLElement,
    o: { meId: number; rivalId: number; faction?: Faction },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "zkf-gl";
    host.appendChild(this.canvas);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // the arena of the day
    const kind: MapKind = MAPS[Math.floor(Date.now() / 864e5) % MAPS.length];
    this.map = buildMap(kind, this.renderer, this.scene);
    this.goldenHour();
    this.dress(o.meId, o.rivalId);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    const loop = () => {
      if (this.gone) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Warm low sun through the hall, a cool rim from behind, the haze gone amber. */
  private goldenHour() {
    this.map.group.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) {
        o.color.set("#ffb36b");
        o.intensity = 4.4;
        o.position.set(-16, 8, 7);
        o.shadow.camera.left = -18;
        o.shadow.camera.right = 18;
        o.shadow.camera.top = 14;
        o.shadow.camera.bottom = -14;
        o.shadow.camera.updateProjectionMatrix();
      } else if (o instanceof THREE.HemisphereLight) {
        o.color.set("#ffd8a8");
        o.groundColor.set("#2a170c");
        o.intensity = 0.85;
      } else if (o instanceof THREE.PointLight) o.intensity *= 0.6;
    });
    const rim = new THREE.DirectionalLight("#7f9cff", 0.9);
    rim.position.set(10, 6, -14);
    this.scene.add(rim);
    const fog = new THREE.Color("#1b120a");
    this.scene.background = fog;
    this.scene.fog = new THREE.Fog(fog, 26, 58);
  }

  // ---- the set ----------------------------------------------------------------------------------------

  private dress(meId: number, rivalId: number) {
    const crowdIds = this.crowdIds(meId, rivalId);
    // the crew: you at the near left corner, the rival at the far end, four more round the table
    const spots: { id: number; x: number; z: number; face: number; role: "me" | "rival" | "crowd"; gesture: SnarkFigure["act"]["gesture"] }[] = [
      { id: meId, x: -9.6, z: TABLE.d / 2 + 2.2, face: Math.PI + 0.45, role: "me", gesture: null },
      { id: rivalId, x: 3.2, z: -TABLE.d / 2 - 2.4, face: 0.1, role: "rival", gesture: "hands" },
      { id: crowdIds[0], x: -12.2, z: -1.2, face: Math.PI / 2 + 0.15, role: "crowd", gesture: "point" },
      { id: crowdIds[1], x: 4.2, z: TABLE.d / 2 + 2.4, face: Math.PI - 0.15, role: "crowd", gesture: "talk" },
      { id: crowdIds[2], x: 12.4, z: 1.6, face: -Math.PI / 2 - 0.2, role: "crowd", gesture: "film" },
      { id: crowdIds[3], x: -1.4, z: -TABLE.d / 2 - 2.6, face: -0.3, role: "crowd", gesture: "talk" },
      { id: crowdIds[4], x: 8.6, z: -TABLE.d / 2 - 2.2, face: -0.5, role: "crowd", gesture: null },
    ];
    for (const s of spots) {
      const f = new SnarkFigure(s.id);
      f.act.gesture = s.gesture;
      f.root.scale.setScalar(FIG_SCALE);
      f.root.position.set(s.x, FLOOR, s.z);
      f.root.rotation.y = s.face;
      f.root.traverse((m) => (m.castShadow = true));
      this.scene.add(f.root);
      this.figs.push({ f, base: f.root.position.clone(), face: s.face, role: s.role, next: 2 + Math.random() * 6 });
    }
    faces.want(
      spots.map((s) => s.id),
      true,
    );

    // the duel on the table: medallions in both lanes
    const frameGeo = new THREE.ExtrudeGeometry(stepShape(1.56, 1.98, 0.17), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 });
    frameGeo.rotateX(-Math.PI / 2);
    const planeGeo = new THREE.PlaneGeometry(1.28, 1.66).rotateX(-Math.PI / 2);
    this.disposables.push(frameGeo, planeGeo);
    const lanes: { z: number; ids: number[]; f: Faction }[] = [
      { z: TABLE.laneZ[0], ids: [meId, crowdIds[5], crowdIds[6]], f: "orchard" },
      { z: TABLE.laneZ[1], ids: [rivalId, crowdIds[7], crowdIds[8], crowdIds[9]], f: "transparent" },
    ];
    for (const lane of lanes) {
      lane.ids.forEach((id, i) => {
        const g = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: i === 0 ? "#d9a42a" : FACTION_INFO[lane.f].color, metalness: 0.9, roughness: 0.3 });
        const fr = new THREE.Mesh(frameGeo, gold);
        fr.castShadow = fr.receiveShadow = true;
        g.add(fr);
        const tex = portrait(id, FACTION_INFO[lane.f].color);
        const pm = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.9, 0.9, 0.9) });
        const p = new THREE.Mesh(planeGeo, pm);
        p.position.y = 0.275;
        g.add(p);
        this.disposables.push(gold, tex, pm);
        const n = lane.ids.length;
        g.position.set((i - (n - 1) / 2) * 1.95, 0, lane.z);
        this.scene.add(g);
        this.medals.push({ g, home: g.position.clone() });
      });
    }

    // a hand of painted cards fanned at the near edge, the two decks
    const hand = ["o_pool", "n_prover", "o_pallas", "o_sentinel", "o_frost"];
    const cardGeo = new THREE.PlaneGeometry(1.9, 1.9 * (CARD_H / CARD_W)).rotateX(-Math.PI / 2);
    this.disposables.push(cardGeo);
    hand.forEach((id, i) => {
      let cv: HTMLCanvasElement;
      try {
        cv = paintCard(id);
      } catch {
        return;
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      paintCard(id, {}, () => (tex.needsUpdate = true));
      const m = new THREE.Mesh(cardGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: true }));
      const off = i - (hand.length - 1) / 2;
      m.position.set(-4.6 + off * 1.25, 0.03 + i * 0.012, TABLE.d / 2 - 1.9 + Math.abs(off) * 0.12);
      m.rotation.y = -off * 0.12;
      m.castShadow = true;
      this.scene.add(m);
      this.disposables.push(tex, m.material as THREE.Material);
      void card;
    });
    const back = new THREE.CanvasTexture(paintBack());
    back.colorSpace = THREE.SRGBColorSpace;
    const boxGeo = new RoundedBoxGeometry(1.3, 0.8, 1.8, 2, 0.06);
    const side = new THREE.MeshStandardMaterial({ color: "#2a2014", roughness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ map: back, roughness: 0.5 });
    this.disposables.push(back, boxGeo, side, top);
    for (const [x, z] of [
      [8.6, 2.6],
      [8.6, -2.8],
    ]) {
      const b = new THREE.Mesh(boxGeo, [side, side, top, side, side, side]);
      b.position.set(x, 0.4, z);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  private crowdIds(me: number, rival: number) {
    // the same faces for a day
    let seed = Math.floor(Date.now() / 864e5) * 7919 + 101;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out: number[] = [];
    while (out.length < 12) {
      const id = 1 + Math.floor(rnd() * 10000);
      if (id !== me && id !== rival && !out.includes(id)) out.push(id);
    }
    return out;
  }

  // ---- framing and motion -----------------------------------------------------------------------------

  /** Where the camera sits for a screen: the subject right of a menu on the left, wide, or low. */
  setFraming(f: Framing) {
    this.framing = f;
  }

  private want(): { pos: THREE.Vector3; aim: THREE.Vector3 } {
    const W = this.host.clientWidth || 1,
      H = this.host.clientHeight || 1;
    const portrait = W / H < 1;
    const s = Math.sin(this.t * 0.07),
      c = Math.cos(this.t * 0.05);
    if (portrait) return { pos: new THREE.Vector3(-6 + s * 1.5, 17, 22), aim: new THREE.Vector3(0, -1, -1) };
    if (this.framing === "wide") return { pos: new THREE.Vector3(-4 + s * 2, 15 + c * 0.6, 21), aim: new THREE.Vector3(1.5, -0.5, -1.2) };
    if (this.framing === "low") return { pos: new THREE.Vector3(-20 + s * 1.2, 7.4, 21 + c), aim: new THREE.Vector3(1, 0.4, -2.5) };
    // the main menu: across the near corner, the table and the crew to the right of the menu
    return { pos: new THREE.Vector3(-22 + s * 1.6, 9.5 + c * 0.4, 24 + s * 0.8), aim: new THREE.Vector3(-5.5, 0.6, -2) };
  }

  private resize() {
    const W = this.host.clientWidth || 1,
      H = this.host.clientHeight || 1;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.camera.aspect = W / H;
    this.camera.fov = W / H < 1 ? 52 : W / H < 1.4 ? 42 : 34;
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number) {
    this.t += dt;
    this.map.update(dt, this.t);
    const w = this.want();
    const k = 1 - Math.exp(-1.6 * dt);
    this.camPos.lerp(w.pos, k);
    this.camAim.lerp(w.aim, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAim);

    // the crew: idle life, now and then a gesture
    for (const c of this.figs) {
      c.next -= dt;
      if (c.next <= 0) {
        c.next = 4 + Math.random() * 7;
        const r = Math.random();
        if (c.role === "crowd") c.f.act.gesture = r < 0.3 ? "talk" : r < 0.5 ? "point" : r < 0.62 ? "film" : r < 0.75 ? "hands" : null;
        else if (c.role === "rival") c.f.act.gesture = r < 0.5 ? "hands" : null;
      }
      c.f.root.rotation.y = c.face + Math.sin(this.t * 0.4 + c.base.x) * 0.08;
      c.f.update(dt, { speed: 0 });
    }

    // the duel goes on: a medallion strikes now and then, the crowd reacts
    this.nextStrike -= dt;
    if (this.nextStrike <= 0 && this.medals.length > 1) {
      this.nextStrike = 4.5 + Math.random() * 4;
      this.strike();
    }
    this.tick(dt);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.scale.setScalar(Math.max(0.01, s.life * 0.12));
      if (s.life <= 0) {
        this.scene.remove(s.m);
        (s.m.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private anims: { t: number; d: number; f: (k: number) => void }[] = [];
  private tick(dt: number) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.d);
      a.f(k);
      if (k >= 1) this.anims.splice(i, 1);
    }
  }

  private strike() {
    const mine = this.medals.filter((m) => m.home.z > 0);
    const theirs = this.medals.filter((m) => m.home.z < 0);
    const fromMine = Math.random() < 0.5;
    const a = (fromMine ? mine : theirs)[Math.floor(Math.random() * (fromMine ? mine : theirs).length)];
    const b = (fromMine ? theirs : mine)[Math.floor(Math.random() * (fromMine ? theirs : mine).length)];
    if (!a || !b) return;
    const s = a.home.clone(),
      e = b.home.clone();
    const hit = s.clone().lerp(e, 0.62);
    let struck = false;
    this.anims.push({
      t: 0,
      d: 1.1,
      f: (k) => {
        const g = a.g;
        if (k < 0.3) {
          const q = k / 0.3;
          g.position.set(s.x, Math.sin(q * Math.PI * 0.5) * 1.1, s.z - (e.z - s.z) * 0.08 * q);
        } else if (k < 0.45) {
          const q = (k - 0.3) / 0.15;
          g.position.lerpVectors(new THREE.Vector3(s.x, 1.1, s.z), hit, q * q);
        } else {
          if (!struck) {
            struck = true;
            this.burst(hit.clone().setY(0.6));
            this.shoveB(b);
            for (const c of this.figs) if (c.role !== "rival" && Math.random() < 0.5) c.f.celebrate(1.4);
          }
          const q = (k - 0.45) / 0.55;
          g.position.lerpVectors(hit, s, 1 - (1 - q) ** 3);
          g.position.y = Math.sin(q * Math.PI) * 0.3;
        }
      },
    });
  }
  private shoveB(b: Medal) {
    const h = b.home.clone();
    const dir = Math.sign(h.z) || 1;
    this.anims.push({
      t: 0,
      d: 0.6,
      f: (k) => {
        const f = k < 0.15 ? k / 0.15 : Math.exp(-6 * (k - 0.15)) * Math.cos((k - 0.15) * 16);
        b.g.position.set(h.x, 0, h.z + dir * 0.35 * f);
      },
    });
  }
  private sparkGeo = new THREE.BoxGeometry(1, 1, 1);
  private burst(p: THREE.Vector3) {
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? "#ffd27a" : "#ffffff", toneMapped: false }));
      m.position.copy(p);
      const a = Math.random() * Math.PI * 2;
      this.scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * 4, 3 + Math.random() * 4, Math.sin(a) * 4), life: 0.7 + Math.random() * 0.4 });
    }
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const c of this.figs) c.f.dispose();
    for (const s of this.sparks) {
      this.scene.remove(s.m);
      (s.m.material as THREE.Material).dispose();
    }
    this.sparkGeo.dispose();
    this.map.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
