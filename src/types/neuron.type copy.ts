import type { Neuron } from "./neuron.type";

export type Layer = {
    id: number;
    neurons: Neuron[];
};