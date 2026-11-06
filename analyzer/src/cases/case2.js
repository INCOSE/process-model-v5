import { bidirectional } from 'graphology-shortest-path/unweighted';
import { getOriginalEdges, enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 2: Shortest DATA FLOW path (Directed).
 * Finds the shortest valid data sequence (respecting Input/Output directions).
 * Replaces the Python case_2.py logic.
 */
export const Case2 = {
    id: 'case_2',
    name: 'Case 2: Shortest DATA FLOW path (Directed)',
    description: 'Finds the shortest valid data sequence (respecting Input/Output directions).',
    
    // UI schema for Sidebar (two single-select dropdowns)
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

        try {
            // Find the shortest directed path
            const path = bidirectional(gActive, p1, p2);
            
            if (!path) {
                return { error: true, message: "No valid DATA FLOW exists between these processes." };
            }

            // Path is an array of node keys. Extract original edges connecting them.
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