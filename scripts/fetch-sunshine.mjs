// Fetch a 12-month sunshine climatology for the top cities from Open-Meteo's
// ERA5 archive (archive-api.open-meteo.com), averaged over 2019-2023.
//
// For every city we pull daily `sunshine_duration` and `shortwave_radiation_sum`
// for 2019-01-01..2023-12-31, then average each calendar month across the five
// years to get a 12-value climatology:
//   sun[m] = mean daily sunshine hours in month m
//   rad[m] = mean daily shortwave radiation (MJ/m2) in month m
//
// Requests are batched (multiple coordinates per call), throttled, and the
// progress is cached to scripts/.cache/sunshine-progress.json so a rerun
// resumes where it left off. Run scripts/bake-sunshine.mjs afterwards.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
const CITIES = join(CACHE, 'top-cities.json');
const PROGRESS = join(CACHE, 'sunshine-progress.json');

const START = '2019-01-01';
const END = '2023-12-31';
const BATCH = 25; // cities per HTTP request
const DELAY_MS = 700; // polite pause between requests
const MAX_RETRY = 5;

const cities = JSON.parse(readFileSync(CITIES, 'utf8'));
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save() {
	writeFileSync(PROGRESS, JSON.stringify(progress));
}

// Average daily values per calendar month from one location's daily response.
function monthly(daily) {
	const sunSum = new Array(12).fill(0);
	const sunCnt = new Array(12).fill(0);
	const radSum = new Array(12).fill(0);
	const radCnt = new Array(12).fill(0);
	const time = daily.time;
	const sun = daily.sunshine_duration;
	const rad = daily.shortwave_radiation_sum;
	for (let i = 0; i < time.length; i++) {
		const m = Number(time[i].slice(5, 7)) - 1;
		if (sun[i] != null) {
			sunSum[m] += sun[i] / 3600; // seconds -> hours
			sunCnt[m]++;
		}
		if (rad[i] != null) {
			radSum[m] += rad[i];
			radCnt[m]++;
		}
	}
	const sunOut = new Array(12);
	const radOut = new Array(12);
	for (let m = 0; m < 12; m++) {
		sunOut[m] = sunCnt[m] ? Math.round((sunSum[m] / sunCnt[m]) * 100) / 100 : null;
		radOut[m] = radCnt[m] ? Math.round((radSum[m] / radCnt[m]) * 100) / 100 : null;
	}
	return { sun: sunOut, rad: radOut };
}

async function fetchBatch(indices) {
	const lats = indices.map((i) => cities[i].lat).join(',');
	const lons = indices.map((i) => cities[i].lon).join(',');
	const url =
		`https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}` +
		`&start_date=${START}&end_date=${END}` +
		`&daily=sunshine_duration,shortwave_radiation_sum&timezone=auto`;

	for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 429 || res.status >= 500) {
				const wait = Math.min(60000, 2000 * 2 ** attempt);
				console.warn(`  HTTP ${res.status}, backing off ${wait / 1000}s`);
				await sleep(wait);
				continue;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
			let json = await res.json();
			if (!Array.isArray(json)) json = [json]; // single-location responses aren't arrays
			if (json.length !== indices.length)
				throw new Error(`expected ${indices.length} locations, got ${json.length}`);
			return json;
		} catch (e) {
			if (attempt === MAX_RETRY) throw e;
			const wait = Math.min(60000, 2000 * 2 ** attempt);
			console.warn(`  ${e.message}; retry in ${wait / 1000}s`);
			await sleep(wait);
		}
	}
}

const todo = [];
for (let i = 0; i < cities.length; i++) if (!progress[i]) todo.push(i);
console.log(`${cities.length} cities, ${cities.length - todo.length} cached, ${todo.length} to fetch`);

let done = 0;
for (let b = 0; b < todo.length; b += BATCH) {
	const indices = todo.slice(b, b + BATCH);
	const json = await fetchBatch(indices);
	for (let k = 0; k < indices.length; k++) progress[indices[k]] = monthly(json[k].daily);
	done += indices.length;
	save();
	const pct = (((cities.length - todo.length + done) / cities.length) * 100).toFixed(1);
	console.log(`[${pct}%] fetched ${done}/${todo.length} (last: ${cities[indices[0]].name})`);
	if (b + BATCH < todo.length) await sleep(DELAY_MS);
}

console.log('Done. All cities cached to', PROGRESS);
