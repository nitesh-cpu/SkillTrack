import { useMemo, useState } from 'react';
import { Pencil, Search, UserRoundCheck } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editingBatchStudent, setEditingBatchStudent] = useState(null);
  const [batchInput, setBatchInput] = useState('');
  const query = useApi(() => adminService.getDirectory(), []);
  const students = useMemo(() => (query.data?.students || []).filter(student => `${student.name} ${student.email} ${student.mentorName} ${student.batch || ''}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  const activeMentors = (query.data?.mentors || []).filter(mentor => mentor.status === 'Active');

  async function assign(student, mentorId) {
    setBusyId(student.id);
    setError('');
    setNotice('');
    try {
      if (!mentorId) {
        if (!student.mentorId || !window.confirm(`Remove ${student.mentorName}'s assignment from ${student.name}?`)) return;
        await adminService.unassignMentor(student.id);
        setNotice('Mentor assignment removed.');
      } else {
        const mentor = activeMentors.find(item => item.id === mentorId);
        if (!mentor || mentor.id === student.mentorId) return;
        const verb = student.mentorId ? 'Reassign' : 'Assign';
        if (!window.confirm(`${verb} ${student.name} to ${mentor.name}?`)) return;
        await adminService.assignMentor(mentor.id, student.id);
        setNotice('Mentor assignment saved.');
      }
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the mentor assignment.');
    } finally {
      setBusyId('');
    }
  }

  async function saveStudentBatch(event) {
    event.preventDefault();
    if (!editingBatchStudent) return;
    setBusyId(editingBatchStudent.id);
    setError('');
    setNotice('');
    try {
      await adminService.updateUser(editingBatchStudent.id, { batch: batchInput.trim() });
      setNotice('Student batch updated.');
      setEditingBatchStudent(null);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update student batch.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader eyebrow="STUDENT & MENTOR DIRECTORY" title="Student assignments" description="View student progress summaries and assign each student to one active mentor." />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <Card>
        <div className="list-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search students" placeholder="Search students, mentors, or batch" value={search} onChange={event => setSearch(event.target.value)} /></div><span className="muted">{students.length} students</span></div>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {query.data && (students.length === 0 ? <EmptyState title="No students found" detail="No students match the current search." /> : (
          <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Student</th><th>Batch</th><th>Progress</th><th>Current mentor</th><th>Manage assignment</th></tr></thead>
            <tbody>{students.map(student => <tr key={student.id}>
              <td><strong>{student.name}</strong><br /><span className="muted">{student.email}</span></td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{student.batch || <span className="muted">Unassigned</span>}</span>
                  <button
                    type="button"
                    className="icon-button"
                    title={`Change batch for ${student.name}`}
                    aria-label={`Change batch for ${student.name}`}
                    style={{ padding: '3px 6px', height: 'auto', width: 'auto', border: 'none', background: 'transparent' }}
                    onClick={() => {
                      setEditingBatchStudent(student);
                      setBatchInput(student.batch || '');
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </td>
              <td>{student.progress === null ? 'No score history' : `${student.progress}%`}</td>
              <td>{student.mentorName}</td>
              <td><div className="toolbar-filters">
                <select aria-label={`Select mentor for ${student.name}`} value={student.mentorId || ''} onChange={event => assign(student, event.target.value)} disabled={busyId === student.id}>
                  <option value="">Unassigned</option>
                  {activeMentors.map(mentor => <option key={mentor.id} value={mentor.id}>{mentor.name}</option>)}
                  {student.mentorId && !activeMentors.some(mentor => mentor.id === student.mentorId) && <option value={student.mentorId}>{student.mentorName} (inactive)</option>}
                </select>
                {busyId === student.id && <span className="muted">Saving…</span>}
              </div></td>
            </tr>)}</tbody></table></div></div>
        ))}
      </Card>
      {editingBatchStudent && (
        <Modal
          title={`Change batch for ${editingBatchStudent.name}`}
          onClose={() => setEditingBatchStudent(null)}
          onSubmit={saveStudentBatch}
          submitLabel="Save batch"
          busy={busyId === editingBatchStudent.id}
        >
          <p className="muted">Assign or change the cohort or batch for this student.</p>
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
