import { enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 7: N2 Chart Simulation (Process Inputs & Outputs).
 * Replaces the Python case_7.py logic.
 */
export const Case7 = {
    id: 'case_7',
    name: 'Case 7: N2 Chart Simulation',
    description: 'Simulates an N2 Chart. Select a central process to dynamically load its inputs and outputs.',
    
    inputs: [
        { key: 'pCenter', type: 'select', label: 'Central Process:', optionsSource: 'processes' },
        { key: 'showAllProducers', type: 'checkbox', label: 'Show all producing processes for selected outputs', default: false },
        // These inputs will dynamically fetch options based on pCenter selection
        { key: 'selectedInputs', type: 'multiselect', label: 'Input Artifacts:', optionsSource: 'dynamic_inputs' },
        { key: 'selectedOutputs', type: 'multiselect', label: 'Output Artifacts:', optionsSource: 'dynamic_outputs' }
    ],

    execute(ctx, params) {
        const { gActive, gFull, settings } = ctx;
        const pCenter = params.pCenter;
        
        if (!pCenter) {
            return { error: true, message: "Please select a Central Process first." };
        }

        const selectedInputs = params.selectedInputs || [];
        const selectedOutputs = params.selectedOutputs || [];
        const showAllProducers = params.showAllProducers || false;

        const nodesToDraw = new Set([pCenter]);
        let edgesToDraw = [];
        const addedEdges = new Set();
        const customLabels = {};

        // Helper: Safely push unique edges while filtering out synthetic reverse hierarchy edges
        const pushUniqueEdge = (u, v, data) => {
            if (!data || data.access === 'hierarchy_reverse') return;
            const edgeKey = `${u}___${v}`;
            if (!addedEdges.has(edgeKey)) {
                edgesToDraw.push({ u, v, data });
                addedEdges.add(edgeKey);
            }
        };

        // Helper: Collect cluster of artifacts (Whole-Part, Specialisation)
        const getArtifactCluster = (startNode) => {
            if (!settings.useHierarchy) return new Set([startNode]);
            
            const visited = new Set([startNode]);
            const queue = [startNode];
            
            while (queue.length > 0) {
                const curr = queue.shift();
                
                // Outgoing hierarchy edges
                gFull.forEachOutEdge(curr, (edge, attr, source, target) => {
                    const type = attr.type || '';
                    if (!visited.has(target) && (['Composition', 'Aggregation', 'Specialization'].some(x => type.includes(x)) || attr.access === 'hierarchy_reverse')) {
                        const nType = gFull.getNodeAttribute(target, 'type') || '';
                        if (!nType.includes('BusinessProcess') && !nType.includes('BusinessFunction')) {
                            visited.add(target);
                            queue.push(target);
                        }
                    }
                });
                
                // Incoming hierarchy edges
                gFull.forEachInEdge(curr, (edge, attr, source, target) => {
                    const type = attr.type || '';
                    if (!visited.has(source) && (['Composition', 'Aggregation', 'Specialization'].some(x => type.includes(x)) || attr.access === 'hierarchy_reverse')) {
                        const nType = gFull.getNodeAttribute(source, 'type') || '';
                        if (!nType.includes('BusinessProcess') && !nType.includes('BusinessFunction')) {
                            visited.add(source);
                            queue.push(source);
                        }
                    }
                });
            }
            return visited;
        };

        // Independent checks preserve bidirectional (Read + Write) relationships on the same artifact
        const safeAddEdge = (u, v) => {
            if (gActive.hasDirectedEdge(u, v)) {
                pushUniqueEdge(u, v, gActive.getDirectedEdgeAttributes(u, v));
            }
            if (gActive.hasDirectedEdge(v, u)) {
                pushUniqueEdge(v, u, gActive.getDirectedEdgeAttributes(v, u));
            }
        };

        // --- Process Selected Inputs ---
        selectedInputs.forEach(inId => {
            const cluster = getArtifactCluster(inId);
            cluster.forEach(n => nodesToDraw.add(n));
            
            // Connect cluster internals
            cluster.forEach(u => {
                cluster.forEach(v => {
                    if (gActive.hasDirectedEdge(u, v)) {
                        pushUniqueEdge(u, v, gActive.getDirectedEdgeAttributes(u, v));
                    }
                });
            });
            
            safeAddEdge(inId, pCenter);
            
            // Producers of these inputs
            cluster.forEach(cItem => {
                gFull.forEachInEdge(cItem, (edge, attr, source) => {
                    const pType = gFull.getNodeAttribute(source, 'type') || '';
                    if ((pType.includes('BusinessFunction') || pType.includes('BusinessProcess')) && source !== pCenter) {
                        if (attr.access !== 'hierarchy_reverse') {
                            nodesToDraw.add(source);
                            pushUniqueEdge(source, cItem, attr);
                        }
                    }
                });
            });
        });

        // --- Process Selected Outputs ---
        selectedOutputs.forEach(outId => {
            const cluster = getArtifactCluster(outId);
            cluster.forEach(n => nodesToDraw.add(n));
            
            // Connect cluster internals
            cluster.forEach(u => {
                cluster.forEach(v => {
                    if (gActive.hasDirectedEdge(u, v)) {
                        pushUniqueEdge(u, v, gActive.getDirectedEdgeAttributes(u, v));
                    }
                });
            });
            
            safeAddEdge(pCenter, outId);
            
            // Shared output logic
            const directProducers = new Set();
            gFull.forEachInEdge(outId, (edge, attr, source) => {
                const pType = gFull.getNodeAttribute(source, 'type') || '';
                if ((pType.includes('BusinessFunction') || pType.includes('BusinessProcess')) && attr.access !== 'hierarchy_reverse') {
                    directProducers.add(source);
                }
            });
            
            if (directProducers.size > 1) {
                const name = gActive.getNodeAttribute(outId, 'name') || 'Unnamed';
                customLabels[outId] = `${name} [Shared Output]`;
            }
            
            if (showAllProducers) {
                cluster.forEach(cItem => {
                    gFull.forEachInEdge(cItem, (edge, attr, source) => {
                        const pType = gFull.getNodeAttribute(source, 'type') || '';
                        if ((pType.includes('BusinessFunction') || pType.includes('BusinessProcess')) && attr.access !== 'hierarchy_reverse' && source !== pCenter) {
                            nodesToDraw.add(source);
                            pushUniqueEdge(source, cItem, attr);
                        }
                    });
                });
            }

            // Consumers of these outputs
            cluster.forEach(cItem => {
                gFull.forEachOutEdge(cItem, (edge, attr, source, target) => {
                    const sType = gFull.getNodeAttribute(target, 'type') || '';
                    if ((sType.includes('BusinessFunction') || sType.includes('BusinessProcess')) && attr.access !== 'hierarchy_reverse' && target !== pCenter) {
                        nodesToDraw.add(target);
                        pushUniqueEdge(cItem, target, attr);
                    }
                });
            });
        });
                            
        if (settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            customLabels: customLabels, // Specifically passed for N2 Chart
            success: true,
            message: "N2 Chart simulation diagram compiled!"
        };
    }
};