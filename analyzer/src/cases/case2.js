import { getOriginalEdges, enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

export const Case2 = {
    id: 'case_2',
    name: 'Case 2: Shortest DATA FLOW path (Directed)',
    description: 'Finds the shortest valid data sequence (respecting Input/Output directions).',
    
    inputs: [
        { key: 'p1', type: 'select', label: 'Process A (From):', optionsSource: 'processes' },
        { key: 'p2', type: 'select', label: 'Process B (To):', optionsSource: 'processes' }
    ],

    execute(ctx, params) {
        const gActive = ctx.gActive;
        const p1 = params.p1;
        const p2 = params.p2;

        if (!p1 || !p2 || p1 === p2) {
            return { error: true, message: "Please select two different processes." };
        }

        // Directed BFS follows the dataflow
        const findShortestDirectedDataFlow = (source, target) => {
            const queue = [[source]];
            const visited = new Set([source]);

            while (queue.length > 0) {
                const path = queue.shift();
                const currentNode = path[path.length - 1];
                let foundPath = null;

                gActive.forEachOutEdge(currentNode, (edge, attr, u, neighbor) => {
                    if (foundPath || visited.has(neighbor)) return;

                    // Process hierarchy ascent-decent prohibition
                    // allowing hierarchy following for objects (if useHierarchy is activated)
                    if (attr.access === 'hierarchy_reverse') {
                        const uType = gActive.getNodeAttribute(u, 'type') || '';
                        const vType = gActive.getNodeAttribute(neighbor, 'type') || '';
                        const isProcessHierarchy =
                            uType.includes('BusinessFunction') || uType.includes('BusinessProcess') ||
                            vType.includes('BusinessFunction') || vType.includes('BusinessProcess');
                        if (isProcessHierarchy) return;
                    }

                    visited.add(neighbor);
                    const newPath = [...path, neighbor];
                    if (neighbor === target) {
                        foundPath = newPath;
                    } else {
                        queue.push(newPath);
                    }
                });

                if (foundPath) return foundPath;
            }
            return null;
        };

        try {
            const path = findShortestDirectedDataFlow(p1, p2);
            
            if (!path) {
                return { error: true, message: "No valid DATA FLOW exists between these processes." };
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
                message: `Data flow path found! Length: ${path.length - 1} step(s).`
            };

        } catch (err) {
            console.error(err);
            return { error: true, message: "An internal error occurred while finding the path." };
        }
    }
};