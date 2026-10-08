import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORKS_VOX } from "../scene/city/plan";
import type { Kind } from "../scene/voxel/model";
import { C, E, G, VOX, VoxelModel, hash, rand } from "../scene/voxel/model";
import { meshModel } from "../scene/voxel/mesher";

/** An agent architect's building, as the API keeps it: a style and a few choices, drawn here. */
export interface Plan {
	style: string;
	floors: number;
	wall: string;
	glass: string;
	neon: string;
	crown: string;
	sign: string;
	seed: number;
}

export const WALL: Record<string, string> = {
	white: "#f2ece0",
	stone: "#cfc6b4",
	concrete: "#8a8073",
	slate: "#3b3a42",
	night: "#1c1b22",
	brick: "#a8553a",
	wood: "#7a4a2a",
	red: "#d0383a",
	gold: "#d9a63a",
	green: "#3a9a6a",
	blue: "#2e5ab8",
	violet: "#7a5ac0",
	pink: "#ff7aa8",
	teal: "#1baf7a",
};
export const GLASS: Record<string, string> = {
	sky: "#9fd8ff",
	dark: "#2a3a55",
	gold: "#e8c46a",
	green: "#4fbf8f",
	violet: "#8f7ad8",
};
export const NEON: Record<string, string> = {
	cyan: "#3ef0ff",
	pink: "#ff3e8a",
	violet: "#b07bff",
	green: "#38ff9c",
	gold: "#f4b728",
	white: "#ffffff",
	red: "#ff4a4a",
};

/** Voxels a floor. */
export const FH = 20;
const N = WORKS_VOX;
const MID = N / 2;

interface Foot {
	hx: number;
	hz: number;
	rot: number;
}

/** The floor plan of floor `f`: half sizes (voxels) and a turn (the twisted tower). */
export function footprint(p: Plan, f: number): Foot {
	const F = p.floors;
	const t = f / F;
	switch (p.style) {
		case "tower": {
			const h = t < 0.55 ? 29 : t < 0.85 ? 25 : 21;
			return { hx: h, hz: h - 3, rot: 0 };
		}
		case "deco": {
			const h = 29 - Math.floor(t * 4) * 4;
			return { hx: h, hz: h, rot: 0 };
		}
		case "pagoda": {
			const h = Math.round(25 - (f / Math.max(1, F - 1)) * 9);
			return { hx: h, hz: h, rot: 0 };
		}
		case "market":
			return f === 0 ? { hx: 30, hz: 30, rot: 0 } : { hx: 28, hz: 27, rot: 0 };
		case "garden":
			return { hx: 25 - (f % 2) * 2, hz: 25 - ((f + 1) % 2) * 2, rot: 0 };
		case "twist":
			return { hx: 22, hz: 22, rot: (t * Math.PI) / 2 };
		default:
			return { hx: 26, hz: 26, rot: 0 };
	}
}

function inside(fp: Foot, x: number, z: number) {
	const lx = x + 0.5 - MID,
		lz = z + 0.5 - MID;
	if (!fp.rot) return Math.abs(lx) <= fp.hx && Math.abs(lz) <= fp.hz;
	const c = Math.cos(fp.rot),
		s = Math.sin(fp.rot);
	return Math.abs(lx * c + lz * s) <= fp.hx && Math.abs(-lx * s + lz * c) <= fp.hz;
}

const lum = (hex: string) => {
	const c = new THREE.Color(hex);
	return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
};

function colors(p: Plan) {
	const wallHex = WALL[p.wall] ?? WALL.white;
	const neonHex = NEON[p.neon] ?? NEON.cyan;
	return {
		wall: C(wallHex),
		trim: C(lum(wallHex) > 0.45 ? "#3b3a42" : "#cfc6b4"),
		glass: G(GLASS[p.glass] ?? GLASS.sky),
		lit: E("#ffe3a3", 1.6),
		neon: E(neonHex, 2.2),
		door: G("#1c2433"),
		roof: C(p.style === "pagoda" ? (lum(wallHex) > 0.45 ? "#2a2f3a" : "#a8553a") : "#3b3a42"),
		leaves: [C("#5f8f4a"), C("#3a9a6a"), C("#7fb069")],
		blossom: C("#ff9ac0"),
		soil: C("#4a3a2a"),
		concrete: C("#9a958c"),
	};
}

