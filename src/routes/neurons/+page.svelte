<script lang="ts">
	import anime from 'animejs/lib/anime.es.js';
	import { onMount } from 'svelte';
	import type { Neuron } from '$/types/neuron';
	import type { Layer } from '$/types/layer';

	const layers: Layer[] = [];

	const n_servers = 5;
	const n_users = 20;

	for (let i = 0; i < n_users; i++) {
		const neurons: Neuron[] = [];
		for (let j = 0; j < n_servers; j++) {
			neurons.push({
				id: j
			});
		}
		
		layers.push({
			id: i,
			neurons: neurons
		});
	}


	onMount(() => {
		anime(
			{
				targets: '.neuron',
				scale: [
					{value: 1, easing: 'easeOutSine', duration: 200},
					{value: 0.5, easing: 'easeInOutQuad', duration: 200},
					{value: 1, easing: 'easeInOutQuad', duration: 200},
					{value: 1, easing: 'easeInOutQuad', duration: 0},
				],
				loop: true
			}
			);
	});
</script>

<html lang="english">
	<head>
		<title>Neuromorphic visualization</title>
	</head>
	<body class="main">
		<h1>Homepage</h1>
		<!-- A window which fills 80% of the width and height of the screen -->
		<div class="window">
			{#each layers as layer}
				<div class="layer">
					{#each layer.neurons as neuron}
						<div class="neuron" id={neuron.id}>
							<!-- {neuron.id + 1} -->
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</body>
</html>

<style>
	html {
		flex: 1;
		height: 100%;
	}
	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.window {
		display: flex;
		flex: 1;
		background: #000;
		justify-content: space-around;
		align-items: center;
		padding: 10px;
	}
	.layer{
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: space-around;
		/* border: red; */
		/* border-style: solid; */
		/* border-width: 1px; */
	}
	.neuron {
		background: #fff;
		border-radius: 50%;
		height: 25px;
		width: 25px;
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 10%;
		margin-bottom: 10%;
	}
</style>
