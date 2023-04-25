<script lang='ts'>
	import EdgeUserAllocation from './EdgeUserAllocation.svelte';
	import type { EdgeUserAllocationParams } from '$/types/simulation';

	let params: EdgeUserAllocationParams = {
		animation_interval: 200,
		n_users: 40,
		n_servers: 6,
		server_capacity: 15,
		vth_P: 3,
		noise_probability: 0.3,
		noise_strength: 1,
		wta_inhibition: -2,
		capacity_inhibition: -4,
		utilization_excitation: 1
	}

</script>

<div class='problem'>
	<div class='neuronWindow'>
		<EdgeUserAllocation params={params}/>
	</div>
	<!-- <div class='visualizationWindow'>

	</div> -->

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