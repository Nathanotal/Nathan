<script lang="ts">
	import { onMount } from 'svelte';
	import { initialize_neurons } from './initialization.ts'
	import { get_principal_animations, get_auxiliary_animations, get_user_animations } from './animation.ts'
	import { simulate_timestep } from './simulation.ts'
	import Visualization from './Visualization.svelte';
	import Neurons from './Neurons.svelte';
	import type { SimulationInput, SimulationOutput, EdgeUserAllocationParams } from '$/types/simulation';
	import type { User, Server, Problem } from '$/types/problem'

    export let params: EdgeUserAllocationParams;

	let users: User[] = params.problem.users; // TODO: use these
	let servers: Server[] = params.problem.servers;

	let customAnimationLoop: number;
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

	function loop(t:number, animations:any[], lastUpdate: number, step: number) {
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
				server_capacity: server_capacity,
				user_server_assignments: user_server_assignments
			}

			const result:SimulationOutput = simulate_timestep(simulationParams);
			updateVariables(result);
			animations = [];
			animations.push(...get_principal_animations(result, vth_P, animation_interval)); // TODO: remove n_servers, n_users
			animations.push(...get_auxiliary_animations(result, animation_interval));
			animations.push(...get_user_animations(result, animation_interval, servers));
		}
		customAnimationLoop = requestAnimationFrame((t) => loop(t, animations, lastUpdate, step));
	}

	onMount(() => {
		// If there is a custom animation loop, cancel it, todo: fix better solution
		if (customAnimationLoop) {
			cancelAnimationFrame(customAnimationLoop);
		}
		const animations:any = [];
		requestAnimationFrame((t) => loop(t, animations, 0, 0));
	});

</script>

<div class='problem'>
	<div class='neuronWindow'>
		<Neurons params={params} />
	</div>
	<div class='visualizationWindow'>
		<Visualization params={params}/>
	</div>
</div>


<style>
	.problem {
		display: flex;
		height: 100%;
		width: 100%; 
		background: green;
	}
	.neuronWindow {
		display: flex;
		flex: 1;
		background-color: aquamarine;
	}
	.visualizationWindow {
		display: flex;
		flex: 1;
		background-color: aqua;
	}
</style>