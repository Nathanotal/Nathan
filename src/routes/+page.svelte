<script>
	import anime from 'animejs/lib/anime.es.js';
	import { onMount } from 'svelte';

	onMount(() => {
		anime({
			targets: 'div',
			translateX: 250,
			backgroundColor: '#FFF',
			duration: 800
		});
	});
</script>

<html lang="english">
	<head>
		<title>Nathan</title>
	</head>
	<body>
		<div>
			<h1>Nathan</h1>
		</div>
	</body>
</html>

<style>
	h1 {
		color: red;
	}
</style>
