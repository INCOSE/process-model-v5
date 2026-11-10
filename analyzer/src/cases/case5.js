import { enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 5: Process Neighborhood & Internal Steps (Subgraphs).
 * Shows all connected objects up to X steps away. 
 * Renders internal steps inside the function block.
 * Replaces the Python case_5.py logic.
 */
export const Case5 = {
    id: 'case_5',
    name: 'Case 5: Process Neighborhood & Internal Steps (Subgraphs)',
    description: 'Shows all connected objects up to X steps away. Renders internal steps inside the function block.',
    
    inputs: [
        { key: 'p1', type: 'select', label: 'Select Process (Business Function):', optionsSource: 'processes' },
        { 
            key: 'distance', 
            type: 'radio', 
            label: 'Search depth (steps):', 
            options: [
                { value: 1, label: '1 step' }, 
                { value: 2, label: '2 steps' }
            ],
            default: 1
        }
    ],

    execute(ctx, params) {
        const { gActive, gFull, settings } = ctx;
        const p1 = params.p1;
        const distance = parseInt(params.distance || 1, 10);

        if (!p1) {
            return { error: true, message: "Please select a central process." };
        }

        const nodesToDraw = new Set([p1]);
        let edgesToDraw = [];
        const compEdges = [];

        // Fix 1: Forcibly collect all composition edges from gFull to ensure subgraphs are always built
        gFull.forEachOutEdge(p1, (edge, attr, source, target) => {
            const tType = gFull.getNodeAttribute(target, 'type') || '';
            const eType = attr.type || '';
            
            if (eType.includes('Composition') && tType.includes('BusinessProcess')) {
                compEdges.push({ u: source, v: target, data: attr });
                nodesToDraw.add(target);
            }
        });

        const visited = new Set(nodesToDraw);
        let currentFront = new Set(nodesToDraw);

        // BFS with specific stopping conditions
        for (let step = 0; step < distance; step++) {
            const nextFront = new Set();
            
            for (const node of currentFront) {
                // Iterate over all neighbors (undirected traversal)
                gActive.forEachNeighbor(node, neighbor => {
                    if (!visited.has(neighbor)) {
                        const nType = gActive.getNodeAttribute(neighbor, 'type') || '';
                        
                        // If it's an object/artifact, add to render and continue passing through it
                        if (!nType.includes('BusinessFunction') && !nType.includes('BusinessProcess')) {
                            nextFront.add(neighbor);
                            visited.add(neighbor);
                        } 
                        // Fix 2: Stop at ANY adjacent process (Function or Process)
                        else {
                            nodesToDraw.add(neighbor);
                            visited.add(neighbor);
                        }
                    }
                });
            }
            
            nextFront.forEach(n => nodesToDraw.add(n));
            currentFront = nextFront;
        }

        const existingEdges = new Set();

        // Collect existing edges between all discovered nodes
        nodesToDraw.forEach(u => {
            nodesToDraw.forEach(v => {
                if (gActive.hasDirectedEdge(u, v) && gActive.getDirectedEdgeAttribute(u, v, 'access') !== 'hierarchy_reverse') {
                    const attr = gActive.getDirectedEdgeAttributes(u, v);
                    // Игнорируем Composition чужих функций, чтобы в subgraph рендерился только p1
                    if (attr.type?.includes('Composition') && u !== p1) return;

                    const edgeKey = `${u}___${v}`;
                    if (!existingEdges.has(edgeKey)) {
                        edgesToDraw.push({ u, v, data: attr });
                        existingEdges.add(edgeKey);
                    }
                }
            });
        });

        // Fix 1 (continuation): Guarantee the presence of composition edges in the array for Mermaid
        compEdges.forEach(comp => {
            const edgeKey = `${comp.u}___${comp.v}`;
            if (!existingEdges.has(edgeKey)) {
                edgesToDraw.push(comp);
                existingEdges.add(edgeKey);
            }
        });

        if (settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            success: true,
            renderSubgraphs: true, // Tells the adapter to draw nested Mermaid clusters
            message: `Neighborhood built with radius ${distance}.`
        };
    }
};