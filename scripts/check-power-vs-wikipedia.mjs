// Cross-check NASA POWER against Wikipedia's recorded sunshine normals.
//
// For each city already in static/sunshine.json (Wikipedia recorded sunshine
// hours/day per month), fetch the NASA POWER 1991-2020 climatology of:
//   ALLSKY_SFC_SW_DWN  – actual surface shortwave irradiance (kWh/m2/day)
//   CLRSKY_SFC_SW_DWN  – clear-sky surface shortwave irradiance
//   TOA_SW_DWN         – top-of-atmosphere irradiance
// Estimate sunshine hours via the Angstrom-Prescott relation
//   H/H0 = a + b*(n/N)  ->  n = N * clamp((H/H0 - a)/b, 0, 1)
// (H = all-sky, H0 = top-of-atmosphere, N = astronomical daylight hours),
// then compare the estimate against the recorded Wikipedia values.
//
// Results are cached so reruns resume. Prints an accuracy report and writes
// the POWER radiation back into static/sunshine.json (the `rad` field).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
mkdirSync(CACHE, { recursive: true });
const SUN = join(__dirname, '..', 'static', 'sunshine.json');
const PROGRESS = join(CACHE, 'power-progress.json');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const DEG = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Astronomical daylight hours (sunrise to sunset) – mirrors src/routes/sunmap/sun.ts.
function solarDeclination(N) {
	const g = ((2 * Math.PI) / 365) * (N - 1);
	return (
		0.006918 -
		0.399912 * Math.cos(g) +
		0.070257 * Math.sin(g) -
		0.006758 * Math.cos(2 * g) +
		0.000907 * Math.sin(2 * g) -
		0.002697 * Math.cos(3 * g) +
		0.00148 * Math.sin(3 * g)
	);
}
function daylightHours(latDeg, N) {
	const lat = latDeg * DEG;
	const dec = solarDeclination(N);
	const cosH = (Math.sin(-0.833 * DEG) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
	if (cosH <= -1) return 24;
	if (cosH >= 1) return 0;
	return (24 / Math.PI) * Math.acos(cosH);
}

const data = JSON.parse(readFileSync(SUN, 'utf8'));
const names = data.names.split('\n');
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
const key = (i) => `${data.lat[i]},${data.lon[i]}`; // cache by coords, not index
const P = (i) => progress[key(i)];

async function fetchPower(lat, lon) {
	const url =
		`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=` +
		`ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,TOA_SW_DWN&community=RE` +
		`&longitude=${lon}&latitude=${lat}&start=1991&end=2020&format=JSON`;
	for (let attempt = 0; attempt <= 5; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 429 || res.status >= 500) {
				await sleep(Math.min(30000, 1500 * 2 ** attempt));
				continue;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const j = await res.json();
			const p = j.properties.parameter;
			const pick = (k) => MONTHS.map((m) => (p[k][m] <= -999 ? null : p[k][m]));
			return { all: pick('ALLSKY_SFC_SW_DWN'), clr: pick('CLRSKY_SFC_SW_DWN'), toa: pick('TOA_SW_DWN') };
		} catch (e) {
			if (attempt === 5) throw e;
			await sleep(Math.min(30000, 1500 * 2 ** attempt));
		}
	}
}

// ---- Fetch (resumable) ------------------------------------------------------
const todo = [];
for (let i = 0; i < data.n; i++) if (!P(i)) todo.push(i);
console.log(`${data.n} cities, ${data.n - todo.length} cached, ${todo.length} to fetch`);
for (let t = 0; t < todo.length; t++) {
	const i = todo[t];
	progress[key(i)] = await fetchPower(data.lat[i], data.lon[i]);
	if (t % 10 === 9 || t === todo.length - 1) {
		writeFileSync(PROGRESS, JSON.stringify(progress));
		console.log(`  fetched ${t + 1}/${todo.length}`);
	}
	await sleep(250);
}
writeFileSync(PROGRESS, JSON.stringify(progress));

// ---- Estimate sunshine hours & compare --------------------------------------
const A = 0.25;
const B = 0.5; // standard Angstrom-Prescott coefficients
function estimate(lat, all, toa, month) {
	const N = daylightHours(lat, MID_DOY[month]);
	if (N < 0.5 || all == null || toa == null || toa < 0.3) return 0;
	const frac = Math.max(0, Math.min(1, (all / toa - A) / B));
	return frac * N;
}

