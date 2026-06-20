// Build static/sunshine.json from Wikipedia's "List of cities by sunshine
// duration" — real recorded bright-sunshine climate normals (monthly hours)
// sourced from national meteorological services.
//
// Steps:
//   1. Parse the cached wikitext tables into {country, city, months[12]}.
//   2. Geocode each city to lat/lon: first by matching the population-bearing
//      GeoNames mirror (mourner/all-the-cities), then falling back to the
//      Open-Meteo geocoding API for the few that don't match.
//   3. Convert monthly totals -> average sunshine hours per day, sort by
//      sunniest, and write the compact dataset the map loads.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
mkdirSync(CACHE, { recursive: true });
const OUT = join(__dirname, '..', 'static', 'sunshine.json');
const GEO_CACHE = join(CACHE, 'wiki-geocode.json');

const UA = 'sunmap-build/1.0 (https://github.com/nathanotal/nathan)';

// Download an input to the cache if it isn't there yet (keeps the build
// reproducible from a clean checkout).
async function ensure(path, url, label) {
	if (existsSync(path)) return readFileSync(path, 'utf8');
	console.log('Downloading', label, '…');
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${label}`);
	const text = await res.text();
	writeFileSync(path, text);
	return text;
}

const wikiUrl = (page) =>
	`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;

await ensure(
	join(CACHE, 'wiki-sunshine.json'),
	wikiUrl('List_of_cities_by_sunshine_duration'),
	'Wikipedia sunshine list'
);
await ensure(
	join(CACHE, 'wiki-sunshine-europe.json'),
	wikiUrl('List_of_cities_in_Europe_by_sunshine_duration'),
	'Wikipedia Europe sunshine list'
);
await ensure(
	join(CACHE, 'all-the-cities.json'),
	'https://raw.githubusercontent.com/mourner/all-the-cities/master/cities.json',
	'GeoNames cities (for geocoding)'
);

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\./g, '')
		.trim();

// ---- 1. Parse the Wikipedia tables ------------------------------------------

// The main page transcludes Europe from a separate article, so parse both.
const wiki = [
	JSON.parse(readFileSync(join(CACHE, 'wiki-sunshine.json'), 'utf8')).parse.wikitext,
	JSON.parse(readFileSync(join(CACHE, 'wiki-sunshine-europe.json'), 'utf8')).parse.wikitext
].join('\n');

