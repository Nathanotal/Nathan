// Expand the real-sunshine dataset from the ~436 Wikipedia *recorded* cities to
// thousands, by estimating sunshine for the most populous cities Wikipedia
// doesn't cover, using the NASA POWER calibrated model (CV MAE 0.62 h/day).
//
//   recorded cities  -> keep Wikipedia values            (kind = recorded)
//   other top cities -> estimate from NASA POWER         (kind = estimated)
//
// The calibrated model predicts the sunshine fraction n/N from POWER features:
//   n/N = w0 + w1*KT + w2*CF + w3*cloud
//   KT = all/toa (clearness), CF = all/clr (cloud factor), cloud = CLOUD_AMT/100
// Coefficients are fit fresh on the recorded cities. POWER calls are cached by
// coordinates and resumable. Output: static/sunshine.json with an `est` flag.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '.cache');
mkdirSync(CACHE, { recursive: true });
const SUN = join(__dirname, '..', 'static', 'sunshine.json');
const PROGRESS = join(CACHE, 'power-progress.json');
const ALL = join(CACHE, 'all-the-cities.json');

const TARGET = 5000; // most populous cities to ensure are covered
const DEDUPE_KM = 20; // skip a candidate this close to an already-included city
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const DEG = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decl(N) {
	const g = ((2 * Math.PI) / 365) * (N - 1);
	return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
		0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
}
function daylight(lat, N) {
	const la = lat * DEG, d = decl(N);
	const c = (Math.sin(-0.833 * DEG) - Math.sin(la) * Math.sin(d)) / (Math.cos(la) * Math.cos(d));
	return c <= -1 ? 24 : c >= 1 ? 0 : (24 / Math.PI) * Math.acos(c);
}
const kmBetween = (la1, lo1, la2, lo2) => {
	const dy = (la1 - la2) * 111;
	const dx = (lo1 - lo2) * 111 * Math.cos(((la1 + la2) / 2) * DEG);
	return Math.hypot(dx, dy);
};

// ---- recorded cities (current dataset) --------------------------------------
const cur = JSON.parse(readFileSync(SUN, 'utf8'));
const recNames = cur.names.split('\n');
const recCountry = cur.country.split('\n');
const recorded = [];
for (let i = 0; i < cur.n; i++)
	recorded.push({
		name: recNames[i], country: recCountry[i], lat: cur.lat[i], lon: cur.lon[i],
		pop: cur.pop[i], sun: cur.sun[i], est: 0
	});
console.log(`${recorded.length} recorded (Wikipedia) cities`);

// ---- candidate cities: most populous from GeoNames mirror -------------------
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const ccName = (cc) => { try { return regionNames.of(cc) || cc; } catch { return cc; } };
const all = JSON.parse(readFileSync(ALL, 'utf8'))
	.filter((c) => Number.isFinite(c.population) && Number.isFinite(c.lat) && Number.isFinite(c.lon))
	.sort((a, b) => b.population - a.population)
	.slice(0, TARGET);

// Spatial grid for fast dedupe (1-degree buckets).
const grid = new Map();
const gkey = (la, lo) => `${Math.floor(la)},${Math.floor(lo)}`;
const addGrid = (c) => {
	const k = gkey(c.lat, c.lon);
	let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(c);
};
const nearExisting = (la, lo) => {
	for (let dy = -1; dy <= 1; dy++)
		for (let dx = -1; dx <= 1; dx++) {
			const a = grid.get(`${Math.floor(la) + dy},${Math.floor(lo) + dx}`);
			if (a) for (const c of a) if (kmBetween(la, lo, c.lat, c.lon) < DEDUPE_KM) return true;
		}
	return false;
};
recorded.forEach(addGrid);

const estimated = [];
for (const c of all) {
	if (nearExisting(c.lat, c.lon)) continue; // already represented by a recorded city
	const city = { name: c.name, country: ccName(c.country), lat: Math.round(c.lat * 1e4) / 1e4, lon: Math.round(c.lon * 1e4) / 1e4, pop: c.population, est: 1 };
	estimated.push(city); addGrid(city);
}
console.log(`${estimated.length} additional cities to estimate (after ${DEDUPE_KM}km dedupe)`);

