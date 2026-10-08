import * as THREE from "three";
import { API, get } from "../data/zscan";
import { visitorToken } from "../data/token";
import { CURB, worksSites, type WorkSite } from "../scene/city/plan";
import type { Decor } from "../scene/decor";
import { sayAt } from "../scene/speech";
import { C, VOX, VoxelModel } from "../scene/voxel/model";
import { MATERIALS, toObject } from "../scene/voxel/mesher";
import type { Kind } from "../scene/voxel/model";
import type { ChainClock } from "./clock";
import {
	crownModel,
	FH,
	floorModel,
	footprint,
	frameModel,
	geos,
	merge,
	NEON,
	heightOf,
	type Geos,
	type Plan,
} from "./design";
import type { GameHud } from "./ui";

export interface Who {
	id: number;
	name: string;
	job: string;
	line?: string;
}
export interface Proposal {
	idx: number;
	architect: Who;
	name: string;
	pitch: string;
	plan: Plan;
	backers: Who[];
	votes: number;
}
export interface SiteRow {
	site: number;
	round: number;
	idx: number;
	start: number;
	votes: number;
	architect: Who;
	name: string;
	pitch: string;
	plan: Plan;
	crew: Who[];
	work: number;
	need: number;
}
export interface WorksState {
	tip: number;
	round: number;
	start: number;
	end: number;
	stopped: boolean;
	proposals: Proposal[];
	sites: SiteRow[];
}

export interface WorksHooks {
	/** Take the visitor to a spot of the city. */
	go(x: number, z: number): void;
	/** Where the visitor is (on foot or the camera's focus). */
	near(): THREE.Vector3;
}

const SEEN = "street.works";
const BLOCK_MS = 75_000;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const FLOOR_M = FH * VOX;
const HALF = (64 * VOX) / 2;

interface Seen {
	round: number;
	/** site → the round of the building we last saw going up there */
	sites: Record<number, number>;
	done: number[];
	vote?: { round: number; idx: number };
}
function seen(): Seen {
	try {
		return { round: -1, sites: {}, done: [], ...JSON.parse(localStorage.getItem(SEEN) ?? "{}") };
	} catch {
		return { round: -1, sites: {}, done: [] };
	}
}
function keep(s: Seen) {
	try {
		localStorage.setItem(SEEN, JSON.stringify({ ...s, done: s.done.slice(-40) }));
	} catch {}
}

// ---- shared pieces ----

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d")!);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

/** Yellow steel lattice for the crane. */
const LATTICE = canvasTex(64, 64, (g) => {
	g.strokeStyle = "#f4b728";
	g.lineWidth = 7;
	g.strokeRect(3, 3, 58, 58);
	g.lineWidth = 4;
	g.beginPath();
	g.moveTo(4, 4);
	g.lineTo(60, 60);
	g.moveTo(60, 4);
	g.lineTo(4, 60);
	g.stroke();
});
LATTICE.wrapS = LATTICE.wrapT = THREE.RepeatWrapping;
export const latticeMat = (rx: number, ry: number) => {
	const t = LATTICE.clone();
	t.repeat.set(rx, ry);
	t.needsUpdate = true;
	return new THREE.MeshStandardMaterial({
		map: t,
		transparent: true,
		alphaTest: 0.4,
		side: THREE.DoubleSide,
		roughness: 0.6,
		metalness: 0.3,
	});
};

/** The hoarding round a site: white panels, a blue band, the city's name for its works. */
const HOARD = canvasTex(512, 96, (g) => {
	g.fillStyle = "#eef0f2";
	g.fillRect(0, 0, 512, 96);
	g.fillStyle = "#2f6fb0";
	g.fillRect(0, 62, 512, 18);
	g.fillStyle = "#3b3a42";
	for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 3, 96);
	g.font = "400 26px 'DotGothic16', monospace";
	g.fillStyle = "#2f6fb0";
	g.fillText("建設中  ZSTREET CITY WORKS", 18, 44);
});
HOARD.wrapS = THREE.RepeatWrapping;

export const steel = new THREE.MeshStandardMaterial({ color: "#d9892b", roughness: 0.7, metalness: 0.2 });
export const net = new THREE.MeshStandardMaterial({
	color: "#3a78c0",
	transparent: true,
	opacity: 0.38,
	side: THREE.DoubleSide,
	depthWrite: false,
	roughness: 1,
});
const cable = new THREE.LineBasicMaterial({ color: "#222222" });
const blink = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false });
const sparkMat = new THREE.PointsMaterial({
	color: new THREE.Color(3, 2.2, 0.8),
	size: 0.16,
	transparent: true,
	depthWrite: false,
	blending: THREE.AdditiveBlending,
	toneMapped: false,
});

