<script lang='ts'>
    export let currentFitness:number;
    export let maxFitness:number;
    export let fitnessHistory:number[];

</script>

<div class='displayContainer'>
    <!-- Make a graph which occupies the rest of the space -->
    <div class='graph'>
        <div class='graphSvg'>
            <svg class='leSvg' viewBox='0 0 200 100'>
                <!-- <path d='M 0 0 L 100 100' stroke='black' stroke-width='2' fill='none'></path> -->
                <!-- <path fill="rgba(75, 192, 192, 0.2)" stroke="rgba(75, 192, 192, 1)" stroke-width="2"></path> -->
                <path d='' stroke="black" stroke-width="4" id='currentPath'></path>
                <path d='' stroke="black" stroke-width="4" id='currentSegment'></path>
            </svg>
        </div>
        <div class='performanceIndicator'></div>
    </div>
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
        background-color: "#d3d7de";
        
    }
    .graph {
        display: flex;
        position: relative;
        width: 80%; /* TODO: change to 100 */
        /* height: 50%; */
        background-color: white;
    }
    .performanceIndicator {
        position: absolute;
        width: 10px; /* TODO: scale */
        height: 10px;
        background-color: red;
        right: 0;
        padding: 0;
    }
    .graphSvg {
        width: 100%;
        height: 100%;
        background: white;
    }
    .leSvg{
        height: 100%;
        background-color: white;
    }

</style>