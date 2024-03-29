<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { initialize_neurons } from './logic/initialization.js'
	import { get_principal_animations, get_auxiliary_animations, get_user_animations, get_graph_animations } from './logic/animation.js'
	import { simulate_timestep, getFitness } from './logic/simulation.js'
	import Visualization from './components/Visualization.svelte';
	import Neurons from './components/Neurons.svelte';
	import type { SimulationInput, SimulationOutput, EdgeUserAllocationParams } from '$/types/simulation';
	import type { User, Server, Problem } from '$/types/problem'
	import ControlCenter from './components/ControlCenter.svelte';
	import PerformanceDisplay from './components/PerformanceDisplay.svelte';

    export let params: EdgeUserAllocationParams;

	let users: User[] = params.problem.users; // TODO: use these
	let servers: Server[] = params.problem.servers;
	let customAnimationLoop: number;
	let currentFitness: number = 0;
	let previousMaxFitness: number = 0;
	let maxFitness: number = 0;
    let fitnessHistory: number[] = [];

	let animation_interval = params.animation_interval;

	let [
		principal_neurons, 
		user_server_assignments, 
		wta_output, 
		server_utilization,
		user_count_per_server, 
		capacity_output, 
		utilization_output
	] = initialize_neurons(params.n_users, params.n_servers);

	$: {
        users = params.problem.users;
        servers = params.problem.servers;
        animation_interval = params.animation_interval;

        [
            principal_neurons,
            user_server_assignments,
            wta_output,
            server_utilization,
			user_count_per_server,
            capacity_output,
            utilization_output
        ] = initialize_neurons(params.n_users, params.n_servers);
    }

	function updateVariables(result:SimulationOutput): boolean{
		principal_neurons = result.principal_neurons;
		user_server_assignments = result.user_server_assignments;
		wta_output = result.wta_output;
		server_utilization = result.server_utilization;
		user_count_per_server = result.user_count_per_server;
		capacity_output = result.capacity_output;
		utilization_output = result.utilization_output;
		currentFitness = getFitness(params, user_count_per_server);
		let fitnessWasImproved:boolean = false;
		if (currentFitness < maxFitness) {
			previousMaxFitness = maxFitness;
			maxFitness = currentFitness;
			fitnessWasImproved = true; // Side effect, a bit meh
		};
		fitnessHistory.push(currentFitness);

		return fitnessWasImproved;
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
				user_server_assignments: user_server_assignments,
				...params
			}

			const result:SimulationOutput = simulate_timestep(simulationParams);
			
			const fitnessWasImproved: boolean = updateVariables(result);
			
			animations = [];
			animations.push(...get_principal_animations(result, params.vth_P, animation_interval)); // TODO: remove n_servers, n_users
			animations.push(...get_auxiliary_animations(result, animation_interval));
			animations.push(...get_user_animations(result, animation_interval, servers));
			animations.push(...get_graph_animations(fitnessHistory, maxFitness, previousMaxFitness, fitnessWasImproved, animation_interval));
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


	function updateParams(event:any){
		params = event.detail;
	}

	onDestroy(() => {
        if (customAnimationLoop) {
            cancelAnimationFrame(customAnimationLoop);
        }
    });

</script>

<div class='problem'>
	<div class='topRow'>
		<div class='neuronWindow'>
			<Neurons params={params} />
		</div>
		<div class='visualizationWindow'>
			<Visualization params={params}/>
		</div>
	</div>
	<div class='bottomRow'>
		<div class='controlWindow'>
			<ControlCenter bind:params={params} on:updateParams={(e) => updateParams(e)}/>
		</div>
		<div class='performanceWindow'>
			<PerformanceDisplay currentFitness={currentFitness} maxFitness={maxFitness} fitnessHistory={fitnessHistory} />
		</div>
	</div>
	
</div>


<style>
	.problem {
		display: flex;
		height: 100%;
		width: 100%; 
		background: "#d3d7de";
		flex-direction: column;
	}
	.neuronWindow {
		display: flex;
		flex: 1;
	}
	.visualizationWindow {
		display: flex;
		flex: 1;
	}
	.controlWindow {
		display: flex;
		width: 100%;
        max-height: 100%;
		flex: 1;
	}
	.performanceWindow {
		display: flex;
		flex: 1;
	}
	.topRow {
		display: flex;
		flex: 1;
	}
	.bottomRow {
		display: flex;
		flex: 1;
	}
</style>