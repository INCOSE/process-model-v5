import { enforceBorderObjectRelations } from '../renderers/mermaidGenerator.js';

/**
 * Case 8: Downstream Impact Analysis (Blast Radius).
 * Traces how omitting or altering a process or artefact propagates downstream
 * across 1 to 3 process waves.
 */
export const Case8 = {
    id: 'case_8',
    name: 'Case 8: Downstream Impact (Blast Radius)',
    description: 'Select a process or artefact to see which downstream processes and artefacts are affected if it is omitted or changed.',

    inputs: [
        { key: 'origin', type: 'select', label: 'Origin Process or Artefact:', optionsSource: 'allNodes' },
        {
            key: 'waves',
            type: 'radio',
            label: 'Impact depth (process waves):',
            options: [
                { value: 1, label: '1 wave (Direct)' },
                { value: 2, label: '2 waves' },
                { value: 3, label: '3 waves' }
            ],
            default: 1
        }
    ],

    execute(ctx, params) {
        const gActive = ctx.gActive;
        const origin = params.origin;
        const waves = parseInt(params.waves || 1, 10);

        if (!origin || !gActive.hasNode(origin)) {
            return { error: true, message: "Please select an origin Process or Artefact." };
        }

        const isProcess = (id) => {
            const t = gActive.getNodeAttribute(id, 'type') || '';
            return t.includes('BusinessFunction') || t.includes('BusinessProcess');
        };

        const originIsProcess = isProcess(origin);
        // 1 process wave from a process = Process -> Artefact -> Process (2 hops).
        // 1 process wave from an artefact = Artefact -> Process (1 hop).
        const maxHops = originIsProcess ? waves * 2 : waves * 2 - 1;

        const nodesToDraw = new Set([origin]);
        const highlightedNodes = new Set([origin]);
        let edgesToDraw = [];
        const addedEdges = new Set();

        const visitedDepth = new Map([[origin, 0]]);
        const queue = [{ id: origin, depth: 0 }];
        const affectedProcessesByWave = {};

        const pushEdge = (u, v, attr) => {
            const key = `${u}___${v}`;
            if (!addedEdges.has(key)) {
                edgesToDraw.push({ u, v, data: attr });
                addedEdges.add(key);
            }
        };

        while (queue.length > 0) {
            const { id: curr, depth } = queue.shift();
            if (depth >= maxHops) continue;

            gActive.forEachOutEdge(curr, (edge, attr, u, target) => {
                if (attr.access === 'hierarchy_reverse') return;
                if (attr.type?.includes('Composition')) return;

                const targetIsProc = isProcess(target);
                const nextDepth = depth + 1;

                // Stop at processes once we reach maxHops; do not expand past boundary objects
                if (nextDepth > maxHops) return;
                if (nextDepth === maxHops && !targetIsProc) return;

                nodesToDraw.add(target);
                pushEdge(u, target, attr);

                if (targetIsProc && target !== origin) {
                    const waveNum = originIsProcess ? Math.ceil(nextDepth / 2) : Math.ceil((nextDepth + 1) / 2);
                    if (!affectedProcessesByWave[waveNum]) affectedProcessesByWave[waveNum] = new Set();
                    affectedProcessesByWave[waveNum].add(gActive.getNodeAttribute(target, 'name') || target);
                }

                if (!visitedDepth.has(target) || visitedDepth.get(target) > nextDepth) {
                    visitedDepth.set(target, nextDepth);
                    queue.push({ id: target, depth: nextDepth });
                }
            });
        }

        if (ctx.settings.connectBorderObjects) {
            edgesToDraw = enforceBorderObjectRelations(gActive, nodesToDraw, edgesToDraw);
        }

        const totalAffectedProcs = Object.values(affectedProcessesByWave).reduce((acc, s) => acc + s.size, 0);
        const totalAffectedObjs = Array.from(nodesToDraw).filter((id) => id !== origin && !isProcess(id)).length;

        const sections = Object.keys(affectedProcessesByWave)
            .sort((a, b) => Number(a) - Number(b))
            .map((w) => ({
                title: `Wave ${w} Affected Processes (${affectedProcessesByWave[w].size})`,
                tone: Number(w) === 1 ? 'danger' : 'warning',
                items: Array.from(affectedProcessesByWave[w]).sort().map((name) => ({ label: name }))
            }));

        return {
            nodes: nodesToDraw,
            edges: edgesToDraw,
            highlightedNodes,
            analysisSummary: {
                title: 'Blast Radius Summary',
                subtitle: `Origin: ${gActive.getNodeAttribute(origin, 'name') || origin}`,
                metrics: [
                    { label: 'Affected Processes', value: totalAffectedProcs },
                    { label: 'Impacted Artefacts', value: totalAffectedObjs }
                ],
                sections
            },
            success: true,
            message: `Impact traced: ${totalAffectedProcs} downstream process(es) and ${totalAffectedObjs} artefact(s) affected.`
        };
    }
};
