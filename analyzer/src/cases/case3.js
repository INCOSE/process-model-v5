import { getOriginalEdges, enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 3: Closest STRUCTURAL connection (Undirected).
 * Finds any connection (e.g., sharing the same input document), ignoring direction.
 * Replaces the Python case_3.py logic.
 */
export const Case3 = {
    id: 'case_3',
    name: 'Case 3: Closest STRUCTURAL connection (Undirected)',
    description: 'Finds any connection between two processes, ignoring direction.',
    
    inputs: [
        { key: 'p1', type: 'select', label: 'Process A:', optionsSource: 'processes' },
        { key: 'p2', type: 'select', label: 'Process B:', optionsSource: 'processes' }
    ],

    execute(ctx, params) {
        const gActive = ctx.gActive;
        const p1 = params.p1;
        const p2 = params.p2;

        if (!p1 || !p2 || p1 === p2) {
            return { error: true, message: "Please select two different processes." };
        }

        /**
         * Custom BFS to find the shortest undirected path.
         * Simulates nx.shortest_path on an undirected graph.
         */
        const findShortestUndirectedPath = (source, target) => {
            const queue = [[source]];
            const visited = new Set([source]);

            while (queue.length > 0) {
                const path = queue.shift();
                const node = path[path.length - 1];
                let foundPath = null;

                // forEachNeighbor iterates over both incoming and outgoing edges, simulating undirected traversal
                gActive.forEachNeighbor(node, neighbor => {
                    if (foundPath) return; // Stop if already found
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        const newPath = [...path, neighbor];
                        if (neighbor === target) {
                            foundPath = newPath;
                        } else {
                            queue.push(newPath);
                        }
                    }
                });
                
                if (foundPath) return foundPath;
            }
            return null; // No path found
        };

        const path = findShortestUndirectedPath(p1, p2);

        if (!path) {
            return { error: true, message: "These processes are completely disconnected in the model." };
        }

        let edgesToDraw = getOriginalEdges(gActive, path);
        const nodesToDraw = new Set(path);

        if (ctx.settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            success: true,
            message: `Structural connection found! Length: ${path.length - 1} step(s).`
        };
    }
};