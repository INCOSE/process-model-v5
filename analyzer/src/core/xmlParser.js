import Graph from 'graphology';

/**
 * Reads the ArchiMate Open Exchange XML and constructs Graphology graphs.
 * 
 * @param {string} xmlString - The raw XML content loaded from the file.
 * @param {boolean} includeEnables - Project Enables relationships.
 * @param {boolean} includeControls - Project Controls relationships.
 * @param {boolean} includeSituational - Project Situational relationships.
 * @returns {Object} { gFull, gDirect, processes, businessObjects }
 */
export function loadAndParseXML(xmlString, includeEnables = false, includeControls = false, includeSituational = false) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    // Using simple directed graph mode (equivalent to Python's nx.DiGraph)
    const gFull = new Graph({ type: 'directed' }); 
    const gDirect = new Graph({ type: 'directed' });
    
    const processes = {}; 
    const businessObjects = {};
    
    // --- 1. Collect graph nodes ---
    const elements = xmlDoc.querySelectorAll("*");
    elements.forEach(elem => {
        if (elem.tagName.endsWith('element')) {
            const nId = elem.getAttribute('identifier');
            
            let nType = 'Unknown';
            Array.from(elem.attributes).forEach(attr => {
                if (attr.name.endsWith('type')) nType = attr.value;
            });
            
            let name = "Unnamed";
            let doc = "";
            
            Array.from(elem.children).forEach(child => {
                if (child.tagName.endsWith('name') && child.textContent) {
                    name = child.textContent;
                } else if (child.tagName.endsWith('documentation') && child.textContent) {
                    doc = child.textContent;
                }
            });
            
            if (!gFull.hasNode(nId)) gFull.addNode(nId, { name, type: nType, doc });
            if (!gDirect.hasNode(nId)) gDirect.addNode(nId, { name, type: nType, doc });
            
            if (nType.includes('BusinessFunction')) {
                // Exclude Process Blueprint meta-container from UI selection lists
                if (name !== 'Process Blueprint') {
                    processes[nId] = name;
                }
            } else if (!nType.includes('BusinessProcess') && !nType.includes('Unknown') && 
                       !nType.includes('Role') && !nType.includes('Actor')) {
                businessObjects[nId] = name;
            }
        }
    });

    // --- 1.5 Identify Profile and Property IDs for specialisations ---
    const specialisationPropIds = new Set(['specialization', 'specialisation']);
    const profileDict = {};
    
    elements.forEach(elem => {
        if (elem.tagName.endsWith('propertyDefinition')) {
            const propId = elem.getAttribute('identifier');
            Array.from(elem.children).forEach(child => {
                if (child.tagName.endsWith('name') && child.textContent && 
                    child.textContent.toLowerCase().includes('specialization')) {
                    specialisationPropIds.add(propId);
                }
            });
        } else if (elem.tagName.endsWith('profile')) {
            const profId = elem.getAttribute('identifier');
            const profName = elem.getAttribute('name');
            if (profId && profName) profileDict[profId] = profName;
        }
    });

    // --- 2. Preliminary collection of relationships ---
    const relationships = [];
    elements.forEach(rel => {
        if (rel.tagName.endsWith('relationship')) {
            const src = rel.getAttribute('source');
            const tgt = rel.getAttribute('target');
            
            let rType = 'Association';
            Array.from(rel.attributes).forEach(attr => {
                if (attr.name.endsWith('type')) rType = attr.value;
            });
            
            const access = rel.getAttribute('accessType') || '';
            let relName = "";
            let subclass = "";
            
            Array.from(rel.children).forEach(child => {
                if (child.tagName.endsWith('name') && child.textContent) {
                    relName = child.textContent;
                } else if (child.tagName.endsWith('properties')) {
                    Array.from(child.children).forEach(prop => {
                        if (prop.tagName.endsWith('property')) {
                            const isSpec = specialisationPropIds.has(prop.getAttribute('propertyDefinitionRef'));
                            Array.from(prop.children).forEach(val => {
                                if (val.tagName.endsWith('value') && val.textContent) {
                                    if (isSpec || ['Controls', 'Enables', 'Situational'].includes(val.textContent)) {
                                        subclass = val.textContent;
                                    }
                                }
                            });
                        }
                    });
                } else if (child.tagName.endsWith('profiles')) {
                    Array.from(child.children).forEach(prof => {
                        if (prof.tagName.endsWith('profileRef')) {
                            const refId = prof.getAttribute('ref');
                            if (profileDict[refId]) subclass = profileDict[refId];
                        }
                    });
                }
            });
            
            if (['Controls', 'Enables', 'Situational'].includes(subclass)) {
                relName = subclass;
            }
                    
            relationships.push({ src, tgt, rType, access, relName, subclass });
        }
    });

    // --- 3. Identify the meta-level (Specialisation between BusinessFunctions) ---
    const metaParentsChildren = {};
    relationships.forEach(({ src, tgt, rType }) => {
        if (rType.includes('Specialization')) {
            if (gFull.hasNode(src) && gFull.hasNode(tgt)) {
                const srcType = gFull.getNodeAttribute(src, 'type') || '';
                const tgtType = gFull.getNodeAttribute(tgt, 'type') || '';
                
                if (srcType.includes('BusinessFunction') && tgtType.includes('BusinessFunction')) {
                    if (!metaParentsChildren[tgt]) metaParentsChildren[tgt] = [];
                    metaParentsChildren[tgt].push(src);
                }
            }
        }
    });

    // --- 4. Build the base graph ---
    relationships.forEach(({ src, tgt, rType, access, relName, subclass }) => {
        if (!gFull.hasNode(src) || !gFull.hasNode(tgt)) return;
            
        if (rType.includes('Access')) {
            const acc = access.toLowerCase();
            if (acc === 'read') {
                gFull.mergeDirectedEdge(tgt, src, { type: rType, access: 'Read', name: relName, subclass });
                gDirect.mergeDirectedEdge(tgt, src, { type: rType, access: 'Read', name: relName, subclass });
            } else if (acc === 'readwrite') {
                // ReadWrite создаёт как входящий поток (Read), так и исходящий (Write)
                gFull.mergeDirectedEdge(tgt, src, { type: rType, access: 'Read', name: relName, subclass });
                gDirect.mergeDirectedEdge(tgt, src, { type: rType, access: 'Read', name: relName, subclass });
                gFull.mergeDirectedEdge(src, tgt, { type: rType, access: 'Write', name: relName, subclass });
                gDirect.mergeDirectedEdge(src, tgt, { type: rType, access: 'Write', name: relName, subclass });
            } else {
                gFull.mergeDirectedEdge(src, tgt, { type: rType, access: access || 'Write', name: relName, subclass });
                gDirect.mergeDirectedEdge(src, tgt, { type: rType, access: access || 'Write', name: relName, subclass });
            }
        } else {
            gFull.mergeDirectedEdge(src, tgt, { type: rType, access, name: relName, subclass });
            
            const isHierarchy = ['Composition', 'Aggregation', 'Specialization'].some(x => rType.includes(x));
            if (!isHierarchy) {
                gDirect.mergeDirectedEdge(src, tgt, { type: rType, access, name: relName, subclass });
            } else if (!gFull.hasDirectedEdge(tgt, src)) {
                // Добавляем техническое обратное ребро только если нет реального направленного ребра
                gFull.mergeDirectedEdge(tgt, src, { type: rType, access: 'hierarchy_reverse', name: relName, subclass });
            }
        }
    });

    // --- 5. Apply meta-level processing logic ---
    Object.entries(metaParentsChildren).forEach(([parent, children]) => {
        if (!gFull.hasNode(parent)) return;
            
        const edgesToProject = [];
        
        // Helper: checks if a relationship has to be projected
        const shouldProject = (attr) => {
            if (!attr.type?.includes('Access')) return false;
            const sub = attr.subclass;
            if (sub === 'Controls' && includeControls) return true;
            if (sub === 'Enables' && includeEnables) return true;
            if (sub === 'Situational' && includeSituational) return true;
            return false;
        };
        
        // Collecting incoming
        gFull.forEachOutEdge(parent, (edge, attr, source, target) => {
            if (shouldProject(attr) && businessObjects[target]) {
                edgesToProject.push({ u: source, v: target, data: attr });
            }
        });
        
        // Collecting outgoing 
        gFull.forEachInEdge(parent, (edge, attr, source, target) => {
            if (shouldProject(attr) && businessObjects[source]) {
                edgesToProject.push({ u: source, v: target, data: attr });
            }
        });
        
        // Sharing with children
        edgesToProject.forEach(({ u, v, data }) => {
            children.forEach(child => {
                if (!gFull.hasNode(child)) return;
                
                const newU = u === parent ? child : u;
                const newV = v === parent ? child : v;
                
                gFull.mergeDirectedEdge(newU, newV, data);
                if (gDirect.hasNode(newU) && gDirect.hasNode(newV)) {
                    gDirect.mergeDirectedEdge(newU, newV, data);
                }
            });
        });

        // Prune Process Blueprint node after projection is complete
        const neighbours = new Set([...gFull.inNeighbors(parent), ...gFull.outNeighbors(parent)]);
        gFull.dropNode(parent);
        if (gDirect.hasNode(parent)) gDirect.dropNode(parent);
        if (processes[parent]) delete processes[parent]; 
            
        neighbours.forEach(n => {
            if (businessObjects[n] && gFull.hasNode(n)) {
                if (gFull.degree(n) === 0) {
                    gFull.dropNode(n);
                    if (gDirect.hasNode(n)) gDirect.dropNode(n);
                    delete businessObjects[n];
                }
            }
        });
    });

    return { gFull, gDirect, processes, businessObjects };
}