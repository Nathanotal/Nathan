import { zeros, ones, add, subtract, multiply } from 'mathjs'
import type { Neuron } from '$/types/neuron';
import type { Layer } from '$/types/layer';
import type { Matrix } from 'mathjs' 
import { matrix } from 'mathjs'
import type {User, Server, Problem} from '$/types/problem'

export function initialize_neurons(n_users: number, n_servers: number){
    const principal_neurons: Matrix = matrix(zeros(n_servers, n_users));
    const user_column:Matrix = matrix(zeros(1, n_users));
    const server_column:Matrix = matrix(zeros(n_servers, 1));
	// The first second user_server_assignments, default this to -1
	const user_server_assignments: Matrix = matrix(subtract(user_column, ones(1, n_users)))
    return [principal_neurons, user_server_assignments, user_column, server_column, server_column, server_column]
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

export function generate_problem(params: any): Problem {
	let servers = generate_servers(params);
	let users = generate_users(params);

	return {
		users: users,
		servers: servers
	}
}


function generate_servers(params:any){
	let servers: Server[] = [];
	// Maximum 10 (think about expanding this)
	const colors_to_choose_from = [
		[255, 65, 54],
		[255, 133, 27],
		[255, 220, 0],
		[46, 204, 64],
		[0, 116, 217],
		[177, 13, 201],
		[240, 18, 190],
		[127, 219, 25],
		[1, 255, 112],
		[61, 153, 112]
	]

	if (params.n_servers > colors_to_choose_from.length){
		throw new Error("Too many servers, not enough colors")
	}

	for (let i = 0; i < params.n_servers; i++){
		const color = colors_to_choose_from[i];
		let [x, y] = get_random_position();
		servers.push({
			id: i,
			x: x,
			y: y,
			capacity: 2,
			allocated_users: [],
			range: 0.3,
			color: color,
			coverageColor: color
		})
	}

	return servers
}

function generate_users(params:any){
	let users: User[] = [];

	for (let i = 0; i < params.n_users; i++){
		let [x, y] = get_random_position();
		users.push({
			id: i,
			x: x,
			y: y
		})
	}

	return users
}

function get_random_position(){
	let x = Math.random()*0.8+0.1;
	let y = Math.random()*0.8+0.1;

	return [x, y]
}