<script lang="ts">
	import { onMount } from 'svelte';
	import { zeros, ones, add, subtract, multiply } from 'mathjs'
	import { initialize_neurons, initialize_painted_neurons } from './initialization.ts'
	import { get_principal_animations, get_auxiliary_animations } from './animation.ts'
	import { simulate_timestep } from './simulation.ts'
	import type { SimulationInput, SimulationOutput, EdgeUserAllocationParams } from '$/types/simulation';

	let customAnimationLoop: number;
    export let params: EdgeUserAllocationParams;
	let animation_interval = params.animation_interval;

	let n_users = params.n_users;
	let n_servers = params.n_servers;
	let server_capacity = params.server_capacity;
	let vth_P = params.vth_P;
	let noise_probability = params.noise_probability;;
	let noise_strength = params.noise_strength;
	let wta_inhibition = params.wta_inhibition;
	let capacity_inhibition = params.capacity_inhibition;
	let utilization_excitation = params.utilization_excitation;

	const [
		layers,
		utilization_neurons,
		capacity_neurons,
		wta_neurons
	] = initialize_painted_neurons(n_users, n_servers);

	let [
		principal_neurons, 
		user_server_assignments, 
		wta_output, 
		server_utilization, 
		capacity_output, 
		utilization_output
	] = initialize_neurons(n_users, n_servers);

	function updateVariables(result:SimulationOutput){
		principal_neurons = result.principal_neurons;
		user_server_assignments = result.user_server_assignments;
		wta_output = result.wta_output;
		server_utilization = result.server_utilization;
		capacity_output = result.capacity_output;
		utilization_output = result.utilization_output;
	}

	function loop(t:number, animations:any[], targets: any, lastUpdate: number, step: number) {
		animations.forEach((animation) => {
			animation.tick(t);
		}); // TODO: make more performant

		if (t-lastUpdate > animation_interval){
			lastUpdate = t;
			step += 1;

			const simulationParams:SimulationInput = {
				principal_neurons: principal_neurons,
				wta_output: wta_output,
				capacity_output: capacity_output,
				utilization_output: utilization_output,
				wta_inhibition: wta_inhibition,
				capacity_inhibition: capacity_inhibition,
				utilization_excitation: utilization_excitation,
				vth_P: vth_P,
				n_users: n_users,
				n_servers: n_servers,
				noise_probability: noise_probability,
				noise_strength: noise_strength,
				server_capacity: server_capacity
			}

			const result:SimulationOutput = simulate_timestep(simulationParams);
			updateVariables(result);
			animations = [];
			animations.push(...get_principal_animations(result, n_servers, n_users, vth_P, animation_interval)); // TODO: remove n_servers, n_users
			animations.push(...get_auxiliary_animations(result, animation_interval));
		}

		customAnimationLoop = requestAnimationFrame((t) => loop(t, animations, targets, lastUpdate, step));
	}

	onMount(() => {
		// If there is a custom animation loop, cancel it
		if (customAnimationLoop) {
			cancelAnimationFrame(customAnimationLoop);
		}
		const targets = document.querySelectorAll('.neuron');
		const animations:any = [];
		requestAnimationFrame((t) => loop(t, animations, targets, 0, 0));
	});

</script>

<!-- A window which fills 80% of the width and height of the screen -->
<div class="window">
	<div class='main_network_row'>
	<div class='utilization_neurons'>
		<div class="layer">
			{#each utilization_neurons as neuron, j}
				<div class="neuron column_neurons u_{j}" id={neuron.id}>
					<!-- {neuron.id + 1} -->
				</div>
			{/each}
		</div>
	</div>
	<div class='principal_network'>
	{#each layers as layer, i}
		<div class="layer">
			{#each layer.neurons as neuron, j}
				<div class="neuron i{i}{j}" id={neuron.id}>
					<!-- {neuron.id + 1} -->
				</div>
			{/each}
		</div>
	{/each}
</div>
<div class='capacity_neurons'>
	<div class="layer">
		{#each capacity_neurons as neuron, j}
			<div class="neuron column_neurons c_{j}" id={neuron.id}>
				<!-- {neuron.id + 1} -->
			</div>
		{/each}
	</div>
</div>
</div>
<div class='wta_neurons'>
	<div class="layer_horizontal">
		{#each wta_neurons as neuron, j}
			<div class="neuron w_{j}" id={neuron.id}>
				<!-- {neuron.id + 1} -->
			</div>
		{/each}
	</div>
</div>
</div>

<style src="./styles.css" lang="css"></style>