/** A worker in a hard hat and a high-vis vest. */
let workerProto: THREE.Group | null = null;
export function worker() {
	if (!workerProto) {
		const m = new VoxelModel(5, 11, 3);
		m.box(0, 0, 0, 2, 4, 3, C("#2a3550"));
		m.box(3, 0, 0, 5, 4, 3, C("#2a3550"));
		m.box(0, 4, 0, 5, 8, 3, C("#ff7a1a"));
		m.box(0, 6, 0, 5, 7, 3, C("#e8f0f0"));
		m.box(1, 8, 0, 4, 10, 3, C("#e8b88a"));
		m.box(0, 10, 0, 5, 11, 3, C("#f4d020"));
		workerProto = toObject(m, { shadows: false });
	}
	return workerProto.clone();
}

export function meshes(g: Geos, shadows = true) {
	const out = new THREE.Group();
	for (const [kind, geo] of Object.entries(g) as [Kind, THREE.BufferGeometry][]) {
		const mesh = new THREE.Mesh(geo, MATERIALS[kind]);
		mesh.castShadow = kind !== "emit" && shadows;
		mesh.receiveShadow = kind !== "emit";
		out.add(mesh);
	}
	return out;
}
export function dispose(o: THREE.Object3D | null | undefined) {
	if (!o) return;
	o.parent?.remove(o);
	o.traverse((x) => {
		const m = x as THREE.Mesh;
		if (m.geometry && !(x.userData.shared as boolean)) m.geometry.dispose();
	});
}

// ---- one site ----

interface Worker {
	obj: THREE.Object3D;
	to: THREE.Vector3;
	wait: number;
	working: boolean;
}

export class Crane {
	root = new THREE.Group();
	private pivot = new THREE.Group();
	private trolley = new THREE.Group();
	private hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), steel);
	private load: THREE.Mesh;
	private line: THREE.Line;
	private lamp: THREE.Mesh;
	private inYaw: number;
	private t = Math.random() * 24;
	readonly top: number;

	constructor(at: THREE.Vector3, height: number, wallHex: string) {
		this.top = height;
		this.root.position.copy(at);
		const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, height, 0.8), latticeMat(1, height / 0.8));
		mast.position.y = height / 2;
		const cab = new THREE.Mesh(
			new THREE.BoxGeometry(1.1, 0.9, 1.1),
			new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.5 })
		);
		cab.position.y = height + 0.45;
		const jib = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.6), latticeMat(13 / 0.6, 1));
		jib.position.set(4.5, 1.2, 0);
		const counter = new THREE.Mesh(
			new THREE.BoxGeometry(1.4, 0.8, 0.9),
			new THREE.MeshStandardMaterial({ color: "#8a8073", roughness: 0.9 })
		);
		counter.position.set(-2.4, 0.9, 0);
		this.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), blink);
		this.lamp.position.set(11, 1.6, 0);
		this.pivot.position.y = height;
		this.pivot.add(cab, jib, counter, this.lamp, this.trolley);
		cab.position.y = 0.45;
		this.trolley.position.set(7, 0.9, 0);
		const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
		this.line = new THREE.Line(geo, cable);
		this.trolley.add(this.line, this.hook);
		this.load = new THREE.Mesh(
			new THREE.BoxGeometry(1.1, 0.5, 0.8),
			new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.9 })
		);
		this.load.position.y = -0.45;
		this.hook.add(this.load);
		this.root.add(mast, this.pivot);
		// the jib points at the building's centre (site origin) to drop its load
		this.inYaw = Math.atan2(at.z, -at.x);
	}

	update(dt: number, topY: number, working: boolean) {
		if (working) this.t += dt;
		const s = (this.t % 24) / 24;
		const out = 0.5 - 0.5 * Math.cos(2 * Math.PI * s);
		this.pivot.rotation.y = this.inYaw + out * 1.7;
		const reach = Math.hypot(this.root.position.x, this.root.position.z);
		this.trolley.position.x = reach + out * 2;
		// the hook lowers at both ends of the swing: onto the roof, down to the ground
		const low = THREE.MathUtils.lerp(topY + 0.7, 0.5, out);
		const high = Math.min(this.top - 1, topY + 4.5);
		const k = Math.max(0, 1 - Math.abs(Math.sin(2 * Math.PI * s)) * 3);
		const y = THREE.MathUtils.lerp(high, low, k);
		const drop = this.top + 1.1 - y;
		this.hook.position.y = -drop;
		const pos = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
		pos.setY(1, -drop);
		pos.needsUpdate = true;
		this.load.visible = s > 0.5;
		this.lamp.visible = Math.sin(performance.now() / 300) > 0;
	}
}

class Site {
	readonly group = new THREE.Group();
	readonly hit: THREE.Mesh;
	row: SiteRow | null = null;
	next = false;
	private floors: Geos[] = [];
	private crownG: Geos | null = null;
	private building: THREE.Group | null = null;
	private shown = -1;
	private frame: THREE.Object3D | null = null;
	private frameAt = -1;
	private scaffold: THREE.Group | null = null;
	private scaffoldAt = -1;
	private crane: Crane | null = null;
	crew: Worker[] = [];
	private sparks: THREE.Points | null = null;
	private fence: THREE.Group | null = null;
	private board: THREE.Mesh | null = null;
	private boardKey = "";
	private sign: THREE.Mesh | null = null;
	/** Work shown, never going back between fetches. */
	live = 0;
	private chat = rand(6, 14);

