import { useState } from 'react';
import { Archive, CalendarClock, ClipboardList, Plus, Search, Users } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../components/Workspace';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

const EMPTY_EXAM = {
  title: '',
  description: '',
  durationMinutes: '30',
  passingMarks: '0',
  startAt: '',
  endAt: '',
  selectionMode: 'MANUAL',
  questionIds: [],
  topic: '',
  skillId: '',
  difficulty: '',
  count: '10',
};

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleString();
}

export default function ExamManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('PUBLISHED');
  const [questionSearch, setQuestionSearch] = useState('');
  const [form, setForm] = useState(EMPTY_EXAM);
  const [showCreate, setShowCreate] = useState(false);
  const [assigningExam, setAssigningExam] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const examsQuery = useApi(() => api.getExams({ page, limit: 25, search: appliedSearch, status }), [user?.role, page, appliedSearch, status]);
  const questionsQuery = useApi(
    () => api.getQuestionBank({ page: 1, limit: 100, search: questionSearch, status: 'APPROVED' }),
    [questionSearch],
  );
  const skillsQuery = useApi(() => api.getQuestionBankSkills(), []);
  const studentsQuery = useApi(
    async () => {
      if (isAdmin) return (await api.getAdminDirectory()).students;
      return (await api.getMentorDashboard()).students;
    },
    [isAdmin],
  );

  function startCreate() {
    setForm(EMPTY_EXAM);
    setError('');
    setQuestionSearch('');
    setShowCreate(true);
  }

  function toggleQuestion(questionId) {
    setForm(current => ({
      ...current,
      questionIds: current.questionIds.includes(questionId)
        ? current.questionIds.filter(id => id !== questionId)
        : [...current.questionIds, questionId],
    }));
  }

  async function createExam(event) {
    event.preventDefault();
    setError('');
    const startDate = new Date(form.startAt);
    const endDate = new Date(form.endAt);
    if (!form.title.trim() || !form.startAt || !form.endAt
      || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
      setError('Add a title and choose a valid start time before the end time.');
      return;
    }
    const input = {
      title: form.title.trim(),
      description: form.description.trim(),
      durationMinutes: Number(form.durationMinutes),
      passingMarks: Number(form.passingMarks),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      selectionMode: form.selectionMode,
      ...(form.selectionMode === 'MANUAL'
        ? { questionIds: form.questionIds }
        : { randomCriteria: {
            count: Number(form.count),
            ...(form.topic.trim() ? { topic: form.topic.trim() } : {}),
            ...(form.skillId ? { skillId: form.skillId } : {}),
            ...(form.difficulty ? { difficulty: form.difficulty } : {}),
          } }),
    };
    if (input.selectionMode === 'MANUAL' && !input.questionIds.length) {
      setError('Select at least one approved question.');
      return;
    }
    if (input.selectionMode === 'RANDOM' && !input.randomCriteria.topic && !input.randomCriteria.skillId) {
      setError('Choose a topic, a skill, or both for random selection.');
      return;
    }
    setBusy(true);
    try {
      await api.createExam(input);
      setShowCreate(false);
      setNotice('Exam created. You can now assign it to students.');
      examsQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create this exam.');
    } finally {
      setBusy(false);
    }
  }

  function openAssignment(exam) {
    setAssigningExam(exam);
    setSelectedStudents(exam.assignedStudents.map(student => student.id));
    setError('');
  }

  function toggleStudent(studentId) {
    setSelectedStudents(current => current.includes(studentId)
      ? current.filter(id => id !== studentId)
      : [...current, studentId]);
  }

  async function saveAssignments(event) {
    event.preventDefault();
    if (!assigningExam || !selectedStudents.length) {
      setError('Select at least one student.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.assignExam(assigningExam.id, selectedStudents);
      setAssigningExam(null);
      setNotice(`${result.newlyAssigned} student${result.newlyAssigned === 1 ? '' : 's'} assigned.`);
      examsQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not assign this exam.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveExam(exam) {
    setBusyId(exam.id);
    setError('');
    setNotice('');
    try {
      await api.archiveExam(exam.id);
      setNotice('Exam archived.');
      examsQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not archive this exam.');
    } finally {
      setBusyId('');
    }
  }

  const exams = examsQuery.data?.exams || [];
  const pagination = examsQuery.data?.pagination;
  const questions = questionsQuery.data?.questions || [];
  const selectedMarks = questions.filter(question => form.questionIds.includes(question.id))
    .reduce((sum, question) => sum + question.marks, 0);
  const students = (studentsQuery.data || []).filter(student => student.status !== 'Disabled' && student.isActive !== false);

  return (
    <>
      <PageHeader
        eyebrow="ASSESSMENTS"
        title="Exams"
        description={isAdmin
          ? 'Build exams from approved questions and assign them to students.'
          : 'Create exams from approved questions for your assigned students.'}
        action={<Button onClick={startCreate}><Plus size={16} /> Create exam</Button>}
      />
      {error && !showCreate && !assigningExam && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <Card>
        <form className="list-toolbar" onSubmit={event => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}>
          <div className="search-field"><Search size={16} /><input aria-label="Search exams" placeholder="Search exams" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <select aria-label="Filter by exam status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option>
          </select>
          <Button type="submit" variant="secondary">Search</Button>
          <span className="muted">{pagination?.total ?? 0} exams</span>
        </form>
        <QueryState loading={examsQuery.loading} error={examsQuery.error} onRetry={examsQuery.reload} />
        {examsQuery.data && (exams.length === 0
          ? <EmptyState title="No exams yet" detail="Create an exam using approved Question Bank questions." />
          : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Exam</th><th>Schedule</th><th>Questions</th><th>Marks</th><th>Assigned students</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{exams.map(exam => <tr key={exam.id}>
              <td><strong>{exam.title}</strong><br /><span className="muted">{exam.durationMinutes} min · {exam.difficulty}</span>{exam.description && <><br /><span className="muted">{exam.description}</span></>}</td>
              <td><CalendarClock size={14} /> {dateLabel(exam.startAt)}<br /><span className="muted">Until {dateLabel(exam.endAt)}</span></td>
              <td>{exam.questionCount}</td><td>{exam.totalMarks}<br /><span className="muted">Pass {exam.passingMarks}</span></td>
              <td>{exam.assignedStudents.length}{exam.assignedStudents.length > 0 && <><br /><span className="muted">{exam.assignedStudents.slice(0, 3).map(student => student.name).join(', ')}{exam.assignedStudents.length > 3 ? ', …' : ''}</span></>}</td>
              <td><span className={`status-pill ${exam.status === 'PUBLISHED' ? 'status-verified' : 'status-pending'}`}>{exam.status === 'PUBLISHED' ? 'Published' : 'Archived'}</span></td>
              <td><div className="toolbar-filters">
                {exam.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => openAssignment(exam)}><Users size={14} /> Assign students</Button>}
                {exam.status === 'PUBLISHED' && <Button variant="secondary" busy={busyId === exam.id} onClick={() => window.confirm(`Archive "${exam.title}"? Students will no longer be able to start it.`) && archiveExam(exam)}><Archive size={14} /> Archive</Button>}
              </div></td>
            </tr>)}</tbody></table></div>
            <div className="list-toolbar"><Button variant="secondary" disabled={!pagination || pagination.page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
              <span className="muted">Page {pagination?.page || 1} of {Math.max(1, pagination?.pages || 1)}</span>
              <Button variant="secondary" disabled={!pagination || pagination.page >= pagination.pages} onClick={() => setPage(value => value + 1)}>Next</Button>
            </div>
          </div>)}
      </Card>
      {showCreate && <Modal title="Create an exam" onClose={() => setShowCreate(false)} onSubmit={createExam} submitLabel="Create exam" busy={busy}>
        <label className="field-label">Title<input required minLength={2} maxLength={150} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label className="field-label">Description<textarea rows={2} maxLength={2000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <div className="form-grid">
          <label className="field-label">Duration (minutes)<input required type="number" min="1" max="360" value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: event.target.value })} /></label>
          <label className="field-label">Passing marks<input required type="number" min="0" step="0.25" value={form.passingMarks} onChange={event => setForm({ ...form, passingMarks: event.target.value })} /></label>
          <label className="field-label">Starts<input required type="datetime-local" value={form.startAt} onChange={event => setForm({ ...form, startAt: event.target.value })} /></label>
          <label className="field-label">Ends<input required type="datetime-local" value={form.endAt} onChange={event => setForm({ ...form, endAt: event.target.value })} /></label>
        </div>
        <label className="field-label">Question selection<select value={form.selectionMode} onChange={event => setForm({ ...form, selectionMode: event.target.value, questionIds: [] })}><option value="MANUAL">Choose approved questions</option><option value="RANDOM">Random from approved bank</option></select></label>
        {form.selectionMode === 'MANUAL'
          ? <div className="stacked-form"><label className="field-label">Find approved questions<input value={questionSearch} onChange={event => setQuestionSearch(event.target.value)} placeholder="Search text or topic" /></label>
            <div className="muted">Selected {form.questionIds.length} · {selectedMarks} marks</div>
            <QueryState loading={questionsQuery.loading} error={questionsQuery.error} onRetry={questionsQuery.reload} />
            {questions.map(question => <label className="question-choice" key={question.id}>
              <input type="checkbox" checked={form.questionIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
              <span><strong>{question.question}</strong><small>{question.skill} · {question.topic} · {question.difficulty} · {question.marks} marks</small></span>
            </label>)}
            {questionsQuery.data && questions.length === 0 && <p className="muted">No matching approved questions. Add or approve questions in the Question Bank first.</p>}
          </div>
          : <div className="form-grid">
            <label className="field-label">Topic<input maxLength={120} value={form.topic} onChange={event => setForm({ ...form, topic: event.target.value })} /></label>
            <label className="field-label">Skill<select value={form.skillId} onChange={event => setForm({ ...form, skillId: event.target.value })}><option value="">Any skill</option>{(skillsQuery.data || []).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
            <label className="field-label">Difficulty<select value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value })}><option value="">Any difficulty</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
            <label className="field-label">Number of questions<input required type="number" min="1" max="100" value={form.count} onChange={event => setForm({ ...form, count: event.target.value })} /></label>
            {skillsQuery.error && <Notice kind="error">{skillsQuery.error}</Notice>}
          </div>}
        {error && <Notice kind="error">{error}</Notice>}
      </Modal>}
      {assigningExam && <Modal title={`Assign "${assigningExam.title}"`} onClose={() => setAssigningExam(null)} onSubmit={saveAssignments} submitLabel="Save assignments" busy={busy}>
        <p className="muted">Select only students in your authorized workspace. Existing assignments are already selected.</p>
        <QueryState loading={studentsQuery.loading} error={studentsQuery.error} onRetry={studentsQuery.reload} />
        {students.length === 0 && studentsQuery.data && <EmptyState title="No students available" detail={isAdmin ? 'There are no active students to assign.' : 'No students are currently assigned to your mentor account.'} />}
        <div className="stacked-form">{students.map(student => <label className="question-choice" key={student.id}>
          <input type="checkbox" checked={selectedStudents.includes(student.id)} disabled={!selectedStudents.includes(student.id) && selectedStudents.length >= 500} onChange={() => toggleStudent(student.id)} />
          <span><strong>{student.name}</strong><small>{student.email}</small></span>
        </label>)}</div>
        <div className="muted"><ClipboardList size={14} /> {selectedStudents.length} selected</div>
        {error && <Notice kind="error">{error}</Notice>}
      </Modal>}
    </>
  );
}
