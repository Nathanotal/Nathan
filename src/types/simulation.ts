import type { Matrix } from 'mathjs' // TODO: fix

export type SimulationInput = {
    principal_neurons:Matrix,
    wta_output:Matrix,
    capacity_output:Matrix,
    utilization_output:Matrix,
    wta_inhibition:number,
    capacity_inhibition:number,
    utilization_excitation:number,
    vth_P:number,
    n_users:number,
    n_servers:number,
    noise_probability:number,
    noise_strength:number,
    server_capacity:number,
};

export type SimulationOutput = {
    wta_output: Matrix[],
    capacity_output: Matrix[],
    utilization_output: Matrix[],
    user_server_assignments: Matrix[],
    server_utilization: Matrix[],
    principal_neurons: Matrix[],
    firing_neurons: Matrix[],
    firing_users: Matrix[],
    firing_servers: Matrix[],
    servers_at_capacity: Matrix[],
};

export type EdgeUserAllocationParams = {
    animation_interval:number, // 100
    n_users:number, // 4
    n_servers:number, // 3
    server_capacity:number, // 2
    vth_P:number, // 2
    noise_probability:number, // 0.3
    noise_strength:number, // 1
    wta_inhibition:number, // -2
    capacity_inhibition:number, // -4
    utilization_excitation:number // 1
}