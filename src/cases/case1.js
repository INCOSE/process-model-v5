import { enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 1: Interface exchange between selected processes.
 * Finds objects through which the selected processes exchange data.
 * Replaces the Python case_1.py logic.
 */
export const Case1 = {
    id: 'case_1',
    name: 'Case 1: Interface exchange between selected processes',
    description: 'Select 2 to 5 processes. The script will find objects they exchange data through.',
    
    // UI schema to dynamically generate inputs in Sidebar.vue
    inputs: [
        {
            key: 'selectedProcesses',
            type: 'multiselect',
            label: 'Select processes (2 to 5):',
            min: 2,
            max: 5,
            optionsSource: 'processes' // Tells the UI to map this from store.processes
        }
    ],

    /**
     * Executes the analysis logic.
     * @param {Object} ctx - Context containing { gActive, settings, ... }
     * @param {Object} params - User inputs mapped by the keys defined above
     * @returns {Object} { nodes: Set, edges: Array, status: String, message: String }
     */
    execute(ctx, params) {
        const gActive = ctx.gActive;
        const selectedIds = params.selectedProcesses || [];

        if (selectedIds.length < 2) {
            return { error: true, message: "Please select at least 2 processes." };
        }

        const nodesToDraw = new Set(selectedIds);
        let edgesToDraw = [];
        const addedEdges = new Set();

        // Helper to safely add valid directed edges, ignoring reverse hierarchy
        const safeAddEdge = (u, v) => {
            if (gActive.hasDirectedEdge(u, v) && gActive.getDirectedEdgeAttribute(u, v, 'access') !== 'hierarchy_reverse') {
                const edgeKey = `${u}___${v}`;
                if (!addedEdges.has(edgeKey)) {
                    edgesToDraw.push({ u, v, data: gActive.getDirectedEdgeAttributes(u, v) });
                    addedEdges.add(edgeKey);
                }
            }
        };

        // Cutoff logic: 4 if hierarchy is used, otherwise 2 (matches Python logic)
        const cutoff = ctx.settings.useHierarchy ? 4 : 2;

        /**
         * Custom DFS to find all simple paths up to a specific cutoff, ignoring direction.
         * Simulates nx.all_simple_paths on an undirected graph.
         */
        const findAllSimplePaths = (source, target, maxDepth) => {
            const paths = [];
            const visited = new Set();

            const dfs = (currentNode, currentPath) => {
                if (currentPath.length - 1 > maxDepth) return;
                if (currentNode === target) {
                    paths.push([...currentPath]);
                    return;
                }
                
                visited.add(currentNode);
                
                // forEachNeighbor iterates over both incoming and outgoing edges in Graphology
                gActive.forEachNeighbor(currentNode, (neighbor) => {
                    if (!visited.has(neighbor)) {
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

        // Iterate through all unique pairs of selected processes
        for (let i = 0; i < selectedIds.length; i++) {
            for (let j = i + 1; j < selectedIds.length; j++) {
                const p1 = selectedIds[i];
                const p2 = selectedIds[j];

                // Check for direct edges between processes
                safeAddEdge(p1, p2);
                safeAddEdge(p2, p1);

                // Find connecting paths
                const paths = findAllSimplePaths(p1, p2, cutoff);
                
                paths.forEach(path => {
                    if (path.length > 2) {
                        // Intermediate nodes must not be BusinessProcess or BusinessFunction
                        const isValid = path.slice(1, -1).every(node => {
                            const type = gActive.getNodeAttribute(node, 'type') || '';
                            return !type.includes('BusinessProcess') && !type.includes('BusinessFunction');
                        });

                        if (isValid) {
                            path.forEach(n => nodesToDraw.add(n));
                            // Add all valid edges in the path
                            for (let k = 0; k < path.length - 1; k++) {
                                const u = path[k];
                                const v = path[k + 1];
                                safeAddEdge(u, v);
                                safeAddEdge(v, u); // Try both directions as traversal was undirected
                            }
                        }
                    }
                });
            }
        }

        // Output validation
        if (nodesToDraw.size === selectedIds.length && edgesToDraw.length === 0) {
            return { 
                nodes: nodesToDraw, 
                edges: edgesToDraw, 
                warning: true, 
                message: "No links or shared exchange objects found between these processes." 
            };
        }

        // Post-process: Enforce border object relations if setting is active
        if (ctx.settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        return { 
            nodes: nodesToDraw, 
            edges: edgesToDraw, 
            success: true, 
            message: "Exchange interfaces found!" 
        };
    }
};