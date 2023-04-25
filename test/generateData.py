import numpy as np
import json


def main():
    n_timesteps = 10
    n_servers = 10
    n_users = 50

    tensor = np.zeros((n_timesteps, n_servers, n_users))

    # Fill each timestep with a random matrix of 1s and 0s
    for i in range(n_timesteps):
        tensor[i] = generateMatrix(n_servers, n_users)

    collapsedTesnsor = collapseTensor(tensor)

    # Save to json
    with open('./test/testMatrix.json', 'w') as f:
        json.dump(collapsedTesnsor.tolist(), f)

    with open('./test/testTensor.json', 'w') as f:
        json.dump(tensor.tolist(), f)


def generateMatrix(n_servers, n_users):
    # Each user should be assigned exactly one server
    # at each timestep
    matrix = np.zeros((n_servers, n_users))

    for i in range(n_users):
        matrix[np.random.randint(0, n_servers)][i] = 1

    return matrix


def collapseMatrix(matrix):
    # Collapse the matrix into a 1D array
    # where each element is the server
    # assigned to the corresponding user
    return np.argmax(matrix, axis=0)


def collapseTensor(tensor):
    # Collapse the tensor into a 2D array
    # where each row is the server assignments
    # for each timestep
    collapsed = np.zeros((tensor.shape[0], tensor.shape[2]))

    for i in range(tensor.shape[0]):
        collapsed[i] = collapseMatrix(tensor[i])

    return collapsed


if __name__ == '__main__':
    main()
