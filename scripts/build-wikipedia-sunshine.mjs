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
		variants.add(v.replace(/-/g, ' ')); // "Dar-es-Salaam" -> "Dar es Salaam"
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
const byName = new Map(); // normalized name -> [{cc, lat, lon, pop}]
for (const c of all) {
	const k = norm(c.name);
	let arr = byName.get(k);
	if (!arr) byName.set(k, (arr = []));
	arr.push({ cc: c.country, lat: c.lat, lon: c.lon, pop: c.population });
}

// Map a Wikipedia country name -> ISO2 code. Most resolve straight through
// Intl.DisplayNames; the alias table covers spellings/territories it misses.
const nameToCC = new Map();
for (const cc of new Set(all.map((c) => c.country))) {
	try {
		const nm = regionNames.of(cc);
		if (nm) nameToCC.set(norm(nm), cc);
	} catch {
		/* skip */
	}
}
for (const [k, v] of Object.entries({
	'ivory coast': 'CI',
	'czech republic': 'CZ',
	'democratic republic of the congo': 'CD',
	'republic of the congo': 'CG',
	congo: 'CG',
	'south korea': 'KR',
	'north korea': 'KP',
	myanmar: 'MM',
	'cape verde': 'CV',
	russia: 'RU',
	'united states': 'US',
	'usa (american samoa)': 'AS',
	'american samoa': 'AS',
	'saint pierre and miquelon': 'PM',
	'falkland islands': 'FK',
	'puerto rico': 'PR',
	'french guiana': 'GF',
	'united kingdom': 'GB',
	tanzania: 'TZ',
	vietnam: 'VN',
	laos: 'LA',
	syria: 'SY',
	moldova: 'MD',
	bolivia: 'BO',
	venezuela: 'VE',
	iran: 'IR',
	taiwan: 'TW'
}))
	nameToCC.set(k, v);
// Some Wikipedia "countries" cover several ISO codes (special admin regions).
const ccExtra = { china: ['CN', 'HK', 'MO'] };
const ccFor = (country) => {
	const k = norm(country);
	if (ccExtra[k]) return ccExtra[k];
	const c = nameToCC.get(k);
	return c ? [c] : null;
};

const geoCache = existsSync(GEO_CACHE) ? JSON.parse(readFileSync(GEO_CACHE, 'utf8')) : {};

// Local match: require the country code to agree so "Seville" can't resolve to
// Seville, Ohio. Returns null when no same-country candidate exists.
function localMatch(city, expectCC) {
	const cands = byName.get(norm(city));
	if (!cands || !cands.length) return null;
	const pool = expectCC ? cands.filter((c) => expectCC.includes(c.cc)) : cands;
	if (!pool.length) return null;
	return pool.reduce((a, b) => (b.pop > a.pop ? b : a));
}

async function apiGeocode(city, expectCC) {
	const key = `${city}|${expectCC ? expectCC.join(',') : ''}`;
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
			const inC = expectCC ? list.filter((r) => expectCC.includes(r.country_code)) : list;
			const pool = inC.length ? inC : expectCC ? [] : list; // don't accept wrong country
			const pick = pool.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
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
	const expectCC = ccFor(r.country);
	const variants = queryVariants(r.city);
	let g = null;
	for (const v of variants) if ((g = localMatch(v, expectCC))) break;
	if (g) local++;
	else {
		for (const v of variants) if ((g = await apiGeocode(v, expectCC))) break;
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