	constructor(readonly at: WorkSite, parent: THREE.Object3D) {
		this.group.position.set(at.cx, CURB, at.cz);
		this.group.rotation.y = at.face === "w" ? -Math.PI / 2 : Math.PI / 2;
		parent.add(this.group);
		this.hit = new THREE.Mesh(
			new THREE.BoxGeometry(HALF * 2, 1, HALF * 2),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		this.hit.userData.site = at.id;
		this.group.add(this.hit);
	}

	get plan() {
		return this.row?.plan ?? null;
	}
	get done() {
		return !!this.row && this.live >= this.row.need;
	}
	/** Floors finished so far. */
	get built() {
		return this.row ? Math.min(this.row.plan.floors, Math.floor(this.live / 3)) : 0;
	}
	get topY() {
		return this.built * FLOOR_M;
	}

	/** The building on this site (or none, or the next one to come). */
	set(row: SiteRow | null, next: boolean) {
		if (row?.round !== this.row?.round) {
			this.clear();
			this.row = row;
			this.live = row?.work ?? 0;
		} else if (row) {
			this.row = row;
			this.live = Math.max(this.live, row.work);
		}
		if (next !== this.next || !row) {
			this.next = next;
			this.boardKey = "";
		}
	}

	private clear() {
		for (const o of [this.building, this.frame, this.scaffold, this.fence, this.board, this.sign, this.sparks])
			dispose(o);
		if (this.crane) dispose(this.crane.root);
		for (const w of this.crew) w.obj.parent?.remove(w.obj);
		for (const g of [...this.floors, this.crownG]) for (const x of Object.values(g ?? {})) x?.dispose();
		this.floors = [];
		this.crownG = null;
		this.building = this.frame = this.scaffold = this.fence = this.board = this.sign = null;
		this.sparks = null;
		this.crane = null;
		this.crew = [];
		this.shown = this.frameAt = this.scaffoldAt = -1;
		this.boardKey = "";
	}

	/** Meshes one more piece if any is missing; true when it did (costly: one per frame). */
	mesh(): boolean {
		const p = this.plan;
		if (!p) return false;
		const want = this.built;
		if (this.floors.length < want) {
			this.floors.push(geos(floorModel(p, this.floors.length), this.floors.length * FLOOR_M));
			return true;
		}
		if (this.done && !this.crownG) {
			this.crownG = geos(crownModel(p), p.floors * FLOOR_M);
			return true;
		}
		return false;
	}

	update(
		dt: number,
		work: number,
		working: boolean,
		me: THREE.Vector3,
		say: (o: THREE.Object3D, text: string, shout?: boolean) => void
	) {
		const p = this.plan;
		this.hit.scale.y = p ? Math.max(8, this.topY + 2) : 3;
		this.hit.position.y = this.hit.scale.y / 2;
		this.drawBoard();
		if (!p || !this.row) return;
		const before = this.built;
		this.live = Math.min(this.row.need, Math.max(this.live, work));
		const built = this.built;
		if (built > before && built < p.floors && this.crew.length)
			say(pickOne(this.crew).obj, `Floor ${built} done!`, true);
		// the finished floors, merged in one go once they're all meshed
		const have = built + (this.done ? 1 : 0);
		if (have !== this.shown && this.floors.length >= built && (!this.done || this.crownG)) {
			dispose(this.building);
			const parts = this.floors.slice(0, built);
			if (this.done && this.crownG) parts.push(this.crownG);
			this.building = parts.length ? meshes(merge(parts)) : null;
			if (this.building) this.group.add(this.building);
			this.shown = have;
		}
		if (built >= 1 && !this.sign) this.makeSign(p);
		if (this.done) {
			for (const o of [this.frame, this.scaffold, this.fence, this.board, this.sparks]) dispose(o);
			if (this.crane) dispose(this.crane.root);
			for (const w of this.crew) w.obj.parent?.remove(w.obj);
			this.frame = this.scaffold = this.fence = this.board = this.sparks = null;
			this.crane = null;
			this.crew = [];
			return;
		}
		// the floor going up: its bare concrete rising through the block
		if (this.frameAt !== built) {
			dispose(this.frame);
			this.frame = toObject(frameModel(p, built));
			this.frame.position.y = built * FLOOR_M;
			this.group.add(this.frame);
			this.frameAt = built;
		}
		this.frame!.scale.y = Math.max(0.12, (this.live % 3) / 3);
		if (this.scaffoldAt !== built) this.makeScaffold(p, built);
		if (!this.fence) this.makeFence();
		if (!this.crane) {
			this.crane = new Crane(new THREE.Vector3(-HALF - 1.3, 0, -1.5), heightOf(p) + 11, "#9a958c");
			this.group.add(this.crane.root);
		}
		this.crane.update(dt, this.topY, working);
		this.updateCrew(dt, working);
		// the crew talk now and then when someone is round
		const d = Math.hypot(me.x - this.group.position.x, me.z - this.group.position.z);
		if ((this.chat -= dt) <= 0) {
			this.chat = rand(18, 36);
			if (d < 45 && this.crew.length) {
				const c = this.row.crew.filter((x) => x.line);
				const lines = [
					`Floor ${built + 1} going up!`,
					"Mind your head down there!",
					"Pour it, pour it!",
					working ? "Every block, another layer." : "No block, no concrete.",
					`${this.row.architect.name} wants it perfect.`,
				];
				say(pickOne(this.crew).obj, c.length && Math.random() < 0.4 ? pickOne(c).line! : pickOne(lines));
			}
		}
	}

	private makeScaffold(p: Plan, f: number) {
		dispose(this.scaffold);
		const fp = footprint(p, Math.min(f, p.floors - 1));
		const ext = fp.rot ? Math.abs(Math.cos(fp.rot)) + Math.abs(Math.sin(fp.rot)) : 1;
		const hx = Math.min(HALF - 0.1, fp.hx * VOX * ext + 0.45),
			hz = Math.min(HALF - 0.1, fp.hz * VOX * ext + 0.45);
		const h = FLOOR_M * 2.4;
		const g = new THREE.Group();
		const poles: THREE.Matrix4[] = [];
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const one = new THREE.Vector3();
		const pole = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
			poles.push(m.clone().compose(one.set(x, y, z).clone(), q, new THREE.Vector3(sx, sy, sz)));
		for (const [ax, len, fixed] of [
			["x", hx, hz],
			["x", hx, -hz],
			["z", hz, hx],
			["z", hz, -hx],
		] as const) {
			for (let a = -len; a <= len + 0.01; a += (len * 2) / Math.max(2, Math.round(len / 0.9))) {
				const [x, z] = ax === "x" ? [a, fixed] : [fixed, a];
				pole(x, h / 2, z, 0.07, h, 0.07);
			}
			for (let y = 0.1; y <= h; y += FLOOR_M / 2) {
				const [x, z] = ax === "x" ? [0, fixed] : [fixed, 0];
				pole(x, y, z, ax === "x" ? len * 2 : 0.07, 0.07, ax === "z" ? len * 2 : 0.07);
			}
		}
		const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, poles.length);
		poles.forEach((mm, i) => inst.setMatrixAt(i, mm));
		g.add(inst);
		// safety netting over the top floor and a half
		for (const [w, x, z, ry] of [
			[hx * 2, 0, hz + 0.05, 0],
			[hx * 2, 0, -hz - 0.05, 0],
			[hz * 2, hx + 0.05, 0, Math.PI / 2],
			[hz * 2, -hx - 0.05, 0, Math.PI / 2],
		]) {
			const n = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.55), net);
			n.position.set(x, h * 0.72, z);
			n.rotation.y = ry;
			g.add(n);
		}
		g.position.y = Math.max(0, f - 1) * FLOOR_M;
		this.group.add(g);
		this.scaffold = g;
		this.scaffoldAt = f;
		// the crew stand on the slab of the floor going up
		if (!this.crew.length) {
			const n = 4;
			this.sparks = new THREE.Points(
				new THREE.BufferGeometry().setAttribute(
					"position",
					new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)
				),
				sparkMat
			);
			this.sparks.frustumCulled = false;
			this.group.add(this.sparks);
			for (let i = 0; i < n; i++) {
				const obj = worker();
				this.group.add(obj);
				this.crew.push({ obj, to: new THREE.Vector3(), wait: rand(0, 2), working: false });
			}
		}
		const room = (c: number) => (rand(-1, 1) * c) / 1.25;
		for (const w of this.crew) w.obj.position.set(room(hx - 0.6), this.topY + 0.34, room(hz - 0.6));
	}

	private updateCrew(dt: number, working: boolean) {
		const p = this.plan!;
		const fp = footprint(p, Math.min(this.built, p.floors - 1));
		const rx = fp.hx * VOX - 0.7,
			rz = fp.hz * VOX - 0.7;
		const y = this.topY + 0.34;
		const pos = this.sparks?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
		const t = performance.now() / 1000;
		this.crew.forEach((w, i) => {
			const o = w.obj;
			o.position.y = y;
			if ((w.wait -= dt) <= 0) {
				if (w.working || !working) {
					w.working = false;
					w.to.set(rand(-rx, rx), y, rand(-rz, rz));
					w.wait = 99;
				} else {
					w.working = true;
					w.wait = rand(2.5, 6);
				}
			}
			if (!w.working && w.wait > 50) {
				const dx = w.to.x - o.position.x,
					dz = w.to.z - o.position.z;
				const d = Math.hypot(dx, dz);
				if (d < 0.1) w.wait = working ? rand(0.2, 1) : rand(3, 8);
				else {
					const step = Math.min(d, dt * 0.9);
					o.position.x += (dx / d) * step;
					o.position.z += (dz / d) * step;
					o.rotation.y = Math.atan2(dx, dz);
					o.position.y += Math.abs(Math.sin(t * 9 + i)) * 0.04;
				}
			}
			if (w.working) o.position.y += Math.abs(Math.sin(t * 14 + i * 2)) * 0.05;
			if (pos) {
				const lit = w.working && Math.random() < 0.6;
				const fx = Math.sin(o.rotation.y) * 0.45,
					fz = Math.cos(o.rotation.y) * 0.45;
				pos.setXYZ(
					i,
					o.position.x + fx + rand(-0.06, 0.06),
					lit ? y + 0.7 + rand(-0.1, 0.1) : -999,
					o.position.z + fz + rand(-0.06, 0.06)
				);
			}
		});
		if (pos) pos.needsUpdate = true;
	}

	private makeFence() {
		const g = new THREE.Group();
		const h = 1.8;
		const mat = new THREE.MeshStandardMaterial({ map: HOARD.clone(), roughness: 0.9, side: THREE.DoubleSide });
		mat.map!.repeat.set((HALF * 2) / 6, 1);
		mat.map!.needsUpdate = true;
		for (const [x, z, ry] of [
			[0, HALF, 0],
			[0, -HALF, 0],
			[HALF, 0, Math.PI / 2],
			[-HALF, 0, Math.PI / 2],
		]) {
			const panel = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, h), mat);
			panel.position.set(x, h / 2, z);
			panel.rotation.y = ry;
			g.add(panel);
		}
		this.group.add(g);
		this.fence = g;
	}

	/** The board on the front hoarding: what goes up, by whom, how far along. */
	private drawBoard() {
		const r = this.row;
		if (r && this.done) return;
		if (!r && !this.next) {
			dispose(this.board);
			this.board = null;
			return;
		}
		const pct = r ? Math.floor((this.live / r.need) * 100) : 0;
		const stopped = !!r && !works?.working;
		const key = r ? `${r.round}:${pct}:${stopped}` : "next";
		if (key === this.boardKey) return;
		this.boardKey = key;
		const tex = canvasTex(512, 300, (g) => {
			g.fillStyle = "#0b0913";
			g.fillRect(0, 0, 512, 300);
			// hazard stripes along the top
			for (let x = -40; x < 512; x += 40) {
				g.fillStyle = "#f4b728";
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x + 20, 0);
				g.lineTo(x + 40, 28);
				g.lineTo(x + 20, 28);
				g.fill();
			}
			g.fillStyle = "#f4b728";
			g.font = "400 26px 'DotGothic16', monospace";
			g.fillText(r ? "建設中 UNDER CONSTRUCTION" : "予定地 NEXT SITE", 20, 66);
			g.fillStyle = "#ffffff";
			g.font = "400 40px 'DotGothic16', monospace";
			if (r) {
				g.fillText(r.name.slice(0, 22), 20, 120);
				g.font = "400 22px 'DotGothic16', monospace";
				g.fillStyle = "#c9c3d8";
				g.fillText(`by ${r.architect.name}, ${r.architect.job}`.slice(0, 40), 20, 156);
				g.fillStyle = "#2a2440";
				g.fillRect(20, 186, 472, 30);
				g.fillStyle = stopped ? "#f06b76" : "#38ff9c";
				g.fillRect(20, 186, (472 * pct) / 100, 30);
				g.fillStyle = "#ffffff";
				g.font = "400 24px 'DotGothic16', monospace";
				g.fillText(`${pct}%`, 26, 210);
				g.fillStyle = stopped ? "#f06b76" : "#c9c3d8";
				g.font = "400 22px 'DotGothic16', monospace";
				g.fillText(
					stopped
						? "WORK STOPPED · EMPTY BLOCK"
						: `FLOOR ${Math.min(r.plan.floors, this.built + 1)} OF ${r.plan.floors}`,
					20,
					262
				);
			} else {
				const s = works?.state;
				g.fillText("Vote open", 20, 120);
				g.font = "400 22px 'DotGothic16', monospace";
				g.fillStyle = "#c9c3d8";
				(s?.proposals ?? []).forEach((p, i) =>
					g.fillText(`${i + 1}. ${p.name}`.slice(0, 40), 20, 160 + i * 32)
				);
			}
		});
		if (!this.board) {
			this.board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshBasicMaterial({ map: tex }));
			this.board.position.set(0, 2.1, HALF + 0.08);
			this.group.add(this.board);
		} else {
			const m = this.board.material as THREE.MeshBasicMaterial;
			m.map?.dispose();
			m.map = tex;
		}
	}

	/** The building's name in neon over its door (and on its billboard). */
	private makeSign(p: Plan) {
		const hex = NEON[p.neon] ?? NEON.cyan;
		const tex = canvasTex(512, 96, (g) => {
			g.font = "400 64px 'DotGothic16', monospace";
			g.textAlign = "center";
			g.textBaseline = "middle";
			g.shadowColor = hex;
			g.shadowBlur = 18;
			g.fillStyle = "#ffffff";
			g.fillText(p.sign.slice(0, 14), 256, 50);
		});
		const mat = new THREE.MeshBasicMaterial({
			map: tex,
			transparent: true,
			toneMapped: false,
			color: new THREE.Color(1.8, 1.8, 1.8),
			depthWrite: false,
		});
		const fp = footprint(p, 0);
		this.sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), mat);
		this.sign.position.set(0, 3.2, fp.hz * VOX + 0.06);
		this.group.add(this.sign);
		if (p.crown === "billboard") {
			const b = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3), mat);
			b.position.set(0, p.floors * FLOOR_M + 3.5, 0.03);
			b.userData.billboard = true;
			this.sign.add(b);
			b.position.y -= this.sign.position.y;
			b.position.z -= this.sign.position.z;
			b.visible = false;
		}
	}

	showBillboard() {
		this.sign?.children.forEach((c) => (c.visible = this.done));
	}
}

