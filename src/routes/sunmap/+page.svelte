<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import {
		CITIES,
		MONTHS,
		daylightHours,
		annualAverage,
		colorForHours,
		dateLabel,
		solarDeclination
	} from './sun';

	type Place = { name: string; country?: string; lat: number; lon: number };

	// --- State -------------------------------------------------------------
	let selectedDay = 172; // ~21 June, northern summer solstice
	let selected: Place | null = CITIES.find((c) => c.name === 'Stockholm') ?? null;
	let sortKey: 'lat' | 'name' | 'annual' = 'lat';
	let sortDir: 1 | -1 = 1;
	let playing = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	// --- Leaflet map -------------------------------------------------------
	let mapEl: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let L: any;
	let map: any;
	let cityLayer: any;
	let subsolarLine: any;
	let infoPopup: any;
	let mapReady = false;

	// --- Big city dataset (169k points) -----------------------------------
	let bigLat = new Float32Array(0); // latitude per city
	let bigLon = new Float32Array(0); // longitude per city
	let bigNames: string[] = [];
	let order = new Int32Array(0); // city indices sorted by latitude (ascending)
	let sortedLat = new Float32Array(0); // bigLat[order[k]], for binary search
	let nCities = 0;
	let dataReady = false;
	let loading = true;
	let loadError = '';

	// Daylight colour depends only on latitude + day, so precompute a colour for
	// each 0.25° latitude band once per day and reuse it for every city.
	const BUCKETS = 721; // -90 .. 90 in 0.25° steps
	let colorTable: string[] = [];
	const bucketOf = (la: number) => {
		const i = Math.round((la + 90) / 0.25);
		return i < 0 ? 0 : i > 720 ? 720 : i;
	};
	function rebuildColorTable(day: number) {
		const t = new Array(BUCKETS);
		for (let i = 0; i < BUCKETS; i++) t[i] = colorForHours(daylightHours(-90 + i * 0.25, day));
		colorTable = t;
	}

	$: declDeg = (solarDeclination(selectedDay) * 180) / Math.PI;

	// First index k where sortedLat[k] >= target (binary search).
	function lowerBound(target: number) {
		let lo = 0,
			hi = nCities;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sortedLat[mid] < target) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	function fmt(h: number): string {
		if (h <= 0) return '0h';
		if (h >= 24) return '24h';
		const m = Math.round(h * 60);
		return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
	}

	function infoHtml(p: Place): string {
		const h = daylightHours(p.lat, selectedDay);
		return (
			`<div style="text-align:center;min-width:120px">` +
			`<strong>${p.name}</strong>` +
			(p.country ? `<br><span style="color:#64748b">${p.country}</span>` : '') +
			`<br><span style="font-size:1.15rem;font-weight:700;color:#b45309">${fmt(h)}</span>` +
			`<br><span style="color:#64748b">of daylight on ${dateLabel(selectedDay)}</span>` +
			`</div>`
		);
	}

	function choose(p: Place, openPopup = true) {
		selected = p;
		if (mapReady && openPopup && infoPopup) {
			map.panTo([p.lat, p.lon], { animate: true });
			infoPopup.setLatLng([p.lat, p.lon]).setContent(infoHtml(p)).openOn(map);
		}
	}

	// Throttle re-rendering of the canvas + subsolar line to one per frame.
	let rafPending = false;
	function scheduleRender() {
		if (!dataReady || rafPending) return;
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			if (cityLayer) cityLayer.redraw();
			updateSubsolar();
		});
	}

	function updateSubsolar() {
		if (!map) return;
		const pts = [
			[declDeg, -400],
			[declDeg, 400]
		];
		if (subsolarLine) subsolarLine.setLatLngs(pts);
		else
			subsolarLine = L.polyline(pts, {
				color: '#fcd34d',
				weight: 2,
				dashArray: '6 6',
				opacity: 0.9,
				interactive: false
			}).addTo(map);
	}

	// Recolour + repaint whenever the day or selection changes.
	$: {
		selectedDay;
		selected;
		if (mapReady && dataReady) {
			rebuildColorTable(selectedDay);
			scheduleRender();
		}
	}

	onMount(async () => {
		const leaflet = await import('leaflet');
		L = leaflet.default ?? leaflet;

		map = L.map(mapEl, {
			center: [25, 5],
			zoom: 2,
			minZoom: 2,
			maxZoom: 12,
			worldCopyJump: true,
			preferCanvas: true
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);

		infoPopup = L.popup({ autoPan: false });
		mapReady = true;
		updateSubsolar();

		// Load the big city dataset and build lookup structures.
		try {
			const res = await fetch('/cities.json');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: { names: string; lat: number[]; lon: number[] } = await res.json();
			bigNames = data.names.split('\n');
			bigLat = Float32Array.from(data.lat);
			bigLon = Float32Array.from(data.lon);
			nCities = bigNames.length;

			// Sort city indices by latitude so the renderer can (a) skip to the
			// visible band with a binary search and (b) keep one fill colour per band.
			order = Int32Array.from({ length: nCities }, (_, i) => i).sort(
				(a, b) => bigLat[a] - bigLat[b]
			);
			sortedLat = new Float32Array(nCities);
			for (let k = 0; k < nCities; k++) sortedLat[k] = bigLat[order[k]];

			rebuildColorTable(selectedDay);
			dataReady = true;
			loading = false;

			cityLayer = makeCityLayer();
			cityLayer.addTo(map);
			map.on('click', onMapClick);
		} catch (e) {
			loading = false;
			loadError = e instanceof Error ? e.message : 'failed to load cities';
		}
	});

	// Custom Leaflet layer that draws all visible cities onto a single canvas.
	function makeCityLayer() {
		const Layer = L.Layer.extend({
			onAdd(m: any) {
				this._map = m;
				const c = (this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide'));
				c.style.pointerEvents = 'none';
				this._ctx = c.getContext('2d');
				m.getPanes().overlayPane.appendChild(c);
				m.on('moveend zoomend viewreset resize', this._render, this);
				this._render();
				return this;
			},
			onRemove(m: any) {
				L.DomUtil.remove(this._canvas);
				m.off('moveend zoomend viewreset resize', this._render, this);
				return this;
			},
			redraw() {
				if (this._map) this._render();
				return this;
			},
			_render() {
				const m = this._map;
				const size = m.getSize();
				const c = this._canvas;
				L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
				c.width = size.x;
				c.height = size.y;
				const ctx = this._ctx;
				ctx.clearRect(0, 0, size.x, size.y);

				const b = m.getBounds();
				const south = b.getSouth();
				const north = b.getNorth();
				const west = b.getWest();
				const east = b.getEast();
				const zoom = m.getZoom();
				const r = zoom < 4 ? 0.8 : zoom < 6 ? 1.4 : 2.2;
				const d = r * 2;

				let lastBucket = -1;
				for (let k = lowerBound(south); k < nCities; k++) {
					const la = sortedLat[k];
					if (la > north) break;
					const i = order[k];
					const lo = bigLon[i];
					const bk = bucketOf(la);
					if (bk !== lastBucket) {
						ctx.fillStyle = colorTable[bk];
						lastBucket = bk;
					}
					// Draw the city plus its ±360° world-wrap copies that fall in view.
					for (let w = -360; w <= 360; w += 360) {
						const lon = lo + w;
						if (lon < west || lon > east) continue;
						const p = m.latLngToContainerPoint([la, lon]);
						ctx.fillRect((p.x - r) | 0, (p.y - r) | 0, d < 1 ? 1 : d, d < 1 ? 1 : d);
					}
				}

				// Highlight the selected city with a white ring on top.
				if (selected) {
					const p = m.latLngToContainerPoint([selected.lat, selected.lon]);
					ctx.beginPath();
					ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
					ctx.lineWidth = 2;
					ctx.strokeStyle = '#ffffff';
					ctx.stroke();
				}
			}
		});
		return new Layer();
	}

	// Click hit-testing: find the nearest city to the click within ~14px.
	function onMapClick(e: any) {
		if (!dataReady) return;
		const m = map;
		const b = m.getBounds();
		const south = b.getSouth();
		const north = b.getNorth();
		const west = b.getWest();
		const east = b.getEast();
		const cp = e.containerPoint;
		let best = -1;
		let bestD = 14 * 14;
		for (let k = lowerBound(south); k < nCities; k++) {
			const la = sortedLat[k];
			if (la > north) break;
			const i = order[k];
			const lo = bigLon[i];
			for (let w = -360; w <= 360; w += 360) {
				const lon = lo + w;
				if (lon < west || lon > east) continue;
				const p = m.latLngToContainerPoint([la, lon]);
				const dx = p.x - cp.x;
				const dy = p.y - cp.y;
				const dist = dx * dx + dy * dy;
				if (dist < bestD) {
					bestD = dist;
					best = i;
				}
			}
		}
		if (best >= 0) choose({ name: bigNames[best], lat: bigLat[best], lon: bigLon[best] });
	}

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (map) map.remove();
	});

	// --- Featured-cities table --------------------------------------------
	const table = CITIES.map((c) => ({
		city: c,
		months: MONTHS.map((m) => daylightHours(c.lat, m.day)),
		annual: annualAverage(c.lat)
	}));

	$: sortedTable = [...table].sort((a, b) => {
		let d = 0;
		if (sortKey === 'lat') d = a.city.lat - b.city.lat;
		else if (sortKey === 'name') d = a.city.name.localeCompare(b.city.name);
		else d = a.annual - b.annual;
		return d * sortDir;
	});

	function setSort(key: 'lat' | 'name' | 'annual') {
		if (sortKey === key) sortDir = (sortDir * -1) as 1 | -1;
		else {
			sortKey = key;
			sortDir = key === 'name' ? 1 : -1;
		}
	}

	function togglePlay() {
		playing = !playing;
		if (playing) {
			timer = setInterval(() => {
				selectedDay = (selectedDay % 365) + 1;
			}, 60);
		} else if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	const monthMarks = [
		{ d: 1, l: 'Jan' },
		{ d: 60, l: 'Mar' },
		{ d: 121, l: 'May' },
		{ d: 182, l: 'Jul' },
		{ d: 244, l: 'Sep' },
		{ d: 305, l: 'Nov' }
	];

	const legendStops = [0, 3, 6, 9, 12, 15, 18, 21, 24];
	const nf = new Intl.NumberFormat('en-US');
</script>

<svelte:head>
	<title>World Sunlight Map</title>
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>☀️ World Sunlight Map</h1>
		<p>
			How many hours of daylight does every city on Earth get through the year?
			{#if dataReady}<strong>{nf.format(nCities)} cities</strong> are plotted —{:else}Cities are
				plotted —{/if} pan and zoom the map, drag the date slider across the seasons, and
			<strong>click anywhere near a city</strong> to read its exact day length. Brighter dots = more
			sun; the gold dashed line shows where the sun is directly overhead.
		</p>
	</header>

	<!-- Date controls -->
	<div class="controls card">
		<button class="play-btn" on:click={togglePlay} aria-label="Play or pause">
			{playing ? '⏸' : '▶'}
		</button>
		<div class="slider-wrap">
			<div class="slider-top">
				<span class="date-label">{dateLabel(selectedDay)}</span>
				<span class="decl"
					>Sun overhead at {declDeg >= 0 ? 'N' : 'S'}
					{Math.abs(declDeg).toFixed(1)}°</span
				>
			</div>
			<input type="range" min="1" max="365" bind:value={selectedDay} class="slider" />
			<div class="month-marks">
				{#each monthMarks as m}
					<button class="mark" on:click={() => (selectedDay = m.d)}>{m.l}</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Map -->
	<div class="map-card card">
		<div class="map-holder">
			<div class="map" bind:this={mapEl} />
			{#if loading}
				<div class="map-overlay">Loading {nf.format(169137)} cities…</div>
			{:else if loadError}
				<div class="map-overlay err">Couldn't load cities ({loadError})</div>
			{/if}
		</div>
		<div class="legend">
			<span class="legend-label">Daylight:</span>
			<div class="legend-scale">
				<div class="legend-bar">
					{#each legendStops as s, i}
						{#if i < legendStops.length - 1}
							<div
								class="legend-seg"
								style="background: linear-gradient(to right, {colorForHours(s)}, {colorForHours(
									legendStops[i + 1]
								)});"
							/>
						{/if}
					{/each}
				</div>
				<div class="legend-ticks">
					<span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Selected city detail -->
	{#if selected}
		{@const todays = daylightHours(selected.lat, selectedDay)}
		<div class="detail card">
			<div class="detail-head">
				<h2>{selected.name}{selected.country ? `, ${selected.country}` : ''}</h2>
				<span class="coords">
					{Math.abs(selected.lat).toFixed(2)}°{selected.lat >= 0 ? 'N' : 'S'},
					{Math.abs(selected.lon).toFixed(2)}°{selected.lon >= 0 ? 'E' : 'W'}
				</span>
			</div>
			<div class="detail-stats">
				<div class="stat">
					<span class="stat-val">{fmt(todays)}</span>
					<span class="stat-lbl">on {dateLabel(selectedDay)}</span>
				</div>
				<div class="stat">
					<span class="stat-val">{annualAverage(selected.lat).toFixed(1)}h</span>
					<span class="stat-lbl">yearly average</span>
				</div>
			</div>
			<!-- Yearly bar chart -->
			<div class="year-chart">
				{#each MONTHS as m}
					{@const h = daylightHours(selected.lat, m.day)}
					<div class="bar-col" title="{m.name}: {fmt(h)}">
						<div class="bar-track">
							<div
								class="bar-fill"
								style="height: {(h / 24) * 100}%; background: {colorForHours(h)};"
							/>
						</div>
						<span class="bar-lbl">{m.short}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Featured cities table -->
	<div class="table-card card">
		<h2>Featured cities — daylight hours by month</h2>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th class="sortable" on:click={() => setSort('name')}>
							City {sortKey === 'name' ? (sortDir === 1 ? '▲' : '▼') : ''}
						</th>
						<th class="sortable num" on:click={() => setSort('lat')}>
							Lat {sortKey === 'lat' ? (sortDir === 1 ? '▲' : '▼') : ''}
						</th>
						{#each MONTHS as m}
							<th class="num">{m.short}</th>
						{/each}
						<th class="sortable num" on:click={() => setSort('annual')}>
							Avg {sortKey === 'annual' ? (sortDir === 1 ? '▲' : '▼') : ''}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedTable as row}
						<tr class:active={selected === row.city} on:click={() => choose(row.city)}>
							<td class="city-name">
								{row.city.name}
								<span class="muted">{row.city.country}</span>
							</td>
							<td class="num">{row.city.lat.toFixed(1)}°</td>
							{#each row.months as h}
								<td
									class="num cell"
									style="background: {colorForHours(h)}; color: {h > 13 ? '#1a1a1a' : '#f5f5f5'};"
								>
									{h <= 0 ? '0' : h >= 24 ? '24' : h.toFixed(1)}
								</td>
							{/each}
							<td class="num avg">{row.annual.toFixed(1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="footnote">
			Values are hours between sunrise and sunset, computed from each city's latitude using the
			solar-declination and sunrise equations (including a −0.833° correction for atmospheric
			refraction and the sun's radius). The featured table samples the 15th of each month; Daylight
			Saving Time is not applied. City coordinates from the GeoNames dataset; map tiles ©
			OpenStreetMap contributors.
		</p>
	</div>
</div>

<style>
	.page {
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px 16px 64px;
		color: #e5e9f0;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	}

	.intro h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 8px;
	}
	.intro p {
		color: #aab4c5;
		max-width: 760px;
		line-height: 1.5;
	}

	.card {
		background: #131a2a;
		border: 1px solid #1f2940;
		border-radius: 14px;
		padding: 18px;
		margin-top: 20px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
	}

	/* Controls */
	.controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.play-btn {
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: none;
		background: #fcd34d;
		color: #1a1a1a;
		font-size: 1.1rem;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.play-btn:hover {
		transform: scale(1.08);
	}
	.slider-wrap {
		flex: 1;
	}
	.slider-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 4px;
	}
	.date-label {
		font-size: 1.3rem;
		font-weight: 700;
		color: #fcd34d;
	}
	.decl {
		font-size: 0.85rem;
		color: #9aa6bd;
	}
	.slider {
		width: 100%;
		accent-color: #fcd34d;
		cursor: pointer;
	}
	.month-marks {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
	}
	.mark {
		background: none;
		border: none;
		color: #8a96ad;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.mark:hover {
		color: #fcd34d;
	}

	/* Map */
	.map-holder {
		position: relative;
	}
	.map {
		width: 100%;
		height: clamp(360px, 62vh, 600px);
		border-radius: 10px;
		border: 1px solid #223;
		background: #0a1426;
		z-index: 0;
	}
	.map-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(10, 20, 38, 0.7);
		color: #e5e9f0;
		font-weight: 600;
		border-radius: 10px;
		pointer-events: none;
	}
	.map-overlay.err {
		color: #fca5a5;
	}
	:global(.leaflet-popup-content) {
		margin: 10px 14px;
		font-family: system-ui, sans-serif;
	}
	:global(.leaflet-container) {
		font-family: system-ui, sans-serif;
	}

	/* Legend */
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		font-size: 0.8rem;
		color: #aab4c5;
	}
	.legend-scale {
		width: 240px;
	}
	.legend-bar {
		display: flex;
		width: 100%;
		height: 12px;
		border-radius: 6px;
		overflow: hidden;
	}
	.legend-seg {
		flex: 1;
	}
	.legend-ticks {
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-size: 0.65rem;
		color: #8a96ad;
		margin-top: 2px;
	}

	/* Detail */
	.detail-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
	}
	.detail-head h2 {
		font-size: 1.3rem;
		font-weight: 700;
		margin: 0;
	}
	.coords {
		color: #8a96ad;
		font-size: 0.85rem;
	}
	.detail-stats {
		display: flex;
		gap: 28px;
		margin: 14px 0;
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat-val {
		font-size: 1.6rem;
		font-weight: 700;
		color: #fcd34d;
	}
	.stat-lbl {
		font-size: 0.78rem;
		color: #9aa6bd;
	}
	.year-chart {
		display: flex;
		gap: 6px;
		align-items: flex-end;
		height: 120px;
	}
	.bar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
	}
	.bar-track {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
		background: #0e1626;
		border-radius: 4px;
		overflow: hidden;
	}
	.bar-fill {
		width: 100%;
		border-radius: 4px 4px 0 0;
		transition: height 0.2s ease;
	}
	.bar-lbl {
		font-size: 0.65rem;
		color: #8a96ad;
		margin-top: 4px;
	}

	/* Table */
	.table-card h2 {
		font-size: 1.2rem;
		font-weight: 700;
		margin: 0 0 12px;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	th,
	td {
		padding: 5px 7px;
		text-align: left;
		border-bottom: 1px solid #1c2540;
	}
	th {
		color: #aab4c5;
		font-weight: 600;
		position: sticky;
		top: 0;
		background: #131a2a;
	}
	.sortable {
		cursor: pointer;
		user-select: none;
	}
	.sortable:hover {
		color: #fcd34d;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.cell {
		text-align: center;
		font-weight: 600;
		min-width: 34px;
	}
	.city-name .muted {
		display: block;
		color: #8a96ad;
		font-size: 0.68rem;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover {
		background: #1a2236;
	}
	tbody tr.active {
		outline: 1px solid #fcd34d;
	}
	.avg {
		font-weight: 700;
		color: #fcd34d;
	}
	.footnote {
		margin-top: 12px;
		font-size: 0.72rem;
		color: #8a96ad;
		line-height: 1.4;
	}
</style>
