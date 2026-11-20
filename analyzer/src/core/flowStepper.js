/**
 * Builds step-by-step traversal frames for animating data flow on any generated subgraph.
 * Supports explicit ordered paths (e.g. Case 2) as well as wave-based BFS traversal
 * for multi-path and neighbourhood diagrams.
 */

export function buildFlowSteps(gActive, payload) {
  if (!payload || !payload.nodes || payload.nodes.size === 0) return [];

  const nodeIds = Array.from(payload.nodes);
  const edges = payload.edges || [];
  const edgeKey = (u, v) => `${u}___${v}`;
  const getLabel = (id) =>
    payload.customLabels?.[id] ||
    (gActive && gActive.hasNode(id) ? gActive.getNodeAttribute(id, 'name') : id) ||
    'Unknown';

  // 1. Explicit linear path (e.g., Case 2 shortest directed data flow)
  if (Array.isArray(payload.orderedPath) && payload.orderedPath.length > 1) {
    const steps = [];
    const visitedNodes = new Set();
    const visitedEdges = new Set();

    payload.orderedPath.forEach((nodeId, idx) => {
      const activeNodes = new Set([nodeId]);
      const activeEdges = new Set();
      let summary = `Start: ${getLabel(nodeId)}`;

      if (idx > 0) {
        const prev = payload.orderedPath[idx - 1];
        const matching = edges.filter(
          (e) => (e.u === prev && e.v === nodeId) || (e.u === nodeId && e.v === prev)
        );
        matching.forEach((e) => activeEdges.add(edgeKey(e.u, e.v)));
        summary = `${getLabel(prev)} → ${getLabel(nodeId)}`;
      }

      steps.push({
        index: idx,
        activeNodes: new Set(activeNodes),
        visitedNodes: new Set(visitedNodes),
        activeEdges: new Set(activeEdges),
        visitedEdges: new Set(visitedEdges),
        summary
      });

      visitedNodes.add(nodeId);
      activeEdges.forEach((k) => visitedEdges.add(k));
    });

    return steps;
  }

  // 2. General directed wave traversal (BFS layers)
  const outAdj = new Map();
  const inDegree = new Map();
  nodeIds.forEach((id) => {
    outAdj.set(id, []);
    inDegree.set(id, 0);
  });

  edges.forEach((e) => {
    if (outAdj.has(e.u) && inDegree.has(e.v)) {
      outAdj.get(e.u).push(e);
      inDegree.set(e.v, inDegree.get(e.v) + 1);
    }
  });

  // Choose seed nodes: highlighted central nodes first, otherwise zero in-degree nodes
  let seeds = [];
  if (payload.highlightedNodes && payload.highlightedNodes.size > 0) {
    seeds = Array.from(payload.highlightedNodes).filter((id) => payload.nodes.has(id));
  }
  if (seeds.length === 0) {
    seeds = nodeIds.filter((id) => inDegree.get(id) === 0);
  }
  if (seeds.length === 0) {
    // Fallback for cyclic graphs: pick process nodes first
    seeds = nodeIds.filter((id) => {
      const t = gActive?.hasNode(id) ? gActive.getNodeAttribute(id, 'type') || '' : '';
      return t.includes('BusinessFunction') || t.includes('BusinessProcess');
    });
    if (seeds.length > 0) seeds = [seeds[0]];
    else seeds = [nodeIds[0]];
  }

  const steps = [];
  const discovered = new Set(seeds);
  const visitedNodes = new Set();
  const visitedEdges = new Set();

  let currentWave = new Set(seeds);
  let incomingWaveEdges = new Set();
  let stepIndex = 0;

  while (currentWave.size > 0) {
    const waveNames = Array.from(currentWave).map(getLabel);
    const preview =
      waveNames.length <= 2
        ? waveNames.join(', ')
        : `${waveNames.slice(0, 2).join(', ')} (+${waveNames.length - 2} more)`;

    steps.push({
      index: stepIndex,
      activeNodes: new Set(currentWave),
      visitedNodes: new Set(visitedNodes),
      activeEdges: new Set(incomingWaveEdges),
      visitedEdges: new Set(visitedEdges),
      summary: stepIndex === 0 ? `Origin: ${preview}` : `Reaches: ${preview}`
    });

    currentWave.forEach((n) => visitedNodes.add(n));
    incomingWaveEdges.forEach((k) => visitedEdges.add(k));

    const nextWave = new Set();
    const nextEdges = new Set();

    currentWave.forEach((u) => {
      (outAdj.get(u) || []).forEach((e) => {
        const k = edgeKey(e.u, e.v);
        if (!discovered.has(e.v)) {
          discovered.add(e.v);
          nextWave.add(e.v);
          nextEdges.add(k);
        } else if (!visitedEdges.has(k) && !incomingWaveEdges.has(k)) {
          // Cross / closing edge to an already visited node
          nextEdges.add(k);
        }
      });
    });

    // If there are disconnected components or remaining unvisited nodes, pick next seed
    if (nextWave.size === 0 && discovered.size < nodeIds.length) {
      const remaining = nodeIds.filter((id) => !discovered.has(id));
      const nextSeed = remaining.find((id) => inDegree.get(id) === 0) || remaining[0];
      discovered.add(nextSeed);
      nextWave.add(nextSeed);
    }

    currentWave = nextWave;
    incomingWaveEdges = nextEdges;
    stepIndex++;
  }

  return steps;
}
