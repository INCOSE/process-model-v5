import { getOriginalEdges, enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 6: Shortest connection between Business Objects (Undirected).
 * Finds any connection between two Business Objects, ignoring direction.
 * Replaces the Python case_6.py logic.
 */
export const Case6 = {
    id: 'case_6',
    name: 'Case 6: Shortest connection between Business Objects',
    description: 'Finds any connection between two Business Objects, ignoring direction.',
    
    inputs: [
        { key: 'o1', type: 'select', label: 'Object A:', optionsSource: 'businessObjects' },
        { key: 'o2', type: 'select', label: 'Object B:', optionsSource: 'businessObjects' }
    ],

    execute(ctx, params) {
        const gActive = ctx.gActive;
        const o1 = params.o1;
        const o2 = params.o2;

        if (!o1 || !o2 || o1 === o2) {
            return { error: true, message: "Please select two different Business Objects." };
        }

        // Custom BFS to find the shortest undirected path
        const findShortestUndirectedPath = (source, target) => {
            const queue = [[source]];
            const visited = new Set([source]);

            while (queue.length > 0) {
                const path = queue.shift();
                const node = path[path.length - 1];
                let foundPath = null;

                gActive.forEachNeighbor(node, neighbor => {
                    if (foundPath) return; 
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
            return null;
        };

        const path = findShortestUndirectedPath(o1, o2);

        if (!path) {
            return { error: true, message: "These objects are completely disconnected in the model." };
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
            message: `Connection found! Length: ${path.length - 1} step(s).`
        };
    }
};