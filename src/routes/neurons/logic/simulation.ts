import { zeros, ones, add, matrix, multiply, max, sum, dotMultiply } from 'mathjs'
import type { SimulationInput, SimulationOutput, EdgeUserAllocationParams } from '$/types/simulation';
import type { Matrix } from 'mathjs' // TODO: fix

function get_raster(n_servers: number, n_users: number, noise_probability: number, noise_strength: number) {
    const raster: Matrix = matrix(zeros(n_servers, n_users));
    // TODO: make more performant
    for (let i = 0; i < n_servers; i++) {
        for (let j = 0; j < n_users; j++) {
            if (Math.random() < noise_probability) {
                raster.set([i, j], noise_strength);
            }
        }
    }
    return raster;
}

export function simulate_timestep(params:SimulationInput) {
    // Calculate all inputs
    const noise = get_raster(params.n_servers, params.n_users, params.noise_probability, params.noise_strength);
    const wta_input = multiply(params.wta_output, params.wta_inhibition);
    const capacity_input = multiply(params.capacity_output, params.capacity_inhibition); 
    const utilization_input = multiply(params.utilization_output, params.utilization_excitation);

    // Calculate and add server specific signals
    const ones_users = ones(1, params.n_users); // TODO: move
    const server_specific = add(utilization_input, capacity_input);
    const server_signal_matrix = multiply(server_specific, ones_users);

    // Calculate and add user specific signals
    const ones_servers = ones(params.n_servers, 1); // TODO: move
    const user_signal_matrix = multiply(ones_servers, wta_input);
    
    let total_input:any = add(server_signal_matrix, user_signal_matrix);
    total_input = add(total_input, noise);

    // Calculate principal network state
    params.principal_neurons = multiply(params.principal_neurons, 0.8); // Leak
    params.principal_neurons = add(params.principal_neurons, total_input); // Add input
    params.principal_neurons = dotMultiply(params.principal_neurons, params.problem.constraintMatrix); // Satisfy constraints

    // Get firing neurons (neurons with a charge above threshold)
    const firing_neurons = zeros(params.n_servers, params.n_users);
    for (let i = 0; i < params.n_servers; i++) { // TODO: make more performant
        for (let j = 0; j < params.n_users; j++) {
            if (params.principal_neurons.get([i, j]) > params.vth_P) {
                firing_neurons.set([i, j], 1);
            }
        }
    }

    // Get firing users (users with at least one firing neuron)
    const firing_users = zeros(1, params.n_users);
    for (let i = 0; i < params.n_users; i++) { // TODO: make more performant
        for (let j = 0; j < params.n_servers; j++) {
            if (firing_neurons.get([j, i]) > 0) {
                firing_users.set([0, i], 1);
                break;
            }
        }
    }

    // Get firing servers (servers with at least one firing neuron)
    const firing_servers = zeros(params.n_servers, 1);
    for (let i = 0; i < params.n_servers; i++) { // TODO: make more performant
        for (let j = 0; j < params.n_users; j++) {
            if (firing_neurons.get([i, j]) > 0) {
                firing_servers.set([i, 0], 1);
                break;
            }
        }
    }

    // Update user server assignments.
    // Each user has n_server neurons. The first neuron in these columns which fires is the index of the server the user is assigned to.
    // TODO: fix, there is something wrong with capacity
    const new_user_server_assignments = params.user_server_assignments;
    const new_server_utilization = zeros(params.n_servers, 1); // This is a bit stupid (change?)
    for (let j = 0; j<params.n_users; j++){ // TODO: make more performant
        for (let i = 0; i<params.n_servers; i++){
            if (firing_neurons.get([i, j]) > 0){
                new_user_server_assignments.set([0, j], i);
                new_server_utilization.set([i, 0], 1);
                break;
            }
        }
    }

    // Calculate which servers are at capacity
    // 1. Get the number of users assigned to each server
    const user_count_per_server = zeros(params.n_servers, 1);
    for (let i = 0; i < params.n_servers; i++) { // TODO: make more performant
        for (let j = 0; j < params.n_users; j++) {
            if (new_user_server_assignments.get([0, j]) === i) {
                user_count_per_server.set([i, 0], user_count_per_server.get([i, 0]) + 1);
            }
        }
    }
    // 2. Calculate which servers are at or over capacity (only for servers where at least one user spiked)
    const servers_at_capacity = zeros(params.n_servers, 1); // Not fantastic name
    new_server_utilization.forEach((is_updated, index) => {
        if (is_updated) {
            const j = index[0];
            const n_allocated_users = user_count_per_server.get([j, 0]);
            if (n_allocated_users >= params.server_capacity) {
                servers_at_capacity.set([j, 0], 1);
            }
        }
    });

    // Reset the charge of firing neurons
    for (let i = 0; i < params.n_servers; i++) { // TODO: make more performant
        for (let j = 0; j < params.n_users; j++) {
            if (firing_neurons.get([i, j]) > 0) {
                params.principal_neurons.set([i, j], 0);
            }
        }
    }

    const toReturn: SimulationOutput = {
        wta_output: firing_users, 
        capacity_output: servers_at_capacity, 
        utilization_output: firing_servers, 
        user_server_assignments: new_user_server_assignments, 
        server_utilization: new_server_utilization,
        user_count_per_server: user_count_per_server,
        principal_neurons: params.principal_neurons,
        firing_neurons: firing_neurons,
        firing_users: firing_users,
        firing_servers: firing_servers,
        servers_at_capacity: servers_at_capacity
    }

    return toReturn
}

export function getFitness(params:EdgeUserAllocationParams, userCountPerServer:Matrix):number {
    
    const capacity = params.server_capacity; // TODO: change to be dynamic

    // If any server is over capacity, the fitness is 0
    if (max(userCountPerServer) > capacity) {
        return 0;
    }

    // - the number of users who are assigned to any server
    const n_users_assigned = sum(userCountPerServer);

    // - the number of servers which do not have any users assigned to them
    const n_deallocated_servers = countZeros(userCountPerServer); // TODO: make more performant

    let fitness:number = -n_users_assigned;
    if (n_users_assigned === params.n_users) {
        fitness -= n_deallocated_servers;
    }

    return fitness;
}

function countZeros(matrix:Matrix):number {
    let count = 0;
    matrix.forEach((value) => {
        if (value === 0) {
            count++;
        }
    });
    return count;
}