let works: Works | null = null;

/**
 * The city works: the agents' quarter on Central Park's east side. Every round three of the day's
 * agents propose a building and visitors vote; the winner goes up on the next site, its crew
 * adding concrete with every mined block (an empty block stops them, a packed one counts double),
 * a crane swinging loads up, until it opens.
 */
export class Works {
	state: WorksState | null = null;
	readonly group = new THREE.Group();
	private sites: Site[];
	private panel: HTMLElement;
	private blockAt = performance.now();
	working = true;
	private previews = new Map<string, string>();
	private focus = -1;
	private loading = false;
	private again = 0;
	private anchor = new THREE.Object3D();

	constructor(
		scene: THREE.Scene,
		ui: HTMLElement,
		private renderer: THREE.WebGLRenderer,
		clock: ChainClock,
		private hud: GameHud,
		private decor: Decor,
		private hooks: WorksHooks
	) {
		works = this;
		scene.add(this.group, this.anchor);
		this.sites = worksSites().map((s) => new Site(s, this.group));
		this.panel = document.createElement("div");
		this.panel.className = "works hud";
		ui.append(this.panel);
		this.panel.addEventListener("click", (e) => {
			const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
			if (!a) return;
			if (a.dataset.a === "close") this.panel.classList.remove("open");
			if (a.dataset.a === "vote") void this.vote(Number(a.dataset.i));
			if (a.dataset.a === "go") {
				const s = this.sites[Number(a.dataset.i)];
				this.panel.classList.remove("open");
				if (s) this.hooks.go(s.at.cx + (s.at.face === "w" ? -14 : 14), s.at.cz);
			}
		});
		clock.onBlock((b) => {
			this.blockAt = performance.now();
			this.working = b.txs.length > 0;
			const site = this.active;
			if (site && !site.done) {
				const crew = site.row!.crew;
				if (!this.working) this.say(site, "No block, no concrete. Break!");
				else if (b.txs.length >= 15) this.say(site, "Packed block! Double shift!", true);
				else if (crew.length && Math.random() < 0.3) this.say(site, "Next layer!");
			}
			setTimeout(() => void this.load(), 3000);
		});
		void this.load();
	}

