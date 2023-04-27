<script lang='ts'>
	import EdgeUserAllocation from './EdgeUserAllocation.svelte';
	import { generate_problem } from './logic/initialization'
	import type { EdgeUserAllocationParams } from '$/types/simulation';
	import type { Problem } from '$/types/problem';

	let params: EdgeUserAllocationParams = {
		animation_interval: 100,
		n_users: 6,
		n_servers: 4,
		server_capacity: 3,
		vth_P: 3,
		noise_probability: 0.3,
		noise_strength: 1,
		wta_inhibition: -2,
		capacity_inhibition: -4,
		utilization_excitation: 1,
		problem: null
	}
	const problem:Problem = generate_problem(params);
	params.problem = problem;

</script>

<EdgeUserAllocation params={params}/>


