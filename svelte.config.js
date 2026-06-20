import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';
import seqPreprocessor from 'svelte-sequential-preprocessor';
import { preprocessThrelte } from '@threlte/preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: seqPreprocessor([preprocess(), preprocessThrelte()]),
	kit: {
		// Ship a fully static single-page app. The whole site is client-side
		// (Leaflet, three.js/threlte, the neuron sim), so there is no server to
		// deploy and no Node runtime version that can break on Vercel. The
		// fallback page lets the client router handle every route.
		adapter: adapter({
			fallback: 'index.html',
			precompress: false
		})
	}
};

export default config;
