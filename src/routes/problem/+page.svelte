<script lang="ts">
	// import anime from 'animejs/lib/anime.es.js';
	import { onMount } from 'svelte';
	import type { Server } from '$/types/server';
	import type { User } from '$/types/user';

	const servers: Server[] = [];
	const users: User[] = [];
	const positions: number[][] = [];

	const n_servers = 5; // temp
	const n_users = 20; // temp
	const capacity = 10; // temp


	function randomizePosition() {
		const x = Math.round(Math.random() * 18);
		const y = Math.round(Math.random() * 18);
		return [x, y];
	}

	function randomizeUniquePosition(existing: number[][]) {
		let position = randomizePosition();
		let i = 0;
		while (existing.includes(position)) {
			position = randomizePosition();
			i++;
			if (i > 100) {
				throw new Error("Could not find unique position");
			}
		}
		const above = [position[0], position[1] + 1];
		const below = [position[0], position[1] - 1];
		const left = [position[0] - 1, position[1]];
		const right = [position[0] + 1, position[1]];

		existing.push(position);
		existing.push(above);
		existing.push(below);
		existing.push(left);
		existing.push(right);

		return position;
	}


	for (let i = 0; i < n_users; i++) {
		// Generate placeholder users
		users.push({
			id: i,
			position: randomizeUniquePosition(positions),
    		resourceRequirement: 1,
			color: "blue"
		});
	}

	for (let i = 0; i < n_servers; i++) {
		// Generate placeholder servers
		const range = Math.round(Math.random() * 15);
		servers.push({
			id: i,
			position: randomizeUniquePosition(positions),
			color: "red",
			range: range,
			capacity: capacity
		});
	}
</script>

<html lang="english">
	<head>
		<title>Neuromorphic visualization</title>
	</head>
	<body>
		<!-- <h1>Problem visualization</h1> -->
		<!-- A window which fills 80% of the width and height of the screen -->
		<div class="window">
			{#each Array.from(Array(20).keys()) as x}
				<div class='row'>
					
				
				{#each Array.from(Array(20).keys()) as y}
					<div class='gridbox'>
						{#each servers as server}
							{#if server.position[0] == x && server.position[1] == y}
								<div class='server' style='background-color: {server.color};'></div>
							{/if}
						{/each}
						{#each users as user}
							{#if user.position[0] == x && user.position[1] == y}
								<div class='user' style='background-color: {user.color};'></div>
							{/if}
						{/each}
					</div>
				{/each}

			</div>

			{/each}
	</div>
	</body>
</html>

<style>
	.window {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		flex: 1;
		background: #000;
		justify-content: center;
		align-content: flex-start;
		align-items: flex-start;
		padding: 10px;
		border: 5px solid blue;
	}
	.row {
		display: flex;
		flex-direction: row;
		justify-content: space-around;
		align-items: center;
		height: 5%;
		width: 100%;
		/* background-color: blueviolet; */
	}
	.gridbox {
		width: 25px;
		height: 25px;
		/* Debug border */
		/* background-color: rosybrown; */
		/* border: 1px solid black; */

	}
	.user {
		background: #fff;
		border-radius: 50%;
		height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.server {
		background: #fff;
		border-radius: 50%;
		height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}
</style>