	/** The site going up now. */
	get active() {
		return this.sites.find((s) => s.row && !s.done) ?? null;
	}

	async load() {
		if (this.loading) return;
		this.loading = true;
		const s = await get<WorksState>("/v1/street/works");
		this.loading = false;
		if (s) this.apply(s);
	}

	/** Somebody voted or a site opened (presence ping): refetch soon. */
	changed() {
		clearTimeout(this.again);
		this.again = window.setTimeout(() => void this.load(), 1500);
	}

	apply(s: WorksState) {
		const first = !this.state;
		this.state = s;
		if (first) this.working = !s.stopped;
		const rows = new Map(s.sites.map((r) => [r.site, r]));
		const taken = s.sites.length;
		// the next site to be built: the first free one, else the oldest
		const free = this.sites.find((x) => !rows.has(x.at.id));
		const oldest = [...s.sites].sort((a, b) => a.round - b.round)[0];
		const nextId = free ? free.at.id : oldest?.site ?? 0;
		for (const site of this.sites) site.set(rows.get(site.at.id) ?? null, false);
		const busy = !!this.active;
		if (!busy) this.sites[nextId]?.set(rows.get(nextId) ?? null, taken < 20);
		this.news(s);
		if (this.panel.classList.contains("open")) this.render();
	}

