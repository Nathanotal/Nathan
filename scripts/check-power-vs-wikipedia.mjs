// Cross-check NASA POWER against Wikipedia's recorded sunshine normals, and
// fit a calibrated POWER -> sunshine model.
//
// For each city in static/sunshine.json (Wikipedia recorded sunshine hours/day
// per month) fetch the NASA POWER 1991-2020 climatology of:
//   ALLSKY_SFC_SW_DWN  all-sky surface shortwave irradiance (kWh/m2/day)
//   CLRSKY_SFC_SW_DWN  clear-sky surface shortwave irradiance
//   TOA_SW_DWN         top-of-atmosphere irradiance
//   CLOUD_AMT          cloud amount (%)
// Predict the sunshine fraction n/N from three POWER features and the
// astronomical daylight length N:
//   KT = all/toa  (clearness index)
//   CF = all/clr  (cloud-modification factor)
//   CA = cloud_amt/100
//   n/N = w0 + w1*KT + w2*CF + w3*CA   ->  sunshine hours = clamp01(n/N) * N
// Coefficients are fit on the recorded data; accuracy is reported with 5-fold
// cross-validation grouped by city (no train/test leakage). POWER all-sky
// radiation and the calibrated estimate are written back to static/sunshine.json.
//
// Resumable: POWER results are cached by coordinates.

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

function solarDeclination(N) {
	const g = ((2 * Math.PI) / 365) * (N - 1);
	return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
		0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
}
function daylightHours(latDeg, N) {
	const lat = latDeg * DEG, dec = solarDeclination(N);
	const c = (Math.sin(-0.833 * DEG) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
	return c <= -1 ? 24 : c >= 1 ? 0 : (24 / Math.PI) * Math.acos(c);
}

const data = JSON.parse(readFileSync(SUN, 'utf8'));
const names = data.names.split('\n');
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
const key = (i) => `${data.lat[i]},${data.lon[i]}`;
const P = (i) => progress[key(i)];

async function fetchPower(lat, lon) {
	const url =
		`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=` +
		`ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,TOA_SW_DWN,CLOUD_AMT&community=RE` +
		`&longitude=${lon}&latitude=${lat}&start=1991&end=2020&format=JSON`;
	for (let attempt = 0; attempt <= 5; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 429 || res.status >= 500) { await sleep(Math.min(30000, 1500 * 2 ** attempt)); continue; }
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const p = (await res.json()).properties.parameter;
			const pick = (k) => MONTHS.map((m) => (p[k][m] <= -999 ? null : p[k][m]));
			return { all: pick('ALLSKY_SFC_SW_DWN'), clr: pick('CLRSKY_SFC_SW_DWN'), toa: pick('TOA_SW_DWN'), cld: pick('CLOUD_AMT') };
		} catch (e) {
			if (attempt === 5) throw e;
			await sleep(Math.min(30000, 1500 * 2 ** attempt));
		}
	}
}

// ---- Fetch (resumable; refetch entries that predate the CLOUD_AMT field) ----
const todo = [];
for (let i = 0; i < data.n; i++) if (!P(i) || !P(i).cld) todo.push(i);
console.log(`${data.n} cities, ${data.n - todo.length} cached, ${todo.length} to fetch`);
for (let t = 0; t < todo.length; t++) {
	progress[key(todo[t])] = await fetchPower(data.lat[todo[t]], data.lon[todo[t]]);
	if (t % 10 === 9 || t === todo.length - 1) { writeFileSync(PROGRESS, JSON.stringify(progress)); console.log(`  fetched ${t + 1}/${todo.length}`); }
	await sleep(250);
}
writeFileSync(PROGRESS, JSON.stringify(progress));

// ---- Build samples ----------------------------------------------------------
const feat = (s) => [1, s.KT, s.CF, s.CA]; // calibrated model features
const S = [];
for (let i = 0; i < data.n; i++) {
	const p = P(i);
	for (let m = 0; m < 12; m++) {
		const wiki = data.sun[i][m], all = p.all[m], clr = p.clr[m], toa = p.toa[m], cld = p.cld[m];
		if (wiki == null || all == null || clr == null || toa == null || cld == null || toa < 0.3 || clr < 0.3) continue;
		const N = daylightHours(data.lat[i], MID_DOY[m]);
		if (N < 1) continue;
		S.push({ city: i, wiki, N, KT: all / toa, CF: Math.min(1, all / clr), CA: cld / 100, nN: wiki / N });
	}
}

