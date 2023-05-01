<script lang='ts'>
	import type { EdgeUserAllocationParams } from '$/types/simulation';
	import { writable  } from 'svelte/store';
	import type { Writable } from 'svelte/store';
	import type {User, Server, Problem} from '$/types/problem'
	import { onMount } from 'svelte';
	let visualisering_width:number = 0;
	let visualisering_height:number = 0;
	
    export let params: EdgeUserAllocationParams;

	let users: User[], servers: Server[];

	$: {
        users = params.problem.users;
        servers = params.problem.servers;
    }

	const updateDimensions = () => {
        let visualisering = document.querySelector('.visualisering');
        if (visualisering) {
            visualisering_width = visualisering.clientWidth;
            visualisering_height = visualisering.clientHeight;
        }
    };

	onMount(() => {
		// Get the width and height of the .visualisering window
		updateDimensions();
		window.addEventListener('resize', updateDimensions);
        return () => {
            window.removeEventListener('resize', updateDimensions);
        };
	})

</script>

<div class='basfonster'>
	<div class='visualisering'>
		{#each users as user, i}
			<div class='user user_{i}' style='left: {user.x * visualisering_width}px; top: {user.y * visualisering_height}px;'>
			</div>
		{/each}
		{#each servers  as server, i}
			<div class='server server_{i}' style='left: {server.x * visualisering_width}px; top: {server.y * visualisering_height}px; background-color: rgb({server.color[0]}, {server.color[1]}, {server.color[2]}); '>
			</div>
			<div class='server_radius server_radius_{i}' style='left: {server.x * visualisering_width}px; top: {server.y * visualisering_height}px; background-color: rgba({server.coverageColor[0]}, {server.coverageColor[1]}, {server.coverageColor[2]}, 0.05); '>
			</div>
		{/each}
	</div>
</div>


<style>
	.basfonster {
		display: flex;
		background-color: "#d3d7de";
		flex-direction: column;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	.neuroner {
		flex: 1;
		background-color: black;
	}
	.visualisering {
		position: relative;
		flex: 4;
	}
	.user {
		position: absolute;
		background-color: black;
		min-width: 10px;
		min-height: 10px;
		aspect-ratio: 1/1;
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}
	.server {
		position: absolute;
		background-color: black;
		min-width: 10px;
		min-height: 8.66px; /* sqrt(3)/2 */
		clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
		transform: translate(-50%, -50%);
		transform-origin: center;

	}
	.server_radius {
		/* TODO: make dynamic */
		position: absolute;
		min-width: 300px;
		min-height: 300px; 
		border: 2px dotted black; /* Add a solid border */
		border-radius: 50%;
		transform: translate(-50%, -50%);
		transform-origin: center;
	}
</style>