/** One floor of the building, with its facade (front faces +z). */
export function floorModel(p: Plan, f: number) {
	const m = new VoxelModel(N, FH, N);
	const fp = footprint(p, f);
	const k = colors(p);
	const seed = p.seed + f * 977;
	const r = rand(seed);
	for (let z = 0; z < N; z++)
		for (let x = 0; x < N; x++) {
			if (!inside(fp, x, z)) continue;
			const edgeX = !inside(fp, x - 1, z) || !inside(fp, x + 1, z);
			const edgeZ = !inside(fp, x, z - 1) || !inside(fp, x, z + 1);
			if (!edgeX && !edgeZ) {
				m.box(x, 0, z, x + 1, FH, z + 1, k.trim);
				continue;
			}
			// the running coordinate along this face, for window bays
			const col = edgeZ ? x : z;
			const side = edgeZ ? (z < MID ? 0 : 1) : x < MID ? 2 : 3;
			for (let y = 0; y < FH; y++) {
				let c = k.wall;
				const lit = (bay: number) => (hash(bay, f, side, p.seed) < 0.32 ? k.lit : k.glass);
				if (y < 2) c = k.trim;
				else
					switch (p.style) {
						case "tower":
						case "twist":
							c = col % 5 === 0 ? k.trim : y > 2 && y < 18 ? lit(Math.floor(col / 5)) : k.trim;
							break;
						case "deco":
							c =
								col % 6 === 0
									? k.wall
									: col % 6 >= 2 && col % 6 <= 4 && y > 4 && y < 16
									? lit(Math.floor(col / 6))
									: k.wall;
							if (y === FH - 1 && f % 4 === 3) c = k.neon;
							break;
						case "pagoda":
							c =
								col % 8 >= 3 && col % 8 <= 5 && y > 4 && y < 14
									? hash(Math.floor(col / 8), f, side, p.seed) < 0.6
										? k.lit
										: k.door
									: col % 8 === 0
									? k.roof
									: k.wall;
							break;
						case "market":
							if (f === 0)
								c = col % 8 === 0 || y > 16 ? (y > 16 ? k.neon : k.wall) : y < 15 ? k.lit : k.wall;
							else c = col % 7 === 0 || y < 3 ? k.wall : y < 17 ? k.glass : k.wall;
							break;
						default:
							c = col % 6 >= 1 && col % 6 <= 4 && y > 4 && y < 15 ? lit(Math.floor(col / 6)) : k.wall;
					}
				m.set(x, y, z, c);
			}
		}
	// the ground floor's way in and its neon band, on the front
	if (f === 0) {
		const front = MID + fp.hz - 1;
		m.box(MID - 5, 2, front, MID + 5, 13, front + 1, k.door);
		m.box(MID - 14, 14, front, MID + 14, 17, front + 1, k.neon);
	}
	// a pagoda's roof on every tier, its corners turned up
	if (p.style === "pagoda") {
		const o = 4;
		m.box(MID - fp.hx - o, FH - 3, MID - fp.hz - o, MID + fp.hx + o, FH - 1, MID + fp.hz + o, k.roof);
		for (const [sx, sz] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		]) {
			const cx = sx < 0 ? MID - fp.hx - o : MID + fp.hx + o - 1,
				cz = sz < 0 ? MID - fp.hz - o : MID + fp.hz + o - 1;
			m.box(cx, FH - 1, cz, cx + 1, FH, cz + 1, k.roof);
			m.set(cx, FH - 2, cz, k.neon);
		}
	}
	// the garden tower: planters and trees on the terraces
	if (p.style === "garden") {
		for (let t = 0; t < 3; t++) {
			const ang = r() * Math.PI * 2;
			const px = MID + Math.round(Math.cos(ang) * (fp.hx + 2.5)),
				pz = MID + Math.round(Math.sin(ang) * (fp.hz + 2.5));
			m.box(px - 3, 0, pz - 2, px + 3, 3, pz + 2, k.soil);
			m.blob(px, 7, pz, 3.6, r() < 0.2 ? k.blossom : k.leaves[Math.floor(r() * 3)], 0.3, seed + t);
		}
	}
	return m;
}

