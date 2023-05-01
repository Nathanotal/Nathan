import type { Matrix } from 'mathjs'

export type Problem = {
    users: User[],
    servers: Server[],
    constraintMatrix: Matrix
}

export type User = {
    id: number,
    x: number,
    y: number
}

export type Server = {
    id: number,
    x: number,
    y: number,
    capacity: number,
    allocated_users: User[],
    range: number,
    color: number[],
    coverageColor: number[]
}