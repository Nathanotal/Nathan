// Sunlight calculations for cities around the world.
//
// The "amount of sun" for a place on a given day is the length of the day,
// i.e. the number of hours between sunrise and sunset. This depends only on
// the latitude and the day of the year and can be derived from astronomy, so
// no external data or API is required.

export interface City {
	name: string;
	country: string;
	lat: number; // degrees, north positive
	lon: number; // degrees, east positive
}

const DEG = Math.PI / 180;

/** Day of year, 1 = Jan 1, for a given month (1-12) and day. */
export function dayOfYear(month: number, day: number): number {
	// Cumulative days before each month for a non-leap year.
	const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
	return cumulative[month - 1] + day;
}

/**
 * Solar declination in radians for day-of-year N using Spencer's Fourier
 * series, which is accurate to within a few hundredths of a degree.
 */
export function solarDeclination(N: number): number {
	const g = ((2 * Math.PI) / 365) * (N - 1); // fractional year angle (rad)
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

/**
 * Number of daylight hours (sunrise to sunset) at a latitude on day N.
 *
 * Uses the standard sunrise equation with a solar altitude of -0.833°, which
 * accounts for the angular radius of the sun and atmospheric refraction. The
 * polar day (midnight sun) and polar night cases are handled explicitly.
 */
export function daylightHours(latDeg: number, N: number): number {
	const lat = latDeg * DEG;
	const dec = solarDeclination(N);

	// Altitude of the sun's centre at sunrise/sunset.
	const h0 = -0.833 * DEG;

	const cosH = (Math.sin(h0) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));

	if (cosH <= -1) return 24; // sun never sets – midnight sun
	if (cosH >= 1) return 0; // sun never rises – polar night

	const H = Math.acos(cosH); // half-day length in radians
	return (24 / Math.PI) * H;
}

/** Representative day of the year for each month (roughly the 15th). */
export const MONTHS = [
	{ name: 'Jan', short: 'J', day: dayOfYear(1, 15) },
	{ name: 'Feb', short: 'F', day: dayOfYear(2, 15) },
	{ name: 'Mar', short: 'M', day: dayOfYear(3, 15) },
	{ name: 'Apr', short: 'A', day: dayOfYear(4, 15) },
	{ name: 'May', short: 'M', day: dayOfYear(5, 15) },
	{ name: 'Jun', short: 'J', day: dayOfYear(6, 15) },
	{ name: 'Jul', short: 'J', day: dayOfYear(7, 15) },
	{ name: 'Aug', short: 'A', day: dayOfYear(8, 15) },
	{ name: 'Sep', short: 'S', day: dayOfYear(9, 15) },
	{ name: 'Oct', short: 'O', day: dayOfYear(10, 15) },
	{ name: 'Nov', short: 'N', day: dayOfYear(11, 15) },
	{ name: 'Dec', short: 'D', day: dayOfYear(12, 15) }
];

/** Average daylight hours across the whole year for a latitude. */
export function annualAverage(latDeg: number): number {
	let sum = 0;
	for (let n = 1; n <= 365; n++) sum += daylightHours(latDeg, n);
	return sum / 365;
}

/** Convert a date (month, day) into a human label like "15 Jun". */
export function dateLabel(N: number): string {
	const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	const names = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	let day = N;
	let m = 0;
	while (m < 12 && day > monthDays[m]) {
		day -= monthDays[m];
		m++;
	}
	return `${day} ${names[Math.min(m, 11)]}`;
}

/**
 * Colour for a given number of daylight hours, going from deep night-blue (no
 * sun) through sky tones up to a bright golden "midnight sun" yellow.
 */
export function colorForHours(hours: number): string {
	const stops: { h: number; c: [number, number, number] }[] = [
		{ h: 0, c: [15, 23, 42] }, // night – slate
		{ h: 6, c: [30, 58, 138] }, // blue-900
		{ h: 9, c: [37, 99, 235] }, // blue-600
		{ h: 12, c: [14, 165, 233] }, // sky-500
		{ h: 15, c: [250, 204, 21] }, // yellow-400
		{ h: 18, c: [245, 158, 11] }, // amber-500
		{ h: 24, c: [254, 240, 138] } // bright midnight sun
	];

	if (hours <= stops[0].h) return rgb(stops[0].c);
	if (hours >= stops[stops.length - 1].h) return rgb(stops[stops.length - 1].c);

	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i];
		const b = stops[i + 1];
		if (hours >= a.h && hours <= b.h) {
			const t = (hours - a.h) / (b.h - a.h);
			return rgb([
				Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
				Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
				Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)
			]);
		}
	}
	return rgb(stops[0].c);
}

