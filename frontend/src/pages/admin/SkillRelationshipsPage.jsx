import { lazy, Suspense, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Loading } from '../../components/Loading';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';
import { skillService } from '../../services/skillService';
import { requiredText } from '../../utils/validators';

const SkillGraph = lazy(() =>
  import('../../components/SkillGraph').then(module => ({
    default: module.SkillGraph,
  })),
);

export default function SkillRelationshipsPage() {
  const query = useApi(() => adminService.getRelationshipData(), []);
  const [prerequisite, setPrerequisite] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState('Prerequisite');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function add(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await skillService.addRelationship({
        prerequisite: requiredText(prerequisite, 'Prerequisite'),
        target: requiredText(target, 'Target skill'),
        type,
      });
      setPrerequisite('');
      setTarget('');
      setMessage('Skill relationship added.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add this relationship.');
    }
  }

  async function remove(relationship) {
    if (!window.confirm(`Remove the relationship from ${relationship.prerequisite} to ${relationship.target}?`)) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await skillService.removeRelationship(relationship.id);
      setMessage('Skill relationship removed.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove this relationship.');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="LEARNING PATHS"
        title="Make prerequisites clear."
        description="Set up the order students follow so the next skill builds on the last."
      />
      {message && <Notice onClose={() => setMessage('')}>{message}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      <Card className="relationship-form-card">
        <h3>Add a skill relationship</h3>
        <form className="inline-form" onSubmit={add}>
          <label>
            Prerequisite
            <input
              value={prerequisite}
              onChange={event => setPrerequisite(event.target.value)}
              placeholder="Java"
              required
            />
          </label>
          <ArrowRight size={17} aria-hidden="true" />
          <label>
            Next skill
            <input
              value={target}
              onChange={event => setTarget(event.target.value)}
              placeholder="Object-oriented programming"
              required
            />
          </label>
          <label>
            Relationship
            <select value={type} onChange={event => setType(event.target.value)}>
              <option>Prerequisite</option>
              <option>Blocking Requirement</option>
            </select>
          </label>
          <Button type="submit">
            <Plus size={15} />
            Add
          </Button>
        </form>
      </Card>

      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />

      {query.data && (
        <>
          <Card className="skill-graph-card">
            <div className="skill-graph-heading">
              <p className="eyebrow">SKILL GRAPH</p>
              <h3>How skills connect</h3>
              <p className="muted">
                Arrows show prerequisite relationships from the current skill catalog.
              </p>
            </div>
            {query.data.skills.length ? (
              <Suspense fallback={<div className="skill-graph-loading"><Loading label="Loading skill graph…" /></div>}>
                <SkillGraph data={query.data} />
              </Suspense>
            ) : (
              <div className="skill-graph-empty">
                <EmptyState
                  title="No skills to map yet"
                  detail="Skills from the active catalog will appear here."
                />
              </div>
            )}
          </Card>

          <section className="relationship-table-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CURRENT RULES</p>
                <h3>Skill relationships</h3>
              </div>
              <span className="muted">{query.data.relationships.length} total</span>
            </div>
            {query.data.relationships.length ? (
              <div className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Prerequisite</th>
                        <th aria-label="Direction" />
                        <th>Next skill</th>
                        <th>Type</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.relationships.map(relationship => (
                        <tr key={relationship.id}>
                          <td><strong>{relationship.prerequisite}</strong></td>
                          <td><ArrowRight size={16} className="muted" aria-hidden="true" /></td>
                          <td><strong>{relationship.target}</strong></td>
                          <td><span className="role-tag">{relationship.type}</span></td>
                          <td>
                            <Button
                              variant="danger"
                              className="button-small"
                              onClick={() => void remove(relationship)}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No relationships defined"
                detail="Add a prerequisite above to make the learning path visible in the graph."
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
