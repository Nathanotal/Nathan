<script lang='ts'>
    export let params: any;
    export let paramControls: any;
    export let paramType: any;
    export let update_params: any;
</script>

<div class="flex flex-col">
    <div class="flex justify-between">
        <span>{paramControls[paramType].alias}</span>
        <span>{params[paramType]}</span>
    </div>
    <input type="range" min={paramControls[paramType].min} max={paramControls[paramType].max} bind:value={params[paramType]} class="range" step={paramControls[paramType].step} on:input={(event) => update_params(event, paramType)}/>
</div>