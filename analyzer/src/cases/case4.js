import { getOriginalEdges, enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 4: All possible DATA FLOW paths (Directed).
 * Finds all valid data flow sequences respecting directions up to 6 steps.
 * Replaces the Python case_4.py logic.
 */
export const Case4 = {
    id: 'case_4',
    name: 'Case 4: All possible DATA FLOW paths (Directed)',
    description: 'Finds all valid data flow sequences (respecting directions) up to 6 steps.',
    
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

        /**
         * Custom DFS to find all simple directed paths up to a specific cutoff.
         * Simulates nx.all_simple_paths on a directed graph.
         */
        const findAllDirectedPaths = (source, target, maxDepth) => {
            const paths = [];
            const visited = new Set();

            const dfs = (currentNode, currentPath) => {
                if (currentPath.length - 1 > maxDepth) return;
                if (currentNode === target) {
                    paths.push([...currentPath]);
                    return;
                }
                
                visited.add(currentNode);
                
                // Strictly follow outgoing edges (directed data flow)
                gActive.forEachOutNeighbor(currentNode, neighbor => {
                    // Prevent traversing back up the hierarchy tree unnecessarily
                    if (!visited.has(neighbor) && gActive.getDirectedEdgeAttribute(currentNode, neighbor, 'access') !== 'hierarchy_reverse') {
                        currentPath.push(neighbor);
                        dfs(neighbor, currentPath);
                        currentPath.pop();
                    }
                });
                
                visited.delete(currentNode);
            };
            
            dfs(source, [source]);
            return paths;
        };

        const cutoff = 6; // Max 6 steps as requested in original Python code
        const paths = findAllDirectedPaths(p1, p2, cutoff);

        if (paths.length === 0) {
            return { error: true, message: `No valid data flow paths found within ${cutoff} steps.` };
        }

        const nodesToDraw = new Set();
        let edgesToDraw = [];
        const addedEdges = new Set();

        paths.forEach(path => {
            path.forEach(node => nodesToDraw.add(node));
            
            const pathEdges = getOriginalEdges(gActive, path);
            pathEdges.forEach(edge => {
                const edgeKey = `${edge.u}___${edge.v}`;
                if (!addedEdges.has(edgeKey)) {
                    edgesToDraw.push(edge);
                    addedEdges.add(edgeKey);
                }
            });
        });

        if (ctx.settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            success: true,
            message: `Found ${paths.length} unique data flow path(s).`
        };
    }
};