/**
 * Utility functions to generate Mermaid.js syntax from Graphology graphs.
 * Replaces the Python mermaid_generator.py logic.
 * Note: Comments are written in British English.
 */

export function graphToMermaidAndData(
    gActive,
    nodesToInclude,
    edgesToInclude,
    renderSubgraphs = false,
    customLabels = {},
    highlightedNodes = new Set()
) {
    if (!nodesToInclude || nodesToInclude.size === 0) {
        return { mermaidCode: "", nodesData: {} };
    }

    const lines = [
        "flowchart LR",
        "classDef process fill:#FFF2CC,stroke:#D6B656,stroke-width:2px,color:#000;",
        "classDef centralProcess fill:#FFE6CC,stroke:#D79B00,stroke-width:4px,color:#000,font-weight:bold;",
        "classDef object fill:#D5E8D4,stroke:#82B366,stroke-width:2px,color:#000;"
    ];

    const nodesData = {};
    const parentMap = {};
    const filteredEdges = [];

    // Separate composition edges for subgraphs if required
    if (renderSubgraphs) {
        edgesToInclude.forEach(edge => {
            const { u, v, data } = edge;
            const uType = gActive.getNodeAttribute(u, 'type') || '';
            const vType = gActive.getNodeAttribute(v, 'type') || '';
            
            if (data.type?.includes('Composition') && uType.includes('BusinessFunction') && vType.includes('BusinessProcess')) {
                parentMap[v] = u;
            } else {
                filteredEdges.push(edge);
            }
        });
    } else {
        filteredEdges.push(...edgesToInclude);
    }

    const childrenByParent = {};
    const standaloneNodes = [];

    // Categorise nodes into subgraphs or standalone elements
    Array.from(nodesToInclude).forEach(n => {
        if (renderSubgraphs && parentMap[n]) {
            const p = parentMap[n];
            if (!childrenByParent[p]) childrenByParent[p] = [];
            childrenByParent[p].push(n);
        } else {
            standaloneNodes.push(n);
        }
    });

    // Remove parents from standalone if they are already acting as cluster wrappers
    Object.keys(childrenByParent).forEach(p => {
        const index = standaloneNodes.indexOf(p);
        if (index > -1) standaloneNodes.splice(index, 1);
    });

    let linkIndex = 0;
    const greyLinkIndices = [];

    // --- Subgraph Generation ---
    Object.entries(childrenByParent).forEach(([pId, children]) => {
        if (nodesToInclude.has(pId)) {
            const pNameRaw = customLabels[pId] || gActive.getNodeAttribute(pId, 'name') || 'Unknown';
            const pName = pNameRaw.replace(/["']/g, "'");
            const mPid = pId.replace(/-/g, "_");
            const pDoc = (gActive.getNodeAttribute(pId, 'doc') || '').replace(/["']/g, "'").replace(/\n/g, " ");
            const isHighlighted = highlightedNodes && highlightedNodes.has(pId);

            lines.push(`    subgraph ${mPid} ["${pName}"]`);
            lines.push(`        direction TB`);
            if (isHighlighted) {
                lines.push(`        style ${mPid} fill:#FFE6CC,stroke:#D79B00,stroke-width:4px,color:#000,font-weight:bold;`);
            } else {
                lines.push(`        style ${mPid} fill:#FFF2CC,stroke:#D6B656,stroke-width:2px,color:#000;`);
            }

            let prevCid = null;
            children.forEach(cId => {
                const cNameRaw = customLabels[cId] || gActive.getNodeAttribute(cId, 'name') || 'Unknown';
                const cName = cNameRaw.replace(/["']/g, "'");
                const mCid = cId.replace(/-/g, "_");
                const cDoc = (gActive.getNodeAttribute(cId, 'doc') || '').replace(/["']/g, "'").replace(/\n/g, " ");

                lines.push(`        ${mCid}("${cName}"):::process`);
                lines.push(`        click ${mCid} call handleNodeClick()`);
                nodesData[mCid] = { name: cName, doc: cDoc };

                if (prevCid) {
                    lines.push(`        ${prevCid} ~~~ ${mCid}`);
                    linkIndex++;
                }
                prevCid = mCid;
            });

            lines.push(`    end`);
            lines.push(`    click ${mPid} call handleNodeClick()`);
            nodesData[mPid] = { name: pName, doc: pDoc };
        } else {
            standaloneNodes.push(...children);
        }
    });

    // --- Standalone Nodes Generation ---
    standaloneNodes.forEach(nId => {
        const nameRaw = customLabels[nId] || gActive.getNodeAttribute(nId, 'name') || 'Unknown';
        const name = nameRaw.replace(/["']/g, "'");
        const mId = nId.replace(/-/g, "_");
        const nType = gActive.getNodeAttribute(nId, 'type') || '';
        const doc = (gActive.getNodeAttribute(nId, 'doc') || '').replace(/["']/g, "'").replace(/\n/g, " ");
        const isHighlighted = highlightedNodes && highlightedNodes.has(nId);

        if (nType.includes('BusinessProcess') || nType.includes('BusinessFunction')) {
            const pClass = isHighlighted ? 'centralProcess' : 'process';
            const displayLabel = isHighlighted ? `★ ${name}` : name;
            lines.push(`    ${mId}("${displayLabel}"):::${pClass}`);
        } else {
            lines.push(`    ${mId}["${name}"]:::object`);
        }
        lines.push(`    click ${mId} call handleNodeClick()`);
        nodesData[mId] = { name, doc };
    });

    // --- Link Sorting Logic ---
    const getSortWeight = (data) => {
        const eType = data.type || "";
        const access = (data.access || "").toLowerCase();
        const relName = data.name || "";
        const subclass = data.subclass || "";

        if (eType.includes('Access')) {
            if (subclass === 'Controls' || relName === 'Controls') return 0;
            if (access === 'read') return 1; // Input
            if (subclass === 'Situational' || relName === 'Situational') return 2;
            if (subclass === 'Enables' || relName === 'Enables') return 3;
            if (access === 'write') return 4; // Output
            return 5; // Other Access types
        }
        return 6; // All other relation types
    };

    filteredEdges.sort((a, b) => getSortWeight(a.data) - getSortWeight(b.data));

    const addedEdges = new Set();
    
    // --- Link Generation ---
    filteredEdges.forEach(({ u, v, data }) => {
        const edgeKey = `${u}___${v}`;
        if (!addedEdges.has(edgeKey)) {
            const uId = u.replace(/-/g, "_");
            const vId = v.replace(/-/g, "_");
            const eType = data.type || "";
            const access = (data.access || "").toLowerCase();
            const relName = data.name || "";
            const subclass = data.subclass || "";

            let label = "";
            if (eType.includes('Access')) {
                if (subclass === 'Controls' || relName === 'Controls') label = "Controls";
                else if (subclass === 'Enables' || relName === 'Enables') label = "Enables";
                else if (subclass === 'Situational' || relName === 'Situational') {
                    // Assign specific labels depending on access direction (Read / Write)
                    label = access === 'read' ? "Situational Input" : "Situational Output";
                }
                else if (access === 'read') label = "Input";
                else if (access === 'write') label = "Output";
                else label = "Access";
            } else {
                label = eType.replace("Relationship", "").replace("archimate:", "");
            }

            if (eType.includes('Composition')) {
                // uId is Whole (parent), vId is Part (child). Filled diamond (◆) at parent end.
                lines.push(`    ${vId} ===|"${label} ◆"| ${uId}`);
            } else if (eType.includes('Aggregation')) {
                // uId is Whole (parent), vId is Part (child). Hollow diamond (◇) at parent end.
                lines.push(`    ${vId} ---|"${label} ◇"| ${uId}`);
            } else if (eType.includes('Specialization')) {
                lines.push(`    ${uId} -. "${label}" .-> ${vId}`);
            } else if (["Controls", "Situational Input", "Situational Output", "Enables"].includes(label)) {
                // Systemic relationships are rendered as dashed lines
                lines.push(`    ${uId} -.->|${label}| ${vId}`);
            } else {
                lines.push(`    ${uId} -->|${label}| ${vId}`);
            }

            if (["Controls", "Enables", "Situational Input", "Situational Output"].includes(label)) {
                greyLinkIndices.push(linkIndex.toString());
            }

            linkIndex++;
            addedEdges.add(edgeKey);
        }
    });

    if (greyLinkIndices.length > 0) {
        lines.push(`    linkStyle ${greyLinkIndices.join(',')} stroke:#808080,stroke-width:2px,color:#808080`);
    }

    return { mermaidCode: lines.join("\n"), nodesData };
}

/**
 * Extracts original edges for a given path sequence of nodes.
 */
export function getOriginalEdges(gGraph, path) {
    const edges = [];
    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i + 1];
        
        if (gGraph.hasDirectedEdge(u, v) && gGraph.getDirectedEdgeAttribute(u, v, 'access') !== 'hierarchy_reverse') {
            edges.push({ u, v, data: gGraph.getDirectedEdgeAttributes(u, v) });
        } else if (gGraph.hasDirectedEdge(v, u) && gGraph.getDirectedEdgeAttribute(v, u, 'access') !== 'hierarchy_reverse') {
            edges.push({ u: v, v: u, data: gGraph.getDirectedEdgeAttributes(v, u) });
        }
    }
    return edges;
}

/**
 * Connects boundary artifacts/objects visually on the diagram if they have underlying connections.
 */
export function enforceBorderObjectRelations(gGraph, nodesSet, edgesList) {
    const objectsInGraph = Array.from(nodesSet).filter(n => {
        const type = gGraph.getNodeAttribute(n, 'type') || '';
        return !type.includes('BusinessProcess') && !type.includes('BusinessFunction');
    });
    
    const existingEdges = new Set(edgesList.map(e => `${e.u}___${e.v}`));

    for (let i = 0; i < objectsInGraph.length; i++) {
        for (let j = i + 1; j < objectsInGraph.length; j++) {
            const o1 = objectsInGraph[i];
            const o2 = objectsInGraph[j];

            if (gGraph.hasDirectedEdge(o1, o2) && gGraph.getDirectedEdgeAttribute(o1, o2, 'access') !== 'hierarchy_reverse') {
                if (!existingEdges.has(`${o1}___${o2}`)) {
                    edgesList.push({ u: o1, v: o2, data: gGraph.getDirectedEdgeAttributes(o1, o2) });
                    existingEdges.add(`${o1}___${o2}`);
                }
            }

            if (gGraph.hasDirectedEdge(o2, o1) && gGraph.getDirectedEdgeAttribute(o2, o1, 'access') !== 'hierarchy_reverse') {
                if (!existingEdges.has(`${o2}___${o1}`)) {
                    edgesList.push({ u: o2, v: o1, data: gGraph.getDirectedEdgeAttributes(o2, o1) });
                    existingEdges.add(`${o2}___${o1}`);
                }
            }
        }
    }
    
    return edgesList;
}