	/** What's new since this browser last looked: the inbox gets it. */
	private news(s: WorksState) {
		const k = seen();
		if (s.round !== k.round && s.proposals.length) {
			this.hud.mail(
				"works",
				"City works: vote",
				s.proposals.map((p) => `${p.name} (${p.architect.name})`).join(" · "),
				{ label: "Vote", fn: () => this.open() }
			);
			k.round = s.round;
		}
		for (const r of s.sites) {
			const site = this.sites[r.site];
			const done = r.work >= r.need;
			if (k.sites[r.site] !== r.round && !done) {
				this.hud.mail(
					"works",
					`Works started: ${r.name}`,
					`${r.plan.floors} floors by ${r.architect.name}, ${r.architect.job}. Every block adds to it.`,
					{ label: "Go", fn: () => this.goTo(r.site) }
				);
			} else if (done && k.sites[r.site] === r.round && !k.done.includes(r.round)) {
				this.opened(r, site);
			}
			if (done && !k.done.includes(r.round)) k.done.push(r.round);
			k.sites[r.site] = r.round;
		}
		keep(k);
	}

	private opened(r: SiteRow, _site?: Site) {
		this.hud.mail(
			"works",
			`Opened: ${r.name}`,
			`${r.architect.name}'s ${r.plan.style}, ${r.plan.floors} floors, is finished.`,
			{ label: "Go", fn: () => this.goTo(r.site) }
		);
		this.decor.alert({
			kind: "game",
			title: "NEW BUILDING  竣工",
			big: r.name.toUpperCase(),
			line: `BY ${r.architect.name.toUpperCase()}`,
			color: NEON[r.plan.neon] ?? "#f4b728",
		});
	}

