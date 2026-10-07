import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import { ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '@xyflow/react/dist/style.css';

const FILTERS = [
  ['ALL', 'All skills'],
  ['COMPLETED', 'Completed'],
  ['IN_PROGRESS', 'In progress'],
  ['LOCKED', 'Prerequisites first'],
  ['READY', 'Ready to start'],
];

function StudentSkillNode({ data }) {
  return (
    <div className={`student-flow-node student-flow-${data.viewStatus}`}>
      <Handle className="student-flow-handle" type="target" position={Position.Left} isConnectable={false} />
      <div className="student-flow-node-heading">
        <span>{data.label}</span>
        <strong>{data.score === null ? '—' : `${data.score}`}</strong>
      </div>
      <small>{data.statusLabel}</small>
      {data.blockedBy?.length > 0 && (
        <small className="student-flow-blocked">First complete: {data.blockedBy.join(', ')}</small>
      )}
      <Link to={`/student/skills/${data.skillId}`} className="student-flow-link">
        View skill <ArrowUpRight size={12} aria-hidden="true" />
      </Link>
      <Handle className="student-flow-handle" type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { studentSkill: StudentSkillNode };

function viewStatus(skill, skillsById) {
  if (skill.status === 'MASTERED') return 'COMPLETED';
  const blockedBy = (skill.prerequisites || [])
    .filter(prerequisite => skillsById.get(prerequisite.id)?.status !== 'MASTERED')
    .map(prerequisite => prerequisite.name);
  if (blockedBy.length) return 'LOCKED';
  return Number(skill.score) > 0 ? 'IN_PROGRESS' : 'READY';
}

export function StudentSkillGraph({ graph }) {
  const [filter, setFilter] = useState('ALL');
  const prepared = useMemo(() => {
    const skillsById = new Map(graph.skills.map(skill => [skill.id, skill]));
    const rows = graph.skills.map(skill => {
      const status = viewStatus(skill, skillsById);
      const blockedBy = (skill.prerequisites || [])
        .filter(prerequisite => skillsById.get(prerequisite.id)?.status !== 'MASTERED')
        .map(prerequisite => prerequisite.name);
      return { skill, status, blockedBy };
    });
    const visibleIds = new Set(rows.filter(row => filter === 'ALL' || row.status === filter).map(row => row.skill.id));
    const nodes = graph.nodes
      .filter(node => visibleIds.has(node.id))
      .map(node => {
        const row = rows.find(item => item.skill.id === node.id);
        return {
          id: node.id,
          type: 'studentSkill',
          position: node.position,
          data: {
            ...node.data,
            skillId: node.id,
            score: row.skill.score,
            viewStatus: row.status.toLowerCase().replace('_', '-'),
            statusLabel: {
              COMPLETED: 'Completed',
              IN_PROGRESS: 'In progress',
              LOCKED: 'Prerequisites first',
              READY: 'Ready to start',
            }[row.status],
            blockedBy: row.blockedBy,
          },
        };
      });
    const edges = graph.edges
      .filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map(edge => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#91a99a' },
        style: { stroke: '#91a99a', strokeWidth: 1.5 },
        label: undefined,
      }));
    return { nodes, edges, counts: rows.reduce((result, row) => {
      result[row.status] = (result[row.status] || 0) + 1;
      return result;
    }, {}) };
  }, [filter, graph]);

  return (
    <div className="student-graph">
      <div className="student-graph-filters" role="group" aria-label="Filter skills by status">
        {FILTERS.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={`filter-chip ${filter === value ? 'filter-chip-active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
            {value !== 'ALL' && <span>{prepared.counts[value] || 0}</span>}
          </button>
        ))}
      </div>
      <div className="student-graph-legend" aria-label="Skill status legend">
        <span><i className="legend-completed" />Completed</span>
        <span><i className="legend-in-progress" />In progress</span>
        <span><i className="legend-locked" />Prerequisites first</span>
        <span><i className="legend-ready" />Ready to start</span>
      </div>
      {prepared.nodes.length ? (
        <div className="skill-graph-viewport student-graph-viewport" role="region" aria-label="Interactive skill prerequisite graph">
          <ReactFlow
            nodes={prepared.nodes}
            edges={prepared.edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.25}
            maxZoom={1.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={node => ({
                completed: '#4d9272',
                'in-progress': '#7292ad',
                locked: '#d49b4f',
                ready: '#dfe7df',
              }[node.data.viewStatus] || '#dfe7df')}
            />
          </ReactFlow>
        </div>
      ) : (
        <p className="student-graph-empty" role="status">No skills match this filter.</p>
      )}
      <p className="student-graph-help">Arrows show which skills build on other skills. Select a skill card to view its details.</p>
    </div>
  );
}