/** The roof: spire, antenna, dome, garden, helipad, billboard frame or a plain roof with tanks. */
export function crownModel(p: Plan) {
	const m = new VoxelModel(N, 64, N);
	const fp = footprint(p, p.floors - 1);
	const k = colors(p);
	const r = rand(p.seed + 31);
	const h = Math.min(fp.hx, fp.hz);
	if (p.style !== "pagoda" && p.crown !== "dome")
		for (let z = 0; z < N; z++)
			for (let x = 0; x < N; x++) {
				if (!inside(fp, x, z)) continue;
				const edge =
					!inside(fp, x - 1, z) || !inside(fp, x + 1, z) || !inside(fp, x, z - 1) || !inside(fp, x, z + 1);
				m.box(x, 0, z, x + 1, edge ? 3 : 1, z + 1, edge ? k.trim : k.roof);
			}
	switch (p.crown) {
		case "spire":
			for (let y = 0; y < 52; y++)
				m.cylinder(MID, y, MID, Math.max(0.8, 7 * (1 - y / 54)), 1, y % 9 === 4 ? k.neon : k.trim);
			m.box(MID - 1, 52, MID - 1, MID + 1, 58, MID + 1, E("#ffffff", 3));
			break;
		case "antenna":
			m.box(MID - 6, 1, MID - 6, MID + 6, 8, MID + 6, k.trim);
			m.box(MID - 1, 8, MID - 1, MID + 1, 56, MID + 1, k.trim);
			for (let y = 16; y < 56; y += 10) m.box(MID - 4, y, MID, MID + 4, y + 1, MID + 1, k.trim);
			m.box(MID - 1, 56, MID - 1, MID + 1, 58, MID + 1, E("#ff3030", 3));
			break;
		case "dome": {
			const R = Math.max(8, h * 0.85);
			for (let y = 0; y < R; y++)
				m.cylinder(MID, y, MID, Math.sqrt(R * R - y * y), 1, y === 0 ? k.neon : k.glass);
			m.box(MID - 1, R, MID - 1, MID + 1, R + 6, MID + 1, k.neon);
			break;
		}
		case "garden":
			for (let t = 0; t < 6; t++) {
				const tx = MID + (r() - 0.5) * (fp.hx * 1.4),
					tz = MID + (r() - 0.5) * (fp.hz * 1.4);
				m.box(tx, 1, tz, tx + 1, 6, tz + 1, C("#6b4a2a"));
				m.blob(tx, 9, tz, 3.5 + r() * 2.5, r() < 0.25 ? k.blossom : k.leaves[t % 3], 0.3, p.seed + t);
			}
			break;
		case "helipad": {
			const s = Math.min(h - 2, 20);
			m.box(MID - s, 3, MID - s, MID + s, 4, MID + s, C("#2f3138"));
			const w = E("#ffffff", 2.2);
			m.box(MID - 5, 4, MID - 6, MID - 3, 5, MID + 6, w);
			m.box(MID + 3, 4, MID - 6, MID + 5, 5, MID + 6, w);
			m.box(MID - 3, 4, MID - 1, MID + 3, 5, MID + 1, w);
			for (const [x, z] of [
				[-s, -s],
				[s - 1, -s],
				[-s, s - 1],
				[s - 1, s - 1],
			])
				m.box(MID + x, 4, MID + z, MID + x + 1, 5, MID + z + 1, k.neon);
			break;
		}
		case "billboard":
			m.box(MID - 14, 1, MID - 1, MID - 12, 12, MID + 1, k.trim);
			m.box(MID + 12, 1, MID - 1, MID + 14, 12, MID + 1, k.trim);
			m.box(MID - 17, 12, MID - 1, MID + 17, 30, MID, k.trim);
			m.box(MID - 17, 11, MID, MID + 17, 12, MID + 1, k.neon);
			break;
		default:
			m.cylinder(MID + h * 0.4, 1, MID - h * 0.4, 4, 9, C("#7a4a2a"));
			m.box(MID - h * 0.6, 1, MID - 3, MID - h * 0.6 + 6, 5, MID + 3, C("#8a8073"));
			m.box(MID - h * 0.6, 1, MID + 5, MID - h * 0.6 + 6, 5, MID + 9, C("#8a8073"));
	}
	if (p.style === "pagoda") {
		// the sōrin: a gold finial with rings
		for (let y = 0; y < 30; y++)
			m.cylinder(MID, y, MID, y % 5 === 2 ? 3 : 1.2, 1, y % 5 === 2 ? C("#d9a63a") : k.trim);
		m.box(MID - 1, 30, MID - 1, MID + 1, 33, MID + 1, k.neon);
	}
	return m;
}

/** The bare concrete of the floor going up: its slab and columns. */
export function frameModel(p: Plan, f: number) {
	const m = new VoxelModel(N, FH, N);
	const fp = footprint(p, f);
	const k = colors(p);
	for (let z = 0; z < N; z++)
		for (let x = 0; x < N; x++) {
			if (!inside(fp, x, z)) continue;
			m.set(x, 0, z, k.concrete);
			m.set(x, 1, z, k.concrete);
			if ((x - MID) % 10 === 0 && (z - MID) % 10 === 0) m.box(x, 2, z, x + 2, FH, z + 2, k.concrete);
		}
	return m;
}

export type Geos = Partial<Record<Kind, THREE.BufferGeometry>>;

/** A model's geometry by material, raised by `y` metres. */
export function geos(m: VoxelModel, y = 0): Geos {
	const g = meshModel(m) as Geos;
	if (y) for (const k of Object.values(g)) k?.translate(0, y, 0);
	return g;
}

/** Several pieces' geometry merged per material (one draw call each). */
export function merge(parts: Geos[]): Geos {
	const out: Geos = {};
	for (const kind of ["solid", "glass", "emit"] as Kind[]) {
		const list = parts.map((p) => p[kind]).filter((g): g is THREE.BufferGeometry => !!g);
		if (list.length) out[kind] = list.length === 1 ? list[0].clone() : mergeGeometries(list) ?? undefined;
	}
	return out;
}

/** Height of a building (metres): its floors and the tallest a crown goes. */
export const heightOf = (p: Plan) => p.floors * FH * VOX;
