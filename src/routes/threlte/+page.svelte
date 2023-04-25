<script>
	import { Canvas } from '@threlte/core'
	import TestScene from '$lib/TestScene.svelte'; 

	// TODO: Move to global store
	const primaryColor = '#112D4E';
	const secondaryColor = '#3F72AF';
	const tertiaryColor = '#DBE2EF';
	const quaternaryColor = '#F9F7F7';


</script>
	<div class='canvas'>
	<Canvas>
		<TestScene />
	</Canvas>
</div>

<style>
	.main {
		height: 80vh;
		width: 100%;
		flex: 1;
	}
	.canvas {
		height: 100%;
		width: 100%;
	}
</style>