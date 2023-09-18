<script>
	import { onMount } from 'svelte';
	onMount(() => {
	});
</script>

<head>
	<title>Neuromorphic visualization</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>

<div class="icon-container">
	<div class="icon-item">
		<a href="/neurons">
			<i class="fas fa-brain fa-3x navigation_icon"></i>
			<p>SSNN simulator</p>
		</a>
	</div>
	<div class="icon-item">
		<a href="/problem">
			<i class="fa-solid fa-address-card navigation_icon"></i>
			<p>About me</p>
		</a>
	</div>
	<!-- Add more icons here -->
</div>

<style>
	.icon-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		height: 100%;
		width: 100%;
	}

	.icon-item {
		margin: 50px;
		text-align: center;
	}

	.icon-item a {
		text-decoration: none;
		color: inherit;
	}

	.navigation_icon {
		font-size: 100px;
	}
</style>


