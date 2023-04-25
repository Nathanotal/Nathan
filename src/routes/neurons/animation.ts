import anime from 'animejs'
import type { SimulationInput, SimulationOutput } from '$/types/simulation';

export function get_principal_animations(result:SimulationOutput, n_servers:number, n_users:number, vth_P: number, animation_interval:number){
    // Returns one animation for each principal neuron based 
    // on the value of the neuron
    const animations = [];
    const principal_neurons_from_param = result.principal_neurons;
    const firing_neurons = result.firing_neurons;
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