	private goTo(site: number) {
		const s = this.sites[site];
		if (s) this.hooks.go(s.at.cx + (s.at.face === "w" ? -14 : 14), s.at.cz);
	}

	private say(site: Site, text: string, shout = false) {
		if (!site.crew.length) return;
		sayAt(pickOne(site.crew).obj, text, shout ? "shout" : "talk", 2.1, 3.6);
	}

	update(dt: number) {
		if (!this.state) return;
		// mesh at most one piece a frame, the active site first
		const order = [...this.sites].sort((a, b) => Number(b === this.active) - Number(a === this.active));
		for (const s of order) if (s.mesh()) break;
		const since = Math.min(0.95, (performance.now() - this.blockAt) / BLOCK_MS);
		const me = this.hooks.near();
		for (const s of this.sites) {
			if (!s.row) {
				s.update(dt, 0, this.working, me, () => {});
				continue;
			}
			const work = s.row.work + (this.working && s.row.work < s.row.need ? since : 0);
			const was = s.done;
			s.update(dt, work, this.working, me, (o, text, shout) =>
				sayAt(o, text, shout ? "shout" : "talk", 2.1, 3.6)
			);
			if (!was && s.done) {
				// finished while you watched
				const k = seen();
				if (!k.done.includes(s.row.round)) {
					k.done.push(s.row.round);
					keep(k);
					this.opened(s.row, s);
				}
			}
			s.showBillboard();
		}
	}

	/** A click in the city: true when it was on a site. */
	click(ray: THREE.Raycaster) {
		const hit = ray.intersectObjects(
			this.sites.map((s) => s.hit),
			false
		)[0];
		if (!hit) return false;
		this.open(hit.object.userData.site as number);
		return true;
	}

	/** For the minimap: the site going up. */
	blip() {
		const a = this.active ?? this.sites.find((s) => s.next);
		return a ? { x: a.at.cx, z: a.at.cz, label: a.row ? a.row.name : "City works" } : null;
	}

	open(site = -1) {
		this.focus = site;
		this.panel.classList.add("open");
		this.render();
		void this.drawPreviews();
	}

