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
		solarDeclination,
		type City
	} from './sun';

	// --- State -------------------------------------------------------------
	let selectedDay = 172; // ~21 June, northern summer solstice
	let selected: City | null = CITIES.find((c) => c.name === 'Stockholm') ?? null;
	let sortKey: 'lat' | 'name' | 'annual' = 'lat';
	let sortDir: 1 | -1 = 1;
	let playing = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	// --- Leaflet map -------------------------------------------------------
	let mapEl: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let L: any;
	let map: any;
	let subsolarLine: any;
	let mapReady = false;
	const markers = new Map<City, any>();

	$: declDeg = (solarDeclination(selectedDay) * 180) / Math.PI;

	function markerStyle(c: City, h: number) {
		const isSel = selected === c;
		return {
			radius: isSel ? 9 : 6,
			fillColor: colorForHours(h),
			color: isSel ? '#ffffff' : '#06101f',
			weight: isSel ? 2.5 : 1,
			opacity: 1,
			fillOpacity: 1
		};
	}

	function popupHtml(c: City, h: number): string {
		return (
			`<div style="text-align:center">` +
			`<strong>${c.name}</strong><br>` +
			`<span style="color:#64748b">${c.country}</span><br>` +
			`<span style="font-size:1.15rem;font-weight:700;color:#b45309">${fmt(h)}</span><br>` +
			`<span style="color:#64748b">of daylight on ${dateLabel(selectedDay)}</span>` +
			`</div>`
		);
	}

	// Repaint every marker + the subsolar line for the current day / selection.
	function refresh() {
		if (!mapReady) return;
		for (const [c, m] of markers) {
			const h = daylightHours(c.lat, selectedDay);
			m.setStyle(markerStyle(c, h));
			m.setRadius(selected === c ? 9 : 6);
			m.setTooltipContent(`${c.name} — ${fmt(h)}`);
			m.setPopupContent(popupHtml(c, h));
			if (selected === c) m.bringToFront();
		}
		const pts = [
			[declDeg, -200],
			[declDeg, 200]
		];
		if (subsolarLine) subsolarLine.setLatLngs(pts);
		else if (map)
			subsolarLine = L.polyline(pts, {
				color: '#fcd34d',
				weight: 2,
				dashArray: '6 6',
				opacity: 0.9,
				interactive: false
			}).addTo(map);
	}

	// Re-run whenever the day or the selected city changes (once the map exists).
	$: {
		selectedDay;
		selected;
		mapReady;
		refresh();
	}

	onMount(async () => {
		const leaflet = await import('leaflet');
		L = leaflet.default ?? leaflet;

		map = L.map(mapEl, {
			center: [25, 5],
			zoom: 2,
			minZoom: 2,
			worldCopyJump: true,
			scrollWheelZoom: true
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 18,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);

		for (const c of CITIES) {
			const h = daylightHours(c.lat, selectedDay);
			const m = L.circleMarker([c.lat, c.lon], markerStyle(c, h));
			m.bindTooltip(`${c.name} — ${fmt(h)}`, { direction: 'top' });
			m.bindPopup(popupHtml(c, h));
			m.on('click', () => (selected = c));
			m.addTo(map);
			markers.set(c, m);
		}

		mapReady = true;
		refresh();
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (map) map.remove();
	});

	// --- Table -------------------------------------------------------------
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

	function selectCity(c: City) {
		selected = c;
		if (mapReady) {
			const m = markers.get(c);
			map.panTo([c.lat, c.lon], { animate: true });
			m?.openPopup();
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

	function fmt(h: number): string {
		if (h <= 0) return '0h';
		if (h >= 24) return '24h';
		const m = Math.round(h * 60);
		return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
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
</script>

<svelte:head>
	<title>World Sunlight Map</title>
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>☀️ World Sunlight Map</h1>
		<p>
			How many hours of daylight does each city get through the year? Pan and zoom the map, drag the
			date slider across the seasons, and <strong>click any city</strong> to see its exact day length.
			Brighter dots = more sun; the gold dashed line shows where the sun is directly overhead.
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
		<div class="map" bind:this={mapEl} />
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
				<h2>{selected.name}, {selected.country}</h2>
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

	<!-- Full table -->
	<div class="table-card card">
		<h2>Daylight hours by city and month</h2>
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
						<tr class:active={selected === row.city} on:click={() => selectCity(row.city)}>
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
			refraction and the sun's radius). Months are sampled on the 15th. Daylight Saving Time is not
			applied. Map tiles © OpenStreetMap contributors.
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
	.map {
		width: 100%;
		height: clamp(340px, 58vh, 560px);
		border-radius: 10px;
		border: 1px solid #223;
		background: #0a1426;
		z-index: 0;
	}
	/* Leaflet popups read better on the dark theme */
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