// ---- POWER fetch (resumable, cached by coords) ------------------------------
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
const key = (c) => `${c.lat},${c.lon}`;
async function fetchPower(lat, lon) {
	const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=` +
		`ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,TOA_SW_DWN,CLOUD_AMT&community=RE` +
		`&longitude=${lon}&latitude=${lat}&start=1991&end=2020&format=JSON`;
	for (let attempt = 0; attempt <= 6; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 429 || res.status >= 500) { await sleep(Math.min(60000, 1500 * 2 ** attempt)); continue; }
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const p = (await res.json()).properties.parameter;
			const pick = (k) => MONTHS.map((m) => (p[k][m] <= -999 ? null : p[k][m]));
			return { all: pick('ALLSKY_SFC_SW_DWN'), clr: pick('CLRSKY_SFC_SW_DWN'), toa: pick('TOA_SW_DWN'), cld: pick('CLOUD_AMT') };
		} catch (e) {
			if (attempt === 6) throw e;
			await sleep(Math.min(60000, 1500 * 2 ** attempt));
		}
	}
}
const need = estimated.filter((c) => !progress[key(c)]);
console.log(`POWER: ${estimated.length - need.length} cached, ${need.length} to fetch`);
for (let t = 0; t < need.length; t++) {
	progress[key(need[t])] = await fetchPower(need[t].lat, need[t].lon);
	if (t % 25 === 24 || t === need.length - 1) {
		writeFileSync(PROGRESS, JSON.stringify(progress));
		console.log(`  fetched ${t + 1}/${need.length}`);
	}
	await sleep(300);
}
writeFileSync(PROGRESS, JSON.stringify(progress));

// ---- fit calibrated model on recorded cities --------------------------------
function solveLS(X, y) {
	const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
	for (let r = 0; r < X.length; r++) for (let a = 0; a < k; a++) { b[a] += X[r][a] * y[r]; for (let c = 0; c < k; c++) A[a][c] += X[r][a] * X[r][c]; }
	for (let c = 0; c < k; c++) A[c][c] += 1e-6;
	for (let c = 0; c < k; c++) {
		let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
		[A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
		for (let r = 0; r < k; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let cc = c; cc < k; cc++) A[r][cc] -= f * A[c][cc]; b[r] -= f * b[c]; }
	}
	return b.map((v, c) => v / A[c][c]);
}
const feats = (p, m) => [1, p.all[m] / p.toa[m], Math.min(1, p.all[m] / p.clr[m]), p.cld[m] / 100];
const valid = (p, m) => p && p.all[m] != null && p.clr[m] != null && p.toa[m] != null && p.cld[m] != null && p.toa[m] >= 0.3 && p.clr[m] >= 0.3;

const X = [], Y = [];
for (const c of recorded) {
	const p = progress[key(c)];
	if (!p) continue;
	for (let m = 0; m < 12; m++) {
		if (c.sun[m] == null || !valid(p, m)) continue;
		const N = daylight(c.lat, MID_DOY[m]); if (N < 1) continue;
		X.push(feats(p, m)); Y.push(c.sun[m] / N);
	}
}
const W = solveLS(X, Y);
console.log(`Model fit on ${X.length} recorded city-months: n/N = ${W.map((v) => v.toFixed(3)).join(', ')}`);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function estimateSun(c) {
	const p = progress[key(c)];
	if (!p) return null;
	return p.all.map((_, m) => {
		if (!valid(p, m)) return null;
		const N = daylight(c.lat, MID_DOY[m]);
		const nN = clamp01(feats(p, m).reduce((a, v, j) => a + v * W[j], 0));
		return Math.round(nN * N * 10) / 10;
	});
}
const radOf = (c) => {
	const p = progress[key(c)];
	return p ? p.all.map((v) => (v == null ? null : Math.round(v * 3.6 * 10) / 10)) : new Array(12).fill(null);
};

// ---- merge & write ----------------------------------------------------------
for (const c of estimated) c.sun = estimateSun(c);
const cities = [...recorded, ...estimated].filter((c) => c.sun && c.sun.some((v) => v != null));
const annual = (s) => { const v = s.filter((x) => x != null); return v.reduce((a, x) => a + x, 0) / (v.length || 1); };
cities.sort((a, b) => annual(b.sun) - annual(a.sun));

const out = {
	meta: {
		recorded: { source: 'Wikipedia: List of cities by sunshine duration', url: 'https://en.wikipedia.org/wiki/List_of_cities_by_sunshine_duration', note: 'Recorded bright-sunshine climate normals from national meteorological services.' },
		estimated: { source: 'NASA POWER (1991-2020), calibrated model', url: 'https://power.larc.nasa.gov/', note: 'Sunshine estimated from satellite clearness/cloud via a model calibrated on the recorded cities (cross-validated MAE 0.62 h/day, r=0.94).', coef: W.map((v) => +v.toFixed(4)) },
		radiation: { source: 'NASA POWER (1991-2020)', variable: 'ALLSKY_SFC_SW_DWN, MJ/m^2/day' },
		generated: new Date().toISOString().slice(0, 10)
	},
	n: cities.length,
	nRecorded: cities.filter((c) => c.est === 0).length,
	names: cities.map((c) => c.name).join('\n'),
	country: cities.map((c) => c.country).join('\n'),
	lat: cities.map((c) => c.lat),
	lon: cities.map((c) => c.lon),
	pop: cities.map((c) => c.pop),
	est: cities.map((c) => c.est),
	sun: cities.map((c) => c.sun),
	rad: cities.map((c) => radOf(c))
};
writeFileSync(SUN, JSON.stringify(out));
console.log(`\nWrote ${out.n} cities (${out.nRecorded} recorded, ${out.n - out.nRecorded} estimated) to ${SUN}`);
console.log(`Size: ${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB`);