	private render() {
		const s = this.state;
		if (!s) {
			this.panel.innerHTML = `<header><label>都市計画 · CITY WORKS</label><button data-a="close">×</button></header><div class="empty">The city's server didn't answer.</div>`;
			return;
		}
		const mine = seen().vote;
		const left = Math.max(0, s.end - (s.tip || 0));
		const hours = (left * 75) / 3600;
		const total = s.proposals.reduce((a, p) => a + p.votes, 0) || 1;
		const active = this.active;
		const built = this.sites.filter((x) => x.done && x.row);
		const focus = this.focus >= 0 ? this.sites[this.focus] : null;
		const card = (p: Proposal) => {
			const voted = mine?.round === s.round && mine.idx === p.idx;
			const pv = this.previews.get(`${s.round}:${p.idx}`);
			return `<article class="${voted ? "mine" : ""}" style="--n:${NEON[p.plan.neon] ?? "#f4b728"}">
        <div class="pv">${pv ? `<img src="${pv}" alt="">` : "<i></i>"}</div>
        <div class="tx">
          <h3>${esc(p.name)}</h3>
          <p class="by">${esc(p.architect.name)} · ${esc(p.architect.job)}</p>
          <p class="pitch">${esc(p.pitch)}</p>
          <p class="chips"><span>${esc(p.plan.style)}</span><span>${p.plan.floors} floors</span><span>${esc(
				p.plan.crown
			)}</span></p>
          ${
				p.backers.length
					? `<ul>${p.backers
							.slice(0, 2)
							.map((b) => `<li><b>${esc(b.name)}</b> ${esc(b.line ?? "")}</li>`)
							.join("")}${
							p.backers.length > 2 ? `<li class="more">+${p.backers.length - 2} agents</li>` : ""
					  }</ul>`
					: ""
			}
          <div class="bar"><i style="width:${Math.round((p.votes / total) * 100)}%"></i><span>${p.votes} vote${
				p.votes === 1 ? "" : "s"
			}</span></div>
          <button data-a="vote" data-i="${p.idx}" ${voted ? "disabled" : ""}>${voted ? "Your vote ✓" : "Vote"}</button>
        </div>
      </article>`;
		};
		const siteLine = (x: Site) => {
			const r = x.row!;
			const pct = Math.floor((x.live / r.need) * 100);
			return `<li><b>${esc(r.name)}</b><span>${
				x.done
					? `${r.plan.floors} floors`
					: `${pct}% · floor ${Math.min(r.plan.floors, x.built + 1)}/${r.plan.floors}`
			}</span><button data-a="go" data-i="${x.at.id}">Go ▸</button></li>`;
		};
		this.panel.innerHTML = `<header><label>都市計画 · CITY WORKS</label><button data-a="close">×</button></header>
      ${
			focus?.row
				? `<section class="focus"><h3>${esc(focus.row.name)}</h3><p class="by">${esc(
						focus.row.architect.name
				  )} · ${esc(focus.row.architect.job)} · ${focus.row.votes} vote${
						focus.row.votes === 1 ? "" : "s"
				  }</p><p class="pitch">${esc(focus.row.pitch)}</p></section>`
				: ""
		}
      <p class="sub">Round ${s.round.toLocaleString("en-US")} · vote closes in ${left} blocks (~${
			hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`
		})</p>
      <div class="cards">${s.proposals.map(card).join("")}</div>
      ${
			active?.row || built.length
				? `<ol class="sites">${active?.row ? siteLine(active) : ""}${built.map(siteLine).join("")}</ol>`
				: ""
		}`;
	}

	private async vote(idx: number) {
		const s = this.state;
		const token = visitorToken();
		if (!s || !token) return;
		try {
			const r = await fetch(`${API}/v1/street/works/vote`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ round: s.round, idx, token }),
			});
			if (!r.ok) throw new Error(String(r.status));
			const j = (await r.json()) as { votes: { idx: number; votes: number }[] };
			for (const p of s.proposals) p.votes = j.votes.find((v) => v.idx === p.idx)?.votes ?? 0;
			const k = seen();
			k.vote = { round: s.round, idx };
			keep(k);
			this.hud.say(`<b>Voted</b> · ${esc(s.proposals[idx]?.name ?? "")}`);
		} catch {
			this.hud.say("<b>Not counted</b> · the city's server didn't answer");
		}
		this.render();
	}

	/** Little renders of the three proposals for their cards (one per frame, kept). */
	private async drawPreviews() {
		const s = this.state;
		if (!s) return;
		for (const p of s.proposals) {
			const key = `${s.round}:${p.idx}`;
			if (this.previews.has(key)) continue;
			await new Promise((r) => requestAnimationFrame(r));
			this.previews.set(key, this.preview(p.plan));
			if (this.panel.classList.contains("open")) {
				const img = this.panel.querySelectorAll<HTMLElement>(".pv")[p.idx];
				if (img) img.innerHTML = `<img src="${this.previews.get(key)}" alt="">`;
			}
		}
	}

	private preview(p: Plan) {
		const parts: Geos[] = [];
		for (let f = 0; f < p.floors; f++) parts.push(geos(floorModel(p, f), f * FLOOR_M));
		parts.push(geos(crownModel(p), p.floors * FLOOR_M));
		const merged = merge(parts);
		for (const g of parts) for (const x of Object.values(g)) x?.dispose();
		const obj = meshes(merged, false);
		const scene = new THREE.Scene();
		scene.add(obj, new THREE.HemisphereLight("#dfe8ff", "#3a3040", 2.2));
		const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
		sun.position.set(6, 10, 8);
		scene.add(sun);
		const H = heightOf(p) + 10 * VOX * 6;
		const W = 160,
			Hh = 200;
		const span = Math.max(H * 0.62, 12);
		const cam = new THREE.OrthographicCamera(
			(-span * W) / Hh / 2,
			(span * W) / Hh / 2,
			span / 2,
			-span / 2,
			0.1,
			400
		);
		cam.position.set(30, H / 2 + 18, 40);
		cam.lookAt(0, H / 2 - 1, 0);
		cam.zoom = Math.min(1, (span * 0.95) / Math.max(H * 0.75, 1));
		cam.updateProjectionMatrix();
		const rt = new THREE.WebGLRenderTarget(W * 2, Hh * 2);
		rt.texture.colorSpace = THREE.SRGBColorSpace;
		const r = this.renderer;
		const prev = r.getRenderTarget();
		const clear = r.getClearColor(new THREE.Color());
		const alpha = r.getClearAlpha();
		r.setRenderTarget(rt);
		r.setClearColor(0x000000, 0);
		r.clear();
		r.render(scene, cam);
		const px = new Uint8Array(W * 2 * Hh * 2 * 4);
		r.readRenderTargetPixels(rt, 0, 0, W * 2, Hh * 2, px);
		r.setRenderTarget(prev);
		r.setClearColor(clear, alpha);
		rt.dispose();
		for (const x of Object.values(merged)) x?.dispose();
		const c = document.createElement("canvas");
		c.width = W * 2;
		c.height = Hh * 2;
		const g = c.getContext("2d")!;
		const img = g.createImageData(W * 2, Hh * 2);
		// the render target is upside down
		for (let y = 0; y < Hh * 2; y++)
			img.data.set(px.subarray((Hh * 2 - 1 - y) * W * 8, (Hh * 2 - y) * W * 8), y * W * 8);
		g.putImageData(img, 0, 0);
		return c.toDataURL("image/png");
	}

	/** Debug: show a state without the API. */
	debugState(s: WorksState) {
		this.apply(s);
	}
}
