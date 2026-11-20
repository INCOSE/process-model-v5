/**
 * Utility functions to generate Mermaid.js syntax from Graphology graphs.
 * Replaces the Python mermaid_generator.py logic.
 * Note: Comments are written in British English.
 */

function wrapLabel(text, maxLineLength = 24) {
    if (!text || text.length <= maxLineLength) return text;
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        if (!currentLine) {
            currentLine = word;
        } else if ((currentLine + ' ' + word).length <= maxLineLength) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('<br/>');
}

export function graphToMermaidAndData(
    gActive,
    nodesToInclude,
    edgesToInclude,
    renderSubgraphs = false,
    customLabels = {},
    highlightedNodes = new Set(),
    stepState = null,
    searchMatches = null
) {
    if (!nodesToInclude || nodesToInclude.size === 0) {
        return { mermaidCode: "", nodesData: {} };
    }

    const lines = [
        "flowchart LR",
        "classDef process fill:#FFF2CC,stroke:#D6B656,stroke-width:2px,color:#000;",
        "classDef centralProcess fill:#FFE6CC,stroke:#D79B00,stroke-width:4px,color:#000,font-weight:bold;",
        "classDef object fill:#D5E8D4,stroke:#82B366,stroke-width:2px,color:#000;",
        "classDef stepActive fill:#E3F2FD,stroke:#1565C0,stroke-width:4px,color:#0D47A1,font-weight:bold;",
        "classDef stepDimmed fill:#F5F5F5,stroke:#DCDCDC,stroke-width:1px,color:#A0A0A0;",
        "classDef searchMatch fill:#FFF3CD,stroke:#E65100,stroke-width:4px,color:#BF360C,font-weight:bold;",
        "classDef searchDimmed fill:#F7F7F7,stroke:#E0E0E0,stroke-width:1px,color:#B0B0B0;"
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

    const hasSearch = searchMatches !== null;

    const resolveNodeClass = (nodeId, defaultClass) => {
        if (hasSearch) {
            return searchMatches.has(nodeId) ? 'searchMatch' : 'searchDimmed';
        }
        if (stepState) {
            if (stepState.activeNodes.has(nodeId)) return 'stepActive';
            if (stepState.visitedNodes.has(nodeId)) return defaultClass;
            return 'stepDimmed';
        }
        return defaultClass;
    };

    let linkIndex = 0;
    const greyLinkIndices = [];
    const activeLinkIndices = [];
    const dimmedLinkIndices = [];

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
            if (hasSearch && searchMatches.has(pId)) {
                lines.push(`        style ${mPid} fill:#FFF3CD,stroke:#E65100,stroke-width:4px,color:#BF360C,font-weight:bold;`);
            } else if (hasSearch) {
                lines.push(`        style ${mPid} fill:#F7F7F7,stroke:#E0E0E0,stroke-width:1px,color:#B0B0B0;`);
            } else if (stepState && stepState.activeNodes.has(pId)) {
                lines.push(`        style ${mPid} fill:#E3F2FD,stroke:#1565C0,stroke-width:4px,color:#0D47A1,font-weight:bold;`);
            } else if (stepState && !stepState.visitedNodes.has(pId)) {
                lines.push(`        style ${mPid} fill:#F5F5F5,stroke:#DCDCDC,stroke-width:1px,color:#A0A0A0;`);
            } else if (isHighlighted) {
                lines.push(`        style ${mPid} fill:#FFE6CC,stroke:#D79B00,stroke-width:4px,color:#000,font-weight:bold;`);
            } else {
                lines.push(`        style ${mPid} fill:#FFF2CC,stroke:#D6B656,stroke-width:2px,color:#000;`);
            }

            let prevCid = null;
            children.forEach(cId => {
                const cNameRaw = customLabels[cId] || gActive.getNodeAttribute(cId, 'name') || 'Unknown';
                const cName = cNameRaw.replace(/["']/g, "'");
                const cLabel = wrapLabel(cName);
                const mCid = cId.replace(/-/g, "_");
                const cDoc = (gActive.getNodeAttribute(cId, 'doc') || '').replace(/["']/g, "'").replace(/\n/g, " ");
                const cClass = resolveNodeClass(cId, 'process');

                lines.push(`        ${mCid}("${cLabel}"):::${cClass}`);
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
            const baseClass = isHighlighted ? 'centralProcess' : 'process';
            const pClass = resolveNodeClass(nId, baseClass);
            const displayLabel = wrapLabel(isHighlighted ? `★ ${name}` : name);
            lines.push(`    ${mId}("${displayLabel}"):::${pClass}`);
        } else {
            const wrappedName = wrapLabel(name);
            const oClass = resolveNodeClass(nId, 'object');
            lines.push(`    ${mId}["${wrappedName}"]:::${oClass}`);
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
                    label = access === 'read' ? "Situational Input" : "Situational Output";
                }
                else if (access === 'read') label = "Input";
                else if (access === 'write') label = "Output";
                else label = "Access";
            } else {
                label = eType.replace("Relationship", "").replace("archimate:", "");
            }

            if (eType.includes('Composition')) {
                lines.push(`    ${vId} == "${label}" ==> ${uId}`);
            } else if (eType.includes('Aggregation')) {
                lines.push(`    ${vId} -- "${label}" --o ${uId}`);
            } else if (eType.includes('Specialization')) {
                lines.push(`    ${uId} -. "${label}" .-> ${vId}`);
            } else if (["Controls", "Situational Input", "Situational Output", "Enables"].includes(label)) {
                lines.push(`    ${uId} -.->|${label}| ${vId}`);
            } else {
                lines.push(`    ${uId} -->|${label}| ${vId}`);
            }

            if (hasSearch) {
                if (!searchMatches.has(u) && !searchMatches.has(v)) {
                    dimmedLinkIndices.push(linkIndex.toString());
                } else if (["Controls", "Enables", "Situational Input", "Situational Output"].includes(label)) {
                    greyLinkIndices.push(linkIndex.toString());
                }
            } else if (stepState) {
                if (stepState.activeEdges.has(edgeKey)) {
                    activeLinkIndices.push(linkIndex.toString());
                } else if (!stepState.visitedEdges.has(edgeKey)) {
                    dimmedLinkIndices.push(linkIndex.toString());
                } else if (["Controls", "Enables", "Situational Input", "Situational Output"].includes(label)) {
                    greyLinkIndices.push(linkIndex.toString());
                }
            } else if (["Controls", "Enables", "Situational Input", "Situational Output"].includes(label)) {
                greyLinkIndices.push(linkIndex.toString());
            }

            linkIndex++;
            addedEdges.add(edgeKey);
        }
    });

    if (greyLinkIndices.length > 0) {
        lines.push(`    linkStyle ${greyLinkIndices.join(',')} stroke:#808080,stroke-width:2px,color:#808080`);
    }
    if (dimmedLinkIndices.length > 0) {
        lines.push(`    linkStyle ${dimmedLinkIndices.join(',')} stroke:#e0e0e0,stroke-width:1px,color:#c0c0c0`);
    }
    if (activeLinkIndices.length > 0) {
        lines.push(`    linkStyle ${activeLinkIndices.join(',')} stroke:#1565C0,stroke-width:3.5px,color:#1565C0`);
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