// ---- Least squares ----------------------------------------------------------
function solveLS(X, y) {
	const k = X[0].length;
	const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
	for (let r = 0; r < X.length; r++) for (let a = 0; a < k; a++) { b[a] += X[r][a] * y[r]; for (let c = 0; c < k; c++) A[a][c] += X[r][a] * X[r][c]; }
	for (let c = 0; c < k; c++) A[c][c] += 1e-6;
	for (let c = 0; c < k; c++) {
		let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
		[A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
		for (let r = 0; r < k; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let cc = c; cc < k; cc++) A[r][cc] -= f * A[c][cc]; b[r] -= f * b[c]; }
	}
	return b.map((v, c) => v / A[c][c]);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const metrics = (arr, predHours) => {
	let se = 0, sae = 0, sb = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
	for (const s of arr) { const y = predHours(s), e = y - s.wiki; se += e * e; sae += Math.abs(e); sb += e; n++; sx += s.wiki; sy += y; sxx += s.wiki ** 2; syy += y * y; sxy += s.wiki * y; }
	return { n, mae: sae / n, rmse: Math.sqrt(se / n), bias: sb / n, r: (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx ** 2) * (n * syy - sy ** 2)) };
};

// ---- 5-fold CV (grouped by city) for an honest accuracy estimate ------------
const K = 5, predTest = new Map();
for (let f = 0; f < K; f++) {
	const train = S.filter((s) => s.city % K !== f), test = S.filter((s) => s.city % K === f);
	const w = solveLS(train.map(feat), train.map((s) => s.nN));
	for (const s of test) predTest.set(s, clamp01(feat(s).reduce((a, v, j) => a + v * w[j], 0)) * s.N);
}
const cv = metrics(S, (s) => predTest.get(s));

// Baseline (textbook Angstrom-Prescott, fixed coefficients) for comparison.
const base = metrics(S, (s) => clamp01((s.KT - 0.25) / 0.5) * s.N);

// Final coefficients fit on all data (used to bake the estimate).
const W = solveLS(S.map(feat), S.map((s) => s.nN));

console.log('\n=== POWER -> sunshine vs Wikipedia recorded (per city-month) ===');
console.log(`samples: ${S.length} city-months across ${data.n} cities`);
console.log(`baseline  Angstrom-Prescott (KT, fixed): MAE ${base.mae.toFixed(2)}  RMSE ${base.rmse.toFixed(2)}  bias ${base.bias >= 0 ? '+' : ''}${base.bias.toFixed(2)}  r ${base.r.toFixed(3)}`);
console.log(`calibrated KT+CF+cloud (5-fold CV):       MAE ${cv.mae.toFixed(2)}  RMSE ${cv.rmse.toFixed(2)}  bias ${cv.bias >= 0 ? '+' : ''}${cv.bias.toFixed(2)}  r ${cv.r.toFixed(3)}  (R^2 ${(cv.r ** 2).toFixed(2)})`);
console.log(`coefficients n/N = ${W[0].toFixed(3)} + ${W[1].toFixed(3)}*KT + ${W[2].toFixed(3)}*CF + ${W[3].toFixed(3)}*cloud`);

// Per-city annual agreement.
const predFor = (s) => clamp01(feat(s).reduce((a, v, j) => a + v * W[j], 0)) * s.N;
const perCity = new Map();
for (const s of S) { const e = perCity.get(s.city) || { sw: 0, se: 0, n: 0 }; e.sw += s.wiki; e.se += predFor(s); e.n++; perCity.set(s.city, e); }
const cityDiffs = [...perCity].filter(([, e]) => e.n >= 6).map(([i, e]) => ({ name: names[i], diff: (e.se - e.sw) / e.n }));
const within = (t) => (cityDiffs.filter((c) => Math.abs(c.diff) <= t).length / cityDiffs.length) * 100;
console.log(`per-city annual: ${within(0.5).toFixed(0)}% within 0.5h, ${within(1).toFixed(0)}% within 1h, ${within(1.5).toFixed(0)}% within 1.5h`);

// ---- Bake POWER radiation + calibrated estimate back into the dataset --------
const allMJ = [], sunEst = [];
for (let i = 0; i < data.n; i++) {
	const p = P(i);
	allMJ.push(p.all.map((v) => (v == null ? null : Math.round(v * 3.6 * 10) / 10)));
	sunEst.push(p.all.map((v, m) => {
		if (v == null || p.toa[m] == null || p.clr[m] == null || p.cld[m] == null || p.toa[m] < 0.3 || p.clr[m] < 0.3) return null;
		const N = daylightHours(data.lat[i], MID_DOY[m]);
		const nN = clamp01(W[0] + W[1] * (v / p.toa[m]) + W[2] * Math.min(1, v / p.clr[m]) + W[3] * (p.cld[m] / 100));
		return Math.round(nN * N * 10) / 10;
	}));
}
data.rad = allMJ;
data.sunEst = sunEst;
data.meta.radiation = { source: 'NASA POWER (SRB/SYN1deg), 1991-2020 climatology', url: 'https://power.larc.nasa.gov/', variable: 'ALLSKY_SFC_SW_DWN (all-sky surface shortwave), MJ/m^2/day' };
data.meta.estimate = { source: 'NASA POWER, calibrated KT+CF+cloud model', cvMae: +cv.mae.toFixed(2), cvR: +cv.r.toFixed(3), coef: W.map((v) => +v.toFixed(4)) };
writeFileSync(SUN, JSON.stringify(data));
console.log(`\nWrote POWER radiation + calibrated sunshine estimate into ${SUN}`);
