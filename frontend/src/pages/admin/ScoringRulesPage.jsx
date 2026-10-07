import { useState } from 'react';
import { ArrowRight, Plus, Settings2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';

const typeKeys = ['PROJECT', 'ASSESSMENT', 'CODING', 'COURSE', 'INTERVIEW'];
const sourceKeys = ['SELF', 'MENTOR', 'PLATFORM'];
const statusKeys = ['PENDING', 'VERIFIED', 'REJECTED'];
const labels = {
  PROJECT: 'Projects',
  ASSESSMENT: 'Assessments',
  CODING: 'Coding',
  COURSE: 'Courses',
  INTERVIEW: 'Interviews',
  SELF: 'Self reported',
  MENTOR: 'Mentor verified',
  PLATFORM: 'Admin/platform verified',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

function mapValues(source, keys, fallback = 0) {
  return Object.fromEntries(keys.map(key => [key, String(source?.[key] ?? fallback)]));
}

function valuesAsNumbers(source) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Number(value)]));
}

export default function ScoringRulesPage() {
  const query = useApi(() => adminService.getScoringRules(), []);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const activeRule = query.data?.activeRule;

  function edit(version) {
    const rule = query.data?.rawRules.find(item => `v${item.version}` === version);
    if (!rule) return;
    setError('');
    setDraft({
      version,
      typeWeights: mapValues(rule.typeWeights, typeKeys),
      reliabilityWeights: mapValues(rule.reliabilityWeights, sourceKeys),
      verificationWeights: mapValues(rule.verificationWeights, statusKeys),
      difficultyFloor: String(rule.difficultyFloor ?? 0.5),
      difficultyCeiling: String(rule.difficultyCeiling ?? 1),
      recencyHalfLifeDays: String(rule.recencyHalfLifeDays ?? 365),
      recencyFloor: String(rule.recencyFloor ?? 0.25),
      masteryThreshold: String(rule.masteryThreshold ?? 60),
      practiceThreshold: String(rule.practiceThreshold ?? 75),
    });
  }

  function updateValue(field, value) {
    setDraft(current => current && ({ ...current, [field]: value }));
  }

  function updateMap(field, key, value) {
    setDraft(current => current && ({
      ...current,
      [field]: { ...current[field], [key]: value },
    }));
  }

  async function createRule() {
    setError('');
    setMessage('');
    try {
      const version = await adminService.createRule();
      setMessage(`${version} draft created. Configure its factors before activating it.`);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a scoring rule.');
    }
  }

  async function activate(version) {
    setError('');
    setMessage('');
    try {
      await adminService.activateRule(version);
      setMessage(`${version} is now the active scoring rule.`);
      setDraft(null);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not activate this scoring rule.');
    }
  }

  async function save(event) {
    event.preventDefault();
    if (!draft) return;
    setError('');
    setMessage('');
    try {
      await adminService.updateRule(draft.version, {
        typeWeights: valuesAsNumbers(draft.typeWeights),
        reliabilityWeights: valuesAsNumbers(draft.reliabilityWeights),
        verificationWeights: valuesAsNumbers(draft.verificationWeights),
        difficultyFloor: Number(draft.difficultyFloor),
        difficultyCeiling: Number(draft.difficultyCeiling),
        recencyHalfLifeDays: Number(draft.recencyHalfLifeDays),
        recencyFloor: Number(draft.recencyFloor),
        masteryThreshold: Number(draft.masteryThreshold),
        practiceThreshold: Number(draft.practiceThreshold),
      });
      setMessage(`${draft.version} scoring factors saved.`);
      setDraft(null);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save scoring factors.');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="SCORING RULES"
        title="Keep progress scoring transparent."
        description="Configure evidence type, verification, difficulty and recency factors, then activate a version."
        action={<Button onClick={() => void createRule()}><Plus size={15} />New rule version</Button>}
      />
      {message && <Notice onClose={() => setMessage('')}>{message}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && query.data.rawRules.length === 0 && (
        <EmptyState title="No scoring rules yet" detail="Create a rule version to configure how student progress is scored." />
      )}
      {query.data && query.data.rawRules.length > 0 && (
        <div className="scoring-grid">
          {query.data.rawRules.map((rule, index) => {
            const version = `v${rule.version}`;
            const isActive = version === activeRule;
            return (
              <Card className="rule-card" key={version}>
                <div className="card-heading">
                  <span className={`stat-icon ${isActive ? 'stat-icon-green' : 'stat-icon-violet'}`}>
                    <Settings2 size={17} />
                  </span>
                  <span className={`status-pill status-${isActive ? 'verified' : 'pending'}`}>
                    {isActive ? 'Active' : index === 0 ? 'Draft' : 'Archived'}
                  </span>
                </div>
                <p className="eyebrow">EVIDENCE WEIGHTING</p>
                <h3>Rule {version}</h3>
                {!isActive && (
                  <div className="form-actions">
                    <Button variant="secondary" onClick={() => void activate(version)}>
                      Set as active <ArrowRight size={14} />
                    </Button>
                    <Button variant="secondary" onClick={() => edit(version)}>Edit factors</Button>
                  </div>
                )}
                {draft?.version === version && (
                  <form className="stacked-form scoring-rule-form" onSubmit={save}>
                    <strong>Evidence type weights</strong>
                    {typeKeys.map(key => (
                      <label key={key}>
                        {labels[key]}
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          required
                          value={draft.typeWeights[key]}
                          onChange={event => updateMap('typeWeights', key, event.target.value)}
                        />
                      </label>
                    ))}
                    <strong>Evidence source weights</strong>
                    {sourceKeys.map(key => (
                      <label key={key}>
                        {labels[key]}
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          required
                          value={draft.reliabilityWeights[key]}
                          onChange={event => updateMap('reliabilityWeights', key, event.target.value)}
                        />
                      </label>
                    ))}
                    <strong>Verification status multipliers</strong>
                    {statusKeys.map(key => (
                      <label key={key}>
                        {labels[key]}
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          required
                          value={draft.verificationWeights[key]}
                          onChange={event => updateMap('verificationWeights', key, event.target.value)}
                        />
                      </label>
                    ))}
                    <strong>Difficulty and recency</strong>
                    <label>
                      Difficulty floor
                      <input type="number" min="0" max="1" step="0.05" required value={draft.difficultyFloor} onChange={event => updateValue('difficultyFloor', event.target.value)} />
                    </label>
                    <label>
                      Difficulty ceiling
                      <input type="number" min="0" max="1" step="0.05" required value={draft.difficultyCeiling} onChange={event => updateValue('difficultyCeiling', event.target.value)} />
                    </label>
                    <label>
                      Recency half-life (days)
                      <input type="number" min="1" max="3650" step="1" required value={draft.recencyHalfLifeDays} onChange={event => updateValue('recencyHalfLifeDays', event.target.value)} />
                    </label>
                    <label>
                      Minimum recency multiplier
                      <input type="number" min="0" max="1" step="0.05" required value={draft.recencyFloor} onChange={event => updateValue('recencyFloor', event.target.value)} />
                    </label>
                    <strong>Recommendation thresholds</strong>
                    <label>
                      Mastery threshold
                      <input type="number" min="0" max="100" step="1" required value={draft.masteryThreshold} onChange={event => updateValue('masteryThreshold', event.target.value)} />
                    </label>
                    <label>
                      Practice threshold
                      <input type="number" min="0" max="100" step="1" required value={draft.practiceThreshold} onChange={event => updateValue('practiceThreshold', event.target.value)} />
                    </label>
                    <div className="form-actions">
                      <Button type="submit">Save factors</Button>
                      <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
                    </div>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