function linkText(cell) {
	const m = cell.match(/\[\[([^\]]+)\]\]/);
	let t = m ? m[1] : cell;
	if (t.includes('|')) t = t.slice(t.lastIndexOf('|') + 1); // [[Target|Display]]
	return t
		.replace(/<br\s*\/?>/gi, ' ') // "Oklahoma<br />City" -> "Oklahoma City"
		.replace(/<[^>]*>/g, '')
		.replace(/'''?/g, '')
		.replace(/\s+/g, ' ')
		.replace(/-\s+/g, '-') // "Petropavlovsk- Kamchatsky" -> "Petropavlovsk-Kamchatsky"
		.trim();
}

// City-name variants to try when geocoding (handles "(OR)", ", D.C.", trailing
// " City", and ASCII-folded spellings).
function queryVariants(city) {
	const base = city.replace(/\([^)]*\)/g, '').replace(/,.*$/, '').trim();
	const variants = new Set([city, base]);
	if (/ City$/.test(base)) variants.add(base.replace(/ City$/, '').trim());
	for (const v of [...variants]) {
		const ascii = v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
		variants.add(ascii);
	}
	return [...variants].filter(Boolean);
}
function numVal(cell) {
	const nums = cell.match(/[0-9][0-9,]*\.?[0-9]*/g);
	if (!nums) return null;
	const v = Number(nums[nums.length - 1].replace(/,/g, '')); // displayed value is last
	return Number.isFinite(v) ? v : null;
}

const records = [];
let currentCountry = '';
const tables = wiki.split(/\{\|\s*class="wikitable/).slice(1);
for (const t of tables) {
	const body = t.split(/\n\|\}/)[0];
	for (const rawRow of body.split(/\n\|-/)) {
		const cut = rawRow.split('<ref')[0]; // drop the trailing Ref column
		const cells = cut
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.startsWith('|') && !l.startsWith('|+') && !l.startsWith('|-'))
			.map((l) => l.replace(/^\|/, '').trim());
		if (rawRow.includes('! City') || rawRow.includes('!City')) continue; // header

		let country, city, monthCells;
		if (cells.length >= 14) {
			country = linkText(cells[0]);
			city = linkText(cells[1]);
			monthCells = cells.slice(2, 14);
			currentCountry = country;
		} else if (cells.length === 13) {
			country = currentCountry;
			city = linkText(cells[0]);
			monthCells = cells.slice(1, 13);
		} else {
			continue;
		}
		const months = monthCells.map(numVal);
		if (!city || months.filter((v) => v != null).length < 6) continue;
		records.push({ country, city, months });
	}
}
console.log('Parsed', records.length, 'city rows from Wikipedia');

// ---- 2. Geocode -------------------------------------------------------------

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const all = JSON.parse(readFileSync(join(CACHE, 'all-the-cities.json'), 'utf8'));
const byName = new Map(); // normalized name -> [{cc, ccName, lat, lon, pop}]
for (const c of all) {
	const k = norm(c.name);
	let arr = byName.get(k);
	if (!arr) byName.set(k, (arr = []));
	let ccName = c.country;
	try {
		ccName = regionNames.of(c.country) || c.country;
	} catch {
		/* keep code */
	}
	arr.push({ ccName, lat: c.lat, lon: c.lon, pop: c.population });
}

// A few country-name aliases between Wikipedia and Intl.DisplayNames.
const countryAlias = {
	'ivory coast': "cote d'ivoire",
	'united states': 'united states',
	'czech republic': 'czechia',
	'democratic republic of the congo': 'congo - kinshasa',
	'republic of the congo': 'congo - brazzaville',
	'south korea': 'south korea',
	'north korea': 'north korea',
	'russia': 'russia',
	'cape verde': 'cape verde',
	'myanmar': 'myanmar (burma)'
};
const countryMatch = (wikiCountry, ccName) => {
	const a = norm(wikiCountry);
	const b = norm(ccName);
	return a === b || countryAlias[a] === b || b.includes(a) || a.includes(b);
};

const geoCache = existsSync(GEO_CACHE) ? JSON.parse(readFileSync(GEO_CACHE, 'utf8')) : {};

function localMatch(city, country) {
	const cands = byName.get(norm(city));
	if (!cands || !cands.length) return null;
	const inCountry = cands.filter((c) => countryMatch(country, c.ccName));
	const pool = inCountry.length ? inCountry : cands;
	return pool.reduce((a, b) => (b.pop > a.pop ? b : a));
}

async function apiGeocode(city, country) {
	const key = `${city}|${country}`;
	if (geoCache[key] !== undefined) return geoCache[key];
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
		city
	)}&count=10&language=en&format=json`;
	let result = null;
	try {
		const res = await fetch(url);
		if (res.ok) {
			const j = await res.json();
			const list = j.results || [];
			const inC = list.filter((r) => countryMatch(country, r.country || ''));
			const pick = (inC.length ? inC : list).sort(
				(a, b) => (b.population || 0) - (a.population || 0)
			)[0];
			if (pick) result = { lat: pick.latitude, lon: pick.longitude, pop: pick.population || 0 };
		}
	} catch {
		/* leave null */
	}
	geoCache[key] = result;
	writeFileSync(GEO_CACHE, JSON.stringify(geoCache));
	await sleep(250);
	return result;
}

const cities = [];
let local = 0;
let api = 0;
let missed = 0;
for (const r of records) {
	const variants = queryVariants(r.city);
	let g = null;
	for (const v of variants) if ((g = localMatch(v, r.country))) break;
	if (g) local++;
	else {
		for (const v of variants) if ((g = await apiGeocode(v, r.country))) break;
		if (g) api++;
	}
	if (!g) {
		missed++;
		console.warn('  no coords:', r.city, r.country);
		continue;
	}
	const sun = r.months.map((v, m) => (v == null ? null : Math.round((v / DAYS[m]) * 10) / 10));
	cities.push({
		name: r.city,
		country: r.country,
		lat: Math.round(g.lat * 10000) / 10000,
		lon: Math.round(g.lon * 10000) / 10000,
		pop: g.pop || 0,
		sun
	});
}
console.log(`Geocoded: ${local} local, ${api} via API, ${missed} unmatched`);

// ---- 3. Write the dataset ---------------------------------------------------

// Dedupe by rounded coordinate (some names resolve to the same place); keep the
// richer record. Then sort sunniest-first for the table.
const seen = new Map();
for (const c of cities) {
	const key = `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
	if (!seen.has(key)) seen.set(key, c);
}
const final = [...seen.values()].sort((a, b) => {
	const av = a.sun.filter((v) => v != null);
	const bv = b.sun.filter((v) => v != null);
	const aa = av.reduce((s, v) => s + v, 0) / (av.length || 1);
	const bb = bv.reduce((s, v) => s + v, 0) / (bv.length || 1);
	return bb - aa;
});

const out = {
	meta: {
		source: 'Wikipedia: List of cities by sunshine duration',
		url: 'https://en.wikipedia.org/wiki/List_of_cities_by_sunshine_duration',
		variables: ['sunshine duration (recorded bright-sunshine hours)'],
		period: 'long-term climate normals',
		note: 'Recorded monthly bright-sunshine hours from national meteorological-service climate normals, compiled on Wikipedia. Shown as average sunshine hours per day for each calendar month. Coordinates geocoded via GeoNames / Open-Meteo.',
		generated: new Date().toISOString().slice(0, 10)
	},
	n: final.length,
	names: final.map((c) => c.name).join('\n'),
	country: final.map((c) => c.country).join('\n'),
	lat: final.map((c) => c.lat),
	lon: final.map((c) => c.lon),
	pop: final.map((c) => c.pop),
	sun: final.map((c) => c.sun),
	rad: final.map(() => new Array(12).fill(null)) // no radiation from this source
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${final.length} cities to ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
console.log('Sunniest:', final[0].name, final[0].country, final[0].sun);
