import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function createSkillGraph(data) {
  const names = new Map();
  for (const skill of data.skills) {
    const name = skill.name.trim();
    if (name) names.set(name.toLowerCase(), name);
  }
  for (const relationship of data.relationships) {
    for (const value of [relationship.prerequisite, relationship.target]) {
      const name = value.trim();
      if (name) names.set(name.toLowerCase(), name);
    }
  }

  const relationships = data.relationships
    .map(item => ({
      ...item,
      source: item.prerequisite.trim().toLowerCase(),
      target: item.target.trim().toLowerCase(),
    }))
    .filter(item => names.has(item.source) && names.has(item.target));
  const levels = new Map([...names.keys()].map(name => [name, 0]));
  const inDegree = new Map([...names.keys()].map(name => [name, 0]));
  const outgoing = new Map([...names.keys()].map(name => [name, []]));

  for (const relationship of relationships) {
    outgoing.get(relationship.source).push(relationship.target);
    inDegree.set(relationship.target, inDegree.get(relationship.target) + 1);
  }

  const queue = [...names.keys()].filter(name => inDegree.get(name) === 0).sort();
  while (queue.length) {
    const source = queue.shift();
    for (const target of outgoing.get(source)) {
      levels.set(target, Math.max(levels.get(target), levels.get(source) + 1));
      inDegree.set(target, inDegree.get(target) - 1);
      if (inDegree.get(target) === 0) queue.push(target);
    }
  }

  const columns = new Map();
  for (const [name, level] of levels) {
    const column = columns.get(level) ?? [];
    column.push(name);
    columns.set(level, column);
  }

  const nodes = [...columns.entries()].flatMap(([level, column]) =>
    column
      .sort((left, right) => names.get(left).localeCompare(names.get(right)))
      .map((name, row) => ({
        id: `skill-${name}`,
        position: { x: level * 260, y: row * 110 },
        data: { label: names.get(name) },
        className: 'skill-graph-node',
      })),
  );
  const edges = relationships.map(item => ({
    id: `relationship-${item.id}`,
    source: `skill-${item.source}`,
    target: `skill-${item.target}`,
    type: 'smoothstep',
    label: item.type,
    labelStyle: { fill: '#67756c', fontSize: 10 },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#82a990' },
    style: { stroke: '#82a990', strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

export function SkillGraph({ data }) {
  const { nodes, edges } = createSkillGraph(data);

  return (
    <div className="skill-graph-viewport" role="region" aria-label="Skill prerequisite graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
