/**
 * Who every zkSNARK is: a persona that is a pure function of its number, the same here as in the
 * API (api/crates/api/src/street_agents.rs: same lists, same hash), so a passer-by has a name the
 * moment you meet them.
 */
const NAMES = [
	"Mika",
	"Yuna",
	"Kenji",
	"Amara",
	"Leo",
	"Ines",
	"Rafa",
	"Noor",
	"Sora",
	"Theo",
	"Lina",
	"Omar",
	"Hana",
	"Jules",
	"Priya",
	"Bruno",
	"Aiko",
	"Malik",
	"Zoe",
	"Ivan",
	"Nadia",
	"Kofi",
	"Elena",
	"Ren",
	"Sami",
	"Chloe",
	"Tariq",
	"Mei",
	"Felix",
	"Ayla",
	"Diego",
	"Rin",
	"Yara",
	"Hugo",
	"Lea",
	"Emeka",
	"Kaito",
	"Sofia",
	"Bilal",
	"Nina",
	"Arjun",
	"Maya",
	"Oskar",
	"Lucia",
	"Jin",
	"Farah",
	"Tomas",
	"Asha",
	"Paolo",
	"Rosa",
	"Kai",
	"Dalia",
	"Mateo",
	"Yusuf",
	"Clara",
	"Hiro",
	"Selin",
	"Andre",
	"Maud",
	"Idris",
	"Vera",
	"Ezra",
	"Luz",
	"Nico",
];
const JOBS = [
	"barista at the corner café",
	"night-shift miner at the Proof Factory",
	"bus driver on the block line",
	"parcel courier for the MEMPOOL HQ",
	"street musician",
	"librarian at the Binhai Library",
	"trader on the Reserve's floor",
	"noodle-stall cook",
	"retired cryptographer",
	"art student",
	"security guard at the Museum",
	"taxi driver",
	"gardener in Central Park",
	"journalist for the ZStreet Daily",
	"pixel-art painter",
	"arcade owner in ZK Tower",
	"nurse",
	"skateboarder with no job",
	"wallet developer",
	"flower seller",
	"tour guide",
	"chef at the Marina hotel",
	"stadium groundskeeper",
	"pigeon whisperer",
];
const TRAITS = [
	"cheerful and chatty",
	"grumpy but kind underneath",
	"anxious, checks the mempool too often",
	"dreamy and poetic",
	"competitive, bets on everything",
	"shy, speaks softly",
	"sarcastic",
	"endlessly curious",
	"calm and wise",
	"dramatic, everything is huge news",
	"a gossip who knows everyone",
	"a conspiracy theorist (harmless)",
];
const TAKES = [
	"privacy is a human right, shielded by default",
	"still uses a transparent address and feels judged",
	"a Zcash OG since the Sprout days",
	"just learned what a viewing key is and loves it",
	"thinks every empty block is a bad omen",
	"loves Orchard and never stops saying so",
	"counts the days until NU7",
	"doesn't care about crypto, loves the city",
	"keeps a paper wallet in a sock",
	"wants everyone to shield their coins",
	"thinks miners are the real heroes",
	"is sure the zkSNARK on the statue winks at night",
];
const HOMES = [
	"Midtown",
	"Parkside",
	"Uptown",
	"the West End",
	"the Finance district",
	"the Marina",
	"the South Bank",
	"the Port",
	"the shōtengai",
	"Downtown",
];

export interface Persona {
	id: number;
	name: string;
	job: string;
	trait: string;
	take: string;
	home: string;
}

const U64 = (1n << 64n) - 1n;
function mix(v: bigint) {
	let x = (v + 0x9e3779b97f4a7c15n) & U64;
	x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
	x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & U64;
	return x ^ (x >> 31n);
}
const pick = (list: string[], id: number, salt: number) =>
	list[Number(mix(BigInt(id) * 131n + BigInt(salt)) % BigInt(list.length))];

const cache = new Map<number, Persona>();
export function persona(id: number): Persona {
	let p = cache.get(id);
	if (!p)
		cache.set(
			id,
			(p = {
				id,
				name: pick(NAMES, id, 1),
				job: pick(JOBS, id, 2),
				trait: pick(TRAITS, id, 3),
				take: pick(TAKES, id, 4),
				home: pick(HOMES, id, 5),
			})
		);
	return p;
}