const pairs = []; // {wiki, est, ratio:(all/toa), nN:(wiki/N)} per city-month
const rad = [];
for (let i = 0; i < data.n; i++) {
	const p = P(i);
	const allMJ = p.all.map((v) => (v == null ? null : Math.round(v * 3.6 * 10) / 10)); // kWh->MJ
	rad.push(allMJ);
	for (let m = 0; m < 12; m++) {
		const wiki = data.sun[i][m];
		if (wiki == null) continue;
		const est = estimate(data.lat[i], p.all[m], p.toa[m], m);
		pairs.push({ wiki, est, ratio: p.all[m] / p.toa[m], N: daylightHours(data.lat[i], MID_DOY[m]) });
	}
}

function stats(arr, f, g) {
	let n = 0, se = 0, sae = 0, sb = 0;
	let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
	for (const d of arr) {
		const x = f(d), y = g(d);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		n++; const e = y - x;
		se += e * e; sae += Math.abs(e); sb += e;
		sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
	}
	const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
	return { n, rmse: Math.sqrt(se / n), mae: sae / n, bias: sb / n, r };
}

const s = stats(pairs, (d) => d.wiki, (d) => d.est);
console.log('\n=== POWER-estimated sunshine hours vs Wikipedia recorded (per city-month) ===');
console.log(`samples:     ${s.n}`);
console.log(`MAE:         ${s.mae.toFixed(2)} h/day`);
console.log(`RMSE:        ${s.rmse.toFixed(2)} h/day`);
console.log(`bias (est-wiki): ${s.bias >= 0 ? '+' : ''}${s.bias.toFixed(2)} h/day`);
console.log(`correlation: r=${s.r.toFixed(3)}`);

// Best-fit Angstrom-Prescott coefficients calibrated to Wikipedia (n/N = a + b*ratio).
let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
for (const d of pairs) {
	const x = d.ratio, y = d.wiki / d.N;
	if (!Number.isFinite(x) || !Number.isFinite(y) || d.N < 0.5) continue;
	n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
}
const bFit = (n * sxy - sx * sy) / (n * sxx - sx * sx);
const aFit = (sy - bFit * sx) / n;
const sFit = stats(
	pairs.filter((d) => d.N >= 0.5),
	(d) => d.wiki,
	(d) => Math.max(0, Math.min(1, aFit + bFit * d.ratio)) * d.N
);
console.log(`\nBest-fit relation n/N = ${aFit.toFixed(3)} + ${bFit.toFixed(3)}*(all/toa)`);
console.log(`  -> MAE ${sFit.mae.toFixed(2)} h/day, RMSE ${sFit.rmse.toFixed(2)} h/day, r=${sFit.r.toFixed(3)}`);

// Per-city annual agreement, worst offenders.
const perCity = [];
for (let i = 0; i < data.n; i++) {
	const p = P(i);
	let sw = 0, swc = 0, se = 0;
	for (let m = 0; m < 12; m++) {
		const wiki = data.sun[i][m];
		if (wiki == null) continue;
		sw += wiki; swc++; se += estimate(data.lat[i], p.all[m], p.toa[m], m);
	}
	if (swc < 6) continue;
	perCity.push({ name: names[i], wiki: sw / swc, est: se / swc, diff: se / swc - sw / swc });
}
perCity.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log('\n=== Largest annual disagreements (est - wiki, h/day) ===');
for (const c of perCity.slice(0, 12))
	console.log(`  ${c.name.padEnd(22)} wiki ${c.wiki.toFixed(1)}  est ${c.est.toFixed(1)}  diff ${c.diff >= 0 ? '+' : ''}${c.diff.toFixed(1)}`);

const within = (t) => (perCity.filter((c) => Math.abs(c.diff) <= t).length / perCity.length) * 100;
console.log(`\nPer-city annual: ${within(0.5).toFixed(0)}% within 0.5h/day, ${within(1).toFixed(0)}% within 1h/day, ${within(1.5).toFixed(0)}% within 1.5h/day`);

// ---- Write POWER radiation back into the dataset ----------------------------
data.rad = rad;
data.meta.radiation = {
	source: 'NASA POWER (SRB/SYN1deg), 1991-2020 climatology',
	url: 'https://power.larc.nasa.gov/',
	variable: 'ALLSKY_SFC_SW_DWN (all-sky surface shortwave), MJ/m^2/day'
};
writeFileSync(SUN, JSON.stringify(data));
console.log(`\nWrote POWER all-sky radiation into ${SUN}`);
