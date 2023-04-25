import { zeros, ones, add, subtract, multiply } from 'mathjs'
import type { Neuron } from '$/types/neuron';
import type { Layer } from '$/types/layer';
import type { Matrix } from 'mathjs' 
import { matrix } from 'mathjs'

export function initialize_neurons(n_users: number, n_servers: number){
    const principal_neurons: Matrix = matrix(zeros(n_servers, n_users));
    const user_column:Matrix = matrix(zeros(1, n_users));
    const server_column:Matrix = matrix(zeros(n_servers, 1));
    return [principal_neurons, user_column, user_column, server_column, server_column, server_column]
}

export function initialize_painted_neurons(n_users: number, n_servers: number){
    const layers: Layer[] = [];
	const utilization_neurons: Neuron[] = [];
	const capacity_neurons: Neuron[] = [];
	const wta_neurons: Neuron[] = [];

    let current_id = 0;

    for (let i = 0; i < n_users; i++) {
		const neurons: Neuron[] = [];
		for (let j = 0; j < n_servers; j++) {
			neurons.push({
				id: current_id
			});
		}
        current_id++;
		
		layers.push({
			id: current_id,
			neurons: neurons
		});
        current_id++;
	}

	for (let i = 0; i < n_servers; i++) {
		utilization_neurons.push({
			id: current_id
		}); 
        current_id++;
		capacity_neurons.push({
			id: current_id
		});
        current_id++;
	}

	
	for (let i = 0; i < n_users; i++) {
		wta_neurons.push({
			id: current_id
		});
        current_id++;
	}

    return [layers, utilization_neurons, capacity_neurons, wta_neurons]
}