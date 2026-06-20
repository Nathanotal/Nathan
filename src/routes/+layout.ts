// Render the site as a client-side single-page app: no server-side rendering,
// so the static build never has to execute browser-only code (three.js,
// Leaflet, etc.) on the server.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'ignore';
