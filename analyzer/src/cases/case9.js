import { enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 9: Tailoring Gap Check.
 * Evaluates a subset of processes performed by an organisation and detects:
 * - Orphaned Inputs (required by selected processes, but not produced inside the subset)
 * - Dead-end Outputs (produced by selected processes, but not consumed inside the subset)
 */
export const Case9 = {
    id: 'case_9',
    name: 'Case 9: Tailoring Gap Check (Orphaned Inputs / Dead-ends)',
    description: 'Select the processes your organisation actually performs to uncover missing upstream inputs and unused outputs.',

    inputs: [
        {
            key: 'selectedProcesses',
            type: 'multiselect',
            label: 'Processes performed in your organisation:',
            optionsSource: 'processes'
        },
        {
            key: 'showOrphanedInputs',
            type: 'checkbox',
            label: 'Show Orphaned Inputs (missing producers)',
            default: true
        },
        {
            key: 'showDeadEndOutputs',
            type: 'checkbox',
            label: 'Show Dead-end Outputs (unused outputs)',
            default: true
        }
    ],

    execute(ctx, params) {
        const { gActive, gFull, settings } = ctx;
        const selectedIds = params.selectedProcesses || [];
        const showOrphaned = params.showOrphanedInputs !== false;
        const showDeadEnd = params.showDeadEndOutputs !== false;

        if (selectedIds.length === 0) {
            return { error: true, message: "Please select at least 1 process to audit." };
        }

        const selectedSet = new Set(selectedIds);
        const isProcess = (id) => {
            const t = gActive.getNodeAttribute(id, 'type') || '';
            return t.includes('BusinessFunction') || t.includes('BusinessProcess');
        };

        const nodesToDraw = new Set(selectedIds);
        const highlightedNodes = new Set(selectedIds);
        let edgesToDraw = [];
        const addedEdges = new Set();
        const customLabels = {};

        const pushEdge = (u, v, attr) => {
            const key = `${u}___${v}`;
            if (!addedEdges.has(key)) {
                edgesToDraw.push({ u, v, data: attr });
                addedEdges.add(key);
            }
        };

        // Track artefacts connected to the selected processes
        // artefactId -> { producersIn: Set, consumersIn: Set, edges: Array }
        const artefactMap = new Map();
        const ensureObj = (objId) => {
            if (!artefactMap.has(objId)) {
                artefactMap.set(objId, { producersIn: new Set(), consumersIn: new Set(), edges: [] });
            }
            return artefactMap.get(objId);
        };

        selectedIds.forEach((procId) => {
            if (!gActive.hasNode(procId)) return;

            // Inputs to selected process (obj -> proc)
            gActive.forEachInEdge(procId, (edge, attr, source) => {
                if (attr.access === 'hierarchy_reverse' || attr.type?.includes('Composition')) return;
                if (isProcess(source)) return;
                const entry = ensureObj(source);
                entry.consumersIn.add(procId);
                entry.edges.push({ u: source, v: procId, data: attr });
            });

            // Outputs from selected process (proc -> obj)
            gActive.forEachOutEdge(procId, (edge, attr, source, target) => {
                if (attr.access === 'hierarchy_reverse' || attr.type?.includes('Composition')) return;
                if (isProcess(target)) return;
                const entry = ensureObj(target);
                entry.producersIn.add(procId);
                entry.edges.push({ u: procId, v: target, data: attr });
            });
        });

        const internalInterfaces = [];
        const orphanedInputs = [];
        const deadEndOutputs = [];

        const getStandardProducers = (objId) => {
            const list = [];
            if (!gFull.hasNode(objId)) return list;
            gFull.forEachInEdge(objId, (edge, attr, src) => {
                if (attr.access === 'hierarchy_reverse') return;
                const t = gFull.getNodeAttribute(src, 'type') || '';
                if (t.includes('BusinessFunction')) {
                    list.push(gFull.getNodeAttribute(src, 'name') || src);
                }
            });
            return Array.from(new Set(list)).sort();
        };

        const getStandardConsumers = (objId) => {
            const list = [];
            if (!gFull.hasNode(objId)) return list;
            gFull.forEachOutEdge(objId, (edge, attr, src, tgt) => {
                if (attr.access === 'hierarchy_reverse') return;
                const t = gFull.getNodeAttribute(tgt, 'type') || '';
                if (t.includes('BusinessFunction')) {
                    list.push(gFull.getNodeAttribute(tgt, 'name') || tgt);
                }
            });
            return Array.from(new Set(list)).sort();
        };

        artefactMap.forEach((info, objId) => {
            const name = gActive.getNodeAttribute(objId, 'name') || 'Unknown';
            const hasProd = info.producersIn.size > 0;
            const hasCons = info.consumersIn.size > 0;

            if (hasProd && hasCons) {
                internalInterfaces.push({ label: name });
                nodesToDraw.add(objId);
                info.edges.forEach((e) => pushEdge(e.u, e.v, e.data));
            } else if (!hasProd && hasCons) {
                const missingProducers = getStandardProducers(objId);
                orphanedInputs.push({
                    label: name,
                    detail: missingProducers.length > 0
                        ? `Normally produced by: ${missingProducers.join(', ')}`
                        : 'External input (outside ISO 15288 processes)'
                });
                if (showOrphaned) {
                    nodesToDraw.add(objId);
                    customLabels[objId] = `${name} [Orphaned Input]`;
                    info.edges.forEach((e) => pushEdge(e.u, e.v, e.data));
                }
            } else if (hasProd && !hasCons) {
                const missingConsumers = getStandardConsumers(objId);
                deadEndOutputs.push({
                    label: name,
                    detail: missingConsumers.length > 0
                        ? `Normally consumed by: ${missingConsumers.join(', ')}`
                        : 'External output'
                });
                if (showDeadEnd) {
                    nodesToDraw.add(objId);
                    customLabels[objId] = `${name} [Dead-end Output]`;
                    info.edges.forEach((e) => pushEdge(e.u, e.v, e.data));
                }
            }
        });

        if (settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        orphanedInputs.sort((a, b) => a.label.localeCompare(b.label));
        deadEndOutputs.sort((a, b) => a.label.localeCompare(b.label));
        internalInterfaces.sort((a, b) => a.label.localeCompare(b.label));

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            highlightedNodes,
            customLabels,
            analysisSummary: {
                title: 'Tailoring Gap Audit',
                subtitle: `${selectedIds.length} selected process(es)`,
                metrics: [
                    { label: 'Internal', value: internalInterfaces.length },
                    { label: 'Orphaned Inputs', value: orphanedInputs.length },
                    { label: 'Dead-end Outputs', value: deadEndOutputs.length }
                ],
                sections: [
                    { title: `Orphaned Inputs (${orphanedInputs.length})`, tone: 'danger', items: orphanedInputs },
                    { title: `Dead-end Outputs (${deadEndOutputs.length})`, tone: 'warning', items: deadEndOutputs },
                    { title: `Covered Internal Interfaces (${internalInterfaces.length})`, tone: 'ok', items: internalInterfaces }
                ]
            },
            success: true,
            message: `Audit complete: ${internalInterfaces.length} covered, ${orphanedInputs.length} orphaned input(s), ${deadEndOutputs.length} dead-end output(s).`
        };
    }
};