function rgb(c: [number, number, number]): string {
	return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Calendar month (0 = Jan .. 11 = Dec) for a day-of-year N (1..365). */
export function monthIndex(N: number): number {
	const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	let day = N;
	let m = 0;
	while (m < 11 && day > monthDays[m]) {
		day -= monthDays[m];
		m++;
	}
	return m;
}

/** Upper end of the real-sunshine colour scale, in hours of sun per day. */
export const SUNSHINE_MAX = 13;

/**
 * Colour for a number of *real recorded* sunshine hours per day, going from a
 * dim cloudy slate-blue through to a bright sunny gold. Distinct from
 * colorForHours so the two map modes read differently at a glance.
 */
export function colorForSunshine(hours: number): string {
	const stops: { h: number; c: [number, number, number] }[] = [
		{ h: 0, c: [40, 52, 80] }, // very little sun – dim slate-blue
		{ h: 3, c: [47, 84, 150] }, // blue
		{ h: 5, c: [72, 132, 170] }, // teal-blue
		{ h: 7, c: [180, 172, 120] }, // transition
		{ h: 9, c: [245, 190, 60] }, // gold
		{ h: 11, c: [250, 210, 80] }, // bright gold
		{ h: SUNSHINE_MAX, c: [255, 240, 150] } // sunniest
	];

	if (!Number.isFinite(hours) || hours <= stops[0].h) return rgb(stops[0].c);
	if (hours >= stops[stops.length - 1].h) return rgb(stops[stops.length - 1].c);

	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i];
		const b = stops[i + 1];
		if (hours >= a.h && hours <= b.h) {
			const t = (hours - a.h) / (b.h - a.h);
			return rgb([
				Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
				Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
				Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)
			]);
		}
	}
	return rgb(stops[0].c);
}

// A diverse set of cities spanning every continent and a wide range of
// latitudes, including extreme ones to show midnight sun and polar night.
export const CITIES: City[] = [
	// Europe
	{ name: 'Longyearbyen', country: 'Svalbard', lat: 78.22, lon: 15.65 },
	{ name: 'Tromsø', country: 'Norway', lat: 69.65, lon: 18.96 },
	{ name: 'Reykjavík', country: 'Iceland', lat: 64.15, lon: -21.94 },
	{ name: 'Helsinki', country: 'Finland', lat: 60.17, lon: 24.94 },
	{ name: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.07 },
	{ name: 'Edinburgh', country: 'UK', lat: 55.95, lon: -3.19 },
	{ name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.41 },
	{ name: 'London', country: 'UK', lat: 51.51, lon: -0.13 },
	{ name: 'Paris', country: 'France', lat: 48.86, lon: 2.35 },
	{ name: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.7 },
	{ name: 'Rome', country: 'Italy', lat: 41.9, lon: 12.5 },
	{ name: 'Athens', country: 'Greece', lat: 37.98, lon: 23.73 },
	{ name: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62 },

	// Africa
	{ name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24 },
	{ name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38 },
	{ name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82 },
	{ name: 'Johannesburg', country: 'South Africa', lat: -26.2, lon: 28.05 },
	{ name: 'Cape Town', country: 'South Africa', lat: -33.92, lon: 18.42 },

	// Asia
	{ name: 'Dubai', country: 'UAE', lat: 25.2, lon: 55.27 },
	{ name: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88 },
	{ name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82 },
	{ name: 'Bangkok', country: 'Thailand', lat: 13.76, lon: 100.5 },
	{ name: 'Hong Kong', country: 'China', lat: 22.32, lon: 114.17 },
	{ name: 'Beijing', country: 'China', lat: 39.9, lon: 116.4 },
	{ name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
	{ name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98 },
	{ name: 'Yakutsk', country: 'Russia', lat: 62.04, lon: 129.73 },

	// Oceania
	{ name: 'Jakarta', country: 'Indonesia', lat: -6.21, lon: 106.85 },
	{ name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21 },
	{ name: 'Perth', country: 'Australia', lat: -31.95, lon: 115.86 },
	{ name: 'Auckland', country: 'New Zealand', lat: -36.85, lon: 174.76 },

	// North America
	{ name: 'Utqiaġvik', country: 'USA', lat: 71.29, lon: -156.79 },
	{ name: 'Anchorage', country: 'USA', lat: 61.22, lon: -149.9 },
	{ name: 'Vancouver', country: 'Canada', lat: 49.28, lon: -123.12 },
	{ name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38 },
	{ name: 'New York', country: 'USA', lat: 40.71, lon: -74.01 },
	{ name: 'Chicago', country: 'USA', lat: 41.88, lon: -87.63 },
	{ name: 'Los Angeles', country: 'USA', lat: 34.05, lon: -118.24 },
	{ name: 'Mexico City', country: 'Mexico', lat: 19.43, lon: -99.13 },

	// South America
	{ name: 'Bogotá', country: 'Colombia', lat: 4.71, lon: -74.07 },
	{ name: 'Lima', country: 'Peru', lat: -12.05, lon: -77.04 },
	{ name: 'Rio de Janeiro', country: 'Brazil', lat: -22.91, lon: -43.17 },
	{ name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63 },
	{ name: 'Santiago', country: 'Chile', lat: -33.45, lon: -70.67 },
	{ name: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38 },
	{ name: 'Ushuaia', country: 'Argentina', lat: -54.8, lon: -68.3 },

	// Antarctica
	{ name: 'McMurdo Station', country: 'Antarctica', lat: -77.85, lon: 166.67 }
];
