import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';
import { initials } from '../../utils/formatters';

export function AdminMentorsPage() {
  const [editingBatchMentor, setEditingBatchMentor] = useState(null);
  const [batchInput, setBatchInput] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const query = useApi(() => adminService.getDirectory(), []);
  const mentors = query.data?.mentors ?? [];

  async function saveMentorBatch(event) {
    event.preventDefault();
    if (!editingBatchMentor) return;
    setBusyId(editingBatchMentor.id);
    setError('');
    setNotice('');
    try {
      await adminService.updateUser(editingBatchMentor.id, { batch: batchInput.trim() });
      setNotice('Mentor batch updated.');
      setEditingBatchMentor(null);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update mentor batch.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="MENTOR DIRECTORY"
        title="The people helping learners level up."
        description="See current mentors, their assigned batches, and account details."
      />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (mentors.length ? (
        <div className="student-grid">
          {mentors.map(mentor => (
            <Card className="student-card" key={mentor.id}>
              <div className="student-card-head">
                <span className="avatar avatar-large">{initials(mentor.name)}</span>
                <div className="grow">
                  <h3>{mentor.name}</h3>
                  <span className="muted">{mentor.email}</span>
                </div>
                <span className={`status-pill status-${mentor.status === 'Active' ? 'verified' : 'rejected'}`}>
                  {mentor.status}
                </span>
              </div>
              <div className="student-progress-line">
                <span>Assigned batch</span>
                <strong>{mentor.batch || 'Unassigned'}</strong>
              </div>
              <div className="student-progress-line">
                <span>Students in cohort</span>
                <strong>{mentor.studentCount}</strong>
              </div>
              <Button
                variant="secondary"
                className="button-small button-full"
                style={{ marginTop: '0.6rem' }}
                onClick={() => {
                  setEditingBatchMentor(mentor);
                  setBatchInput(mentor.batch || '');
                }}
              >
                <Pencil size={13} /> Change batch
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No mentors yet" detail="Create a mentor account from the Users directory." />
      ))}
      {editingBatchMentor && (
        <Modal
          title={`Change batch for ${editingBatchMentor.name}`}
          onClose={() => setEditingBatchMentor(null)}
          onSubmit={saveMentorBatch}
          submitLabel="Save batch"
          busy={busyId === editingBatchMentor.id}
        >
          <p className="muted">Assign or change the cohort or batch for this mentor.</p>
          <label className="field-label">Batch name
            <input
              placeholder="e.g. Batch 2026-A"
              maxLength={100}
              value={batchInput}
              onChange={event => setBatchInput(event.target.value)}
              autoFocus
            />
          </label>
        </Modal>
      )}
    </>
  );
}
