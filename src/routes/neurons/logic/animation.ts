import anime from 'animejs'
import type { SimulationInput, SimulationOutput } from '$/types/simulation';

export function get_user_animations(result:SimulationOutput, animation_interval:number, servers: any[]){
    const animations:any = [];

    result.user_server_assignments.forEach((assignment: any, index:number[]) => {
        const user_index = index[1];
        if (assignment === -1) {
            return; // Unassigned
        }
        const server = servers[assignment];
        const r = server.color[0];
        const g = server.color[1];
        const b = server.color[2];
        const animation = anime({
            targets: `.user_${user_index}`,
            background: `rgb(${r},${g},${b})`,
            duration: animation_interval,
            easing: 'linear', // TODO: make custom
            autoplay: false,
            loop: false
        });

        animations.push(animation);
    });

    
    return animations;
}

export function get_principal_animations(result:SimulationOutput, vth_P: number, animation_interval:number){
    // Returns one animation for each principal neuron based 
    // on the value of the neuron
    const animations = [];
    const principal_neurons_from_param = result.principal_neurons;
    const firing_neurons = result.firing_neurons;
    const n_servers = firing_neurons.size()[0];
    const n_users = firing_neurons.size()[1];
    // TODO: make more performant
    for (let i = 0; i < n_servers; i++) {
        for (let j = 0; j < n_users; j++) {
            const neuron_name = `.i${j}${i}`; // Transposed!
            if (firing_neurons.get([i, j]) === 1) {
                animations.push(get_firing_animation(neuron_name, animation_interval));
                continue;
            }
            const charge = principal_neurons_from_param.get([i, j]);
            // const current_col = anime.get(neuron_name, 'background')
            const target_col = `rgb(${charge*255/vth_P},0,${255-charge*255/vth_P})`;
            const animation = get_leak_animation(neuron_name, target_col, animation_interval);
            animations.push(animation);
        }
    }

    return animations;
}

export function get_auxiliary_animations(result:SimulationOutput, animation_interval:number){
    const animations: any[] = [];
    const firing_users = result.firing_users;
    const firing_servers = result.firing_servers;
    const servers_at_capacity = result.servers_at_capacity;

    firing_users.forEach((neuron: any, index:number[]) => {
        if (neuron === 0) return;
        const neuron_name = `.w_${index[1]}`;
        animations.push(get_firing_animation(neuron_name, animation_interval));
    });
    firing_servers.forEach((neuron: any, index:number[]) => {
        if (neuron === 0) return;
        const neuron_name = `.u_${index[0]}`;
        animations.push(get_firing_animation(neuron_name, animation_interval));
    });
    servers_at_capacity.forEach((neuron: any, index:number[]) => {
        if (neuron === 0) return;
        const neuron_name = `.c_${index[0]}`;
        animations.push(get_firing_animation(neuron_name, animation_interval));
    });

    return animations;
}

function get_leak_animation(neuron_name:string, target_col:string, animation_interval:number){
    const animation = anime({
                targets: neuron_name, 
                background: target_col,
                duration: animation_interval,
                easing: 'linear', // TODO: make custom
                autoplay: false,
                loop: false
            }); // TODO: break out
    return animation;
}

function get_firing_animation(targets: string, animation_interval:number){
    const neuron_firing_animation = anime.timeline({
            easing: 'easeOutExpo',
            duration: Math.floor(animation_interval/3),
            autoplay: false,
            loop: false
        });
        neuron_firing_animation.add({
            targets: targets,
            background: `rgb(255,0,0)`,
            scale: 1.1,
        });
        neuron_firing_animation.add({
            targets: targets,
            scale: 0.5,
        })
        neuron_firing_animation.add({
            targets: targets,
            background: `rgb(0,0,255)`,
            scale: 1,
        });
    return neuron_firing_animation;
}

export function get_graph_animations(fitnessHistory: number[], max_fitness: number, previousMaxFitness:number, fitnessWasImproved:boolean, animation_interval: number){
    const animations = [];
    const indicator_name = '.performanceIndicator';
    animations.push(get_indicator_animation(indicator_name, animation_interval, fitnessHistory, max_fitness));
    const container = document.querySelector('.graphSvg') as HTMLElement;
    const historyAnimations = get_history_line_animation(fitnessHistory, max_fitness, previousMaxFitness, fitnessWasImproved, container, animation_interval);
    if (historyAnimations) animations.push(...historyAnimations);
        
    return animations;
}


function get_indicator_animation(targets: string, animation_interval: number, fitnessHistory: number[], max_fitness: number) {
    const target = document.querySelector(targets);
    const translateYValue = getIndicatorYPosition(fitnessHistory[fitnessHistory.length - 1], max_fitness, target);

    const animation = anime({
        autoplay: false,
        loop: false,
        targets: target,
        duration: animation_interval,
        easing: "linear",
        translateY: translateYValue,
    });

    return animation;
}

