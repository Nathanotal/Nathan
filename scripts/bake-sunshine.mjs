// Combine the fetched climatology cache into static/sunshine.json.
//
// Reads scripts/.cache/top-cities.json + sunshine-progress.json and emits a
// compact, self-contained dataset the map can load directly. Only cities that
// have been fetched are included, so this can be run at any point to bake
// whatever has been collected so far.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
const OUT = join(__dirname, '..', 'static', 'sunshine.json');

const cities = JSON.parse(readFileSync(join(CACHE, 'top-cities.json'), 'utf8'));
const progress = JSON.parse(readFileSync(join(CACHE, 'sunshine-progress.json'), 'utf8'));

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

const names = [];
const country = [];
const lat = [];
const lon = [];
const pop = [];
const sun = [];
const rad = [];

let n = 0;
for (let i = 0; i < cities.length; i++) {
	const p = progress[i];
	if (!p) continue;
	const c = cities[i];
	names.push(c.name);
	country.push(c.country);
	lat.push(c.lat);
	lon.push(c.lon);
	pop.push(c.population);
	sun.push(p.sun.map(r1));
	rad.push(p.rad.map(r1));
	n++;
}

const out = {
	meta: {
		source: 'Open-Meteo Historical Weather API (ERA5 reanalysis)',
		url: 'https://open-meteo.com/en/docs/historical-weather-api',
		variables: ['sunshine_duration (hours/day)', 'shortwave_radiation_sum (MJ/m^2/day)'],
		period: '2019-2023 average',
		note: 'Monthly climatology: mean daily value for each calendar month, averaged over 2019-2023. Cities ranked by population (GeoNames via mourner/all-the-cities).',
		generated: new Date().toISOString().slice(0, 10)
	},
	n,
	names: names.join('\n'),
	country: country.join('\n'),
	lat,
	lon,
	pop,
	sun,
	rad
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`Baked ${n} cities to ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
