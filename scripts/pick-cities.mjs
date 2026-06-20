// Pick the ~5,000 most populous cities on Earth.
//
// static/cities.json (the 169k points drawn on the map) carries no population,
// so we rank from a population-bearing GeoNames mirror instead:
//   mourner/all-the-cities — 138,398 cities with population >= 1000.
// Output: scripts/.cache/top-cities.json, an array sorted by population desc.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
mkdirSync(CACHE, { recursive: true });

const SOURCE =
	'https://raw.githubusercontent.com/mourner/all-the-cities/master/cities.json';
const RAW = join(CACHE, 'all-the-cities.json');
const OUT = join(CACHE, 'top-cities.json');
const COUNT = 5000;

async function download() {
	if (existsSync(RAW)) {
		console.log('Using cached', RAW);
		return JSON.parse(readFileSync(RAW, 'utf8'));
	}
	console.log('Downloading', SOURCE);
	const res = await fetch(SOURCE);
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching city source`);
	const text = await res.text();
	writeFileSync(RAW, text);
	console.log(`Saved ${(text.length / 1e6).toFixed(1)} MB to cache`);
	return JSON.parse(text);
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(cc) {
	if (!cc || cc.length !== 2) return cc || '';
	try {
		return regionNames.of(cc) || cc;
	} catch {
		return cc;
	}
}

const all = await download();
console.log('Loaded', all.length, 'cities');

const top = all
	.filter((c) => Number.isFinite(c.population) && Number.isFinite(c.lat) && Number.isFinite(c.lon))
	.sort((a, b) => b.population - a.population)
	.slice(0, COUNT)
	.map((c) => ({
		name: c.name,
		cc: c.country,
		country: countryName(c.country),
		lat: Math.round(c.lat * 10000) / 10000,
		lon: Math.round(c.lon * 10000) / 10000,
		population: c.population
	}));

writeFileSync(OUT, JSON.stringify(top));
console.log(`Wrote ${top.length} cities to ${OUT}`);
console.log('Largest:', top[0].name, top[0].country, top[0].population.toLocaleString());
console.log('Smallest in set:', top[top.length - 1].name, top[top.length - 1].country, top[top.length - 1].population.toLocaleString());
