<script lang='ts'>
	import type { EdgeUserAllocationParams } from '$/types/simulation';
    import { createEventDispatcher } from 'svelte';	
	import type { Problem } from '$/types/problem';
    import { generate_problem } from '../logic/initialization.js'
	import ControlSlider from './ControlSlider.svelte';

    export let params: EdgeUserAllocationParams;

    const dispatch = createEventDispatcher();

    const paramControls: { [key: string]: { min: number, max: number, step: number, alias:string } } = {
        n_users: { min: 1, max: 15, step: 1, alias: 'Users' },
        n_servers: { min: 1, max: 10, step: 1, alias: 'Servers' },
        server_capacity: { min: 1, max: 15, step: 1, alias: 'Server capacity' },
        vth_P: { min: 1, max: 10, step: 1, alias: 'Principal neuron threshold' },
        noise_probability: { min: 0, max: 1, step: 0.05, alias: 'Noise probability' },
        noise_strength: { min: 0, max: 10, step: 0.5, alias: 'Noise strength' },
        wta_inhibition: { min: -20, max: 0, step: 1, alias: 'WTA inhibition' },
        capacity_inhibition: { min: -20, max: 0, step: 1, alias: 'Capacity inhibition' },
        utilization_excitation: { min: 0, max: 20, step: 1, alias: 'Utilization excitation' },
        server_range: { min: 0, max: 1, step: 0.1, alias: 'Server Range' },
        animation_interval: { min: 200, max: 1000, step: 100, alias: 'Simulation speed' } // TODO: fix display
    }

    function update_params(event: any, paramType: 'n_users' | 'n_servers' | 'server_capacity' | 'vth_P' | 'noise_probability' | 'noise_strength' | 'wta_inhibition' | 'capacity_inhibition' | 'utilization_excitation' | 'server_range' | 'animation_interval') {
        let newParams: EdgeUserAllocationParams = { ...params };
        switch (paramType) {
			case 'n_users':
				newParams.n_users = Number(event.target.value);
                newParams.problem = generate_problem(newParams);
				break;
			case 'n_servers':
				newParams.n_servers = Number(event.target.value);
                newParams.problem = generate_problem(newParams);
				break;
			case 'server_range':
				newParams.server_range = Number(event.target.value);
                newParams.problem = generate_problem(newParams);
				break;
			case 'server_capacity':
				newParams.server_capacity = Number(event.target.value);
				break;
			case 'vth_P':
				newParams.vth_P = Number(event.target.value);
				break;
			case 'noise_probability':
				newParams.noise_probability = Number(event.target.value);
				break;
			case 'noise_strength':
				newParams.noise_strength = Number(event.target.value);
				break;
			case 'wta_inhibition':
				newParams.wta_inhibition = Number(event.target.value);
				break;
			case 'capacity_inhibition':
				newParams.capacity_inhibition = Number(event.target.value);
				break;
			case 'utilization_excitation':
				newParams.utilization_excitation = Number(event.target.value);
				break;
			case 'animation_interval':
				newParams.animation_interval = Number(event.target.value);
				break;
		}

        dispatch('updateParams', newParams);
    }

</script>

<div class='paramGrid'>
    {#each Object.keys(paramControls) as paramType}
        <ControlSlider params={params} paramControls={paramControls} paramType={paramType} update_params={update_params} />
    {/each}
</div>

<style>
    .paramGrid {
        flex: 1;
        padding: 10px;
        display: grid;
        grid-template-columns: 0.8fr 0.8fr;
        grid-gap: 10px;
        background-color: "#d3d7de";
    }
</style>
