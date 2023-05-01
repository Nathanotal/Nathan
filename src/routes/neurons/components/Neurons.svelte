<script lang='ts'>
    import { initialize_painted_neurons } from '../logic/initialization.js';
    export let params: EdgeUserAllocationParams;
	import type { EdgeUserAllocationParams } from '$/types/simulation';

    let layers:any, utilization_neurons:any,capacity_neurons:any, wta_neurons:any;

	$: {
		[
			layers,
			utilization_neurons,
			capacity_neurons,
			wta_neurons
		] = initialize_painted_neurons(params.n_users, params.n_servers);
	}
</script>
<!-- A window which fills 80% of the width and height of the screen -->
<div class="window">
	<div class='main_network_row'>
	<div class='utilization_neurons'>
		<div class="layer">
			{#each utilization_neurons as neuron, j}
				<div class="neuron u_{j}" id={neuron.id}>
				</div>
			{/each}
		</div>
	</div>
	<div class='principal_network'>
		{#each layers as layer, i}
			<div class="layer">
				{#each layer.neurons as neuron, j}
					{#if params.problem.constraintMatrix.get([j,i]) == 1}
						<div class="neuron i{i}{j}" id={neuron.id}>
						</div>
					{:else}
					<!-- TODO: fix this -->
						<div class="neuron i{i}{j}" style="visibility: hidden" id={neuron.id}>
							
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
	<div class='capacity_neurons'>
		<div class="layer">
			{#each capacity_neurons as neuron, j}
				<div class="neuron c_{j}" id={neuron.id}>
					<!-- A little colored indicator to show which server -->
					<!-- the capacity neuron is associated with -->
					<div class="indicator" style="background-color: rgb({params.problem.servers[j].color[0]}, {params.problem.servers[j].color[1]}, {params.problem.servers[j].color[2]});">
					</div>
				</div>
			{/each}
		</div>
	</div>
	</div>
	<div class='wta_neurons'>
		<div class="layer_horizontal">
			{#each wta_neurons as neuron, j}
				<div class="neuron w_{j}" id={neuron.id}>
				</div>
			{/each}
		</div>
	</div>
</div>

<style src="../styles.css" lang="css"></style>