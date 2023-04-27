<script lang='ts'>
	import { getFitness } from '../logic/simulation.js';
    import type { EdgeUserAllocationParams } from '$/types/simulation';
	import type { Matrix } from 'mathjs';
    
    export let params: EdgeUserAllocationParams;
    export let userCountPerServer: Matrix;

    let currentFitness: number = 0;
    let fitnessHistory: number[] = [];

    // Every time assignments are updated, calculate fitness and update fitness history
    $: {
        currentFitness = getFitness(params, userCountPerServer);
        fitnessHistory = [...fitnessHistory, currentFitness];
    }

</script>

<div class='displayContainer'>
    <h2>Current fitness: {currentFitness}</h2>
    <!-- <h2>Historical fitness: {fitnessHistory}</h2> -->
</div>

<style>
    .displayContainer {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 16px;
    }
</style>