function get_history_line_animation(fitnessHistory: number[], max_fitness: number, previousMaxFitness:number, fitnessWasImproved:boolean, container: HTMLElement, animation_interval: number): anime.AnimeInstance[] | undefined {
    // TODO: fix this
    const animations:anime.AnimeInstance[] = [];
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const oldPathSvg = container.querySelector<SVGPathElement>("#currentPath");
    const oldSegmentSvg = container.querySelector<SVGPathElement>("#currentSegment");
    
    const totalTimesteps = fitnessHistory.length;

    const previousY = fitnessHistory[totalTimesteps - 2];
    const currentY = fitnessHistory[totalTimesteps - 1];

    if (totalTimesteps <= 1) return;

    let yScaleFactor = 1;
    if (fitnessWasImproved){
        yScaleFactor = previousMaxFitness / max_fitness;
    } 

    const oldPathString: string | null | undefined = oldPathSvg?.getAttribute("d");
    const oldSegmentString: string | null | undefined = oldSegmentSvg?.getAttribute("d");
    if (typeof(oldPathString) != 'string' || typeof(oldSegmentString) != 'string') return;
    // currentY === max_fitness
    const newPathString = constructNewPathString(oldPathString, oldSegmentString, totalTimesteps, yScaleFactor);
    oldPathSvg?.setAttribute("d", newPathString);
    const historyAnimation = anime({
        targets: '#currentPath',
        duration: animation_interval,
        easing: "linear",
        loop: false,
        autoplay: false,
    });

    animations.push(historyAnimation);

    const newSegment = constructNewSegmentString(previousY, currentY, totalTimesteps, max_fitness, yScaleFactor)

    oldSegmentSvg?.setAttribute("d", newSegment);

    const segmentAnimation = anime({
        targets: '#currentSegment',
        strokeDashoffset: [anime.setDashoffset, 0],
        easing: 'easeInOutSine',
        duration: animation_interval,
        autoplay: false,
        loop: false,
    });

    animations.push(segmentAnimation);

    return animations;
}
function constructNewPathString(oldPathString: string, oldSegmentString: string, totalTimesteps: number, yScaleFactor:number): string {
    const oldPathCommands = oldPathString.split(/([ML])/).filter(s => s !== '');
    const oldSegmentCommands = oldSegmentString.split(/([ML])/).filter(s => s !== '');

    const adjustedOldPathCommands = oldPathCommands.map((command, index) => {
        if (command === "M" || command === "L") {
            return command;
        } else {
            const [x, y] = command.split(",");
            const oldX = parseFloat(x);
            const newX = oldX * (totalTimesteps - 1) / totalTimesteps;
            // Scale the Y if it is not the last command
            if (index !== oldSegmentCommands.length){
                const newY = parseFloat(y) * yScaleFactor;
                return newX + "," + newY;
            }
            return newX + "," + y;
        }
    });

    const adjustedOldSegmentCommands = oldSegmentCommands.map((command, index) => {
        if (command === "M" || command === "L") {
            return command;
        } else {
            const [x, y] = command.split(",");
            const oldX = parseFloat(x);
            const newX = oldX * (totalTimesteps - 1) / totalTimesteps;
            // Scale the Y if it is not the last command
            if (index !== oldSegmentCommands.length){
                const newY = parseFloat(y) * yScaleFactor;
                return newX + "," + newY;
            }
            return newX + "," + y;
        }
    });

    let newPathString;
    if (!oldPathString && totalTimesteps < 4) {
        newPathString = adjustedOldSegmentCommands.join("");
    } else {
        newPathString = adjustedOldPathCommands.join("") + " " + adjustedOldSegmentCommands.join("");
    }

    return newPathString;
}

function constructNewSegmentString(previousY: number, currentY: number, totalTimesteps: number, max_fitness: number, scaleFactor: number): string {
    const previousXcoordinate = 200 * (totalTimesteps - 2) / (totalTimesteps - 1);
    const currentXcoordinate = 200;

    let previousYcoordinate;
    let currentYcoordinate;
    if (max_fitness === 0) {
        previousYcoordinate = 0;
        currentYcoordinate = 0;
    } else {
        previousYcoordinate = 100 * (previousY / max_fitness) * scaleFactor;
        if (scaleFactor == 1){
            previousYcoordinate = 100;
            currentYcoordinate = 100;
        } else{
            currentYcoordinate = 100 * (currentY / max_fitness);
        }
    }

    const newSegmentString = `M${previousXcoordinate},${previousYcoordinate} L${currentXcoordinate},${currentYcoordinate}`;

    return newSegmentString;
}


function getIndicatorYPosition(fitness: number, max_fitness: number, target:any): number{
    const elementHeight = target.clientHeight;
    const parentHeight = target.parentElement.clientHeight;
    let percentage;
    if (fitness === 0) percentage = 0;
    else percentage = 100*Math.abs(fitness/max_fitness);
    const toReturn = (parentHeight-elementHeight)*(percentage/100);
    return toReturn;
}
