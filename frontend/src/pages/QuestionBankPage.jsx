import { useState } from 'react';
import { Archive, ArrowLeft, Check, Edit3, Plus, Search } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../components/Workspace';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

const EMPTY_FORM = {
  question: '',
  questionType: 'MCQ',
  options: '',
  correctAnswer: '',
  explanation: '',
  topic: '',
  skillId: '',
  difficulty: 'MEDIUM',
  marks: '1',
};

const TYPE_LABELS = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', SHORT_OBJECTIVE: 'Short objective' };
const STATUS_LABELS = { DRAFT: 'Draft', APPROVED: 'Approved', ARCHIVED: 'Archived' };

function toInput(question) {
  return {
    question: question.question,
    questionType: question.questionType,
    options: question.options.join('\n'),
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    topic: question.topic,
    skillId: question.skillId,
    difficulty: question.difficulty,
    marks: String(question.marks),
  };
}

export default function QuestionBankPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [skillId, setSkillId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedTopic, setAppliedTopic] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const query = useApi(
    () => api.getQuestionBank({ page, limit: 25, search: appliedSearch, topic: appliedTopic, skillId, status, questionType, difficulty }),
    [user?.role, page, appliedSearch, appliedTopic, skillId, status, questionType, difficulty],
  );
  const skillsQuery = useApi(() => api.getQuestionBankSkills(), []);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function startEdit(question) {
    setEditing(question);
    setForm(toInput(question));
    setError('');
    setShowForm(true);
  }

  async function saveQuestion(event) {
    event.preventDefault();
    setError('');
    const options = form.questionType === 'MCQ'
      ? form.options.split(/\r?\n/).map(option => option.trim()).filter(Boolean)
      : [];
    const input = {
      ...form,
      options,
      marks: Number(form.marks),
      question: form.question.trim(),
      topic: form.topic.trim(),
      correctAnswer: form.correctAnswer.trim(),
      explanation: form.explanation.trim(),
    };
    if (!input.question || !input.topic || !input.correctAnswer || !input.skillId) {
      setError('Complete the question, topic, skill, and correct answer.');
      return;
    }
    if (input.questionType === 'MCQ' && (options.length < 2 || !options.includes(input.correctAnswer))) {
      setError('Add at least two answer options and choose the correct answer from them.');
      return;
    }
    if (input.questionType === 'TRUE_FALSE' && !['true', 'false'].includes(input.correctAnswer.toLowerCase())) {
      setError('Enter True or False as the correct answer.');
      return;
    }
    setBusy(true);
    try {
      if (editing) await api.updateQuestion(editing.id, input);
      else await api.createQuestion(input);
      setShowForm(false);
      setNotice(editing ? 'Question updated.' : 'Question saved as a draft.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this question.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(question, action) {
    setError('');
    setNotice('');
    setBusyId(question.id);
    try {
      if (action === 'approve') await api.approveQuestion(question.id);
      else await api.archiveQuestion(question.id);
      setNotice(action === 'approve' ? 'Question approved.' : 'Question archived.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this question.');
    } finally {
      setBusyId('');
    }
  }

  const questions = query.data?.questions || [];
  const pagination = query.data?.pagination;

  return (
    <>
      <PageHeader
        eyebrow="ASSESSMENT CONTENT"
        title="Question bank"
        description={isAdmin
          ? 'Manage questions and approve mentor-created drafts for exam use.'
          : 'Create draft questions and browse approved questions for learning activities.'}
        action={<Button onClick={startCreate}><Plus size={16} /> Add question</Button>}
      />
      {error && !showForm && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {skillsQuery.error && <Notice kind="error">{skillsQuery.error}</Notice>}
      <Card>
        <form className="list-toolbar" onSubmit={event => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); setAppliedTopic(topic.trim()); }}>
          <div className="search-field"><Search size={16} /><input aria-label="Search questions" placeholder="Search question or topic" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <select aria-label="Filter by status" value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}>
            <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="APPROVED">Approved</option><option value="ARCHIVED">Archived</option>
          </select>
          <select aria-label="Filter by question type" value={questionType} onChange={event => { setPage(1); setQuestionType(event.target.value); }}>
            <option value="">All types</option><option value="MCQ">Multiple choice</option><option value="TRUE_FALSE">True / False</option><option value="SHORT_OBJECTIVE">Short objective</option>
          </select>
          <select aria-label="Filter by difficulty" value={difficulty} onChange={event => { setPage(1); setDifficulty(event.target.value); }}>
            <option value="">All difficulties</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
          </select>
          <input aria-label="Filter by topic" placeholder="Topic" maxLength={120} value={topic} onChange={event => { setPage(1); setTopic(event.target.value); }} />
          <select aria-label="Filter by skill" value={skillId} onChange={event => { setPage(1); setSkillId(event.target.value); }}>
            <option value="">All skills</option>{(skillsQuery.data || []).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
          <Button type="submit" variant="secondary">Search</Button>
          <span className="muted">{pagination?.total ?? 0} questions</span>
        </form>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {query.data && (questions.length === 0
          ? <EmptyState title="No questions found" detail="Try different filters or add a question to the bank." />
          : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Question</th><th>Skill / topic</th><th>Type</th><th>Difficulty</th><th>Marks</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{questions.map(question => {
              const canEdit = isAdmin || (user?.role === 'mentor' && question.status === 'DRAFT' && question.createdById === user.id);
              const canArchive = isAdmin || (user?.role === 'mentor' && question.status === 'DRAFT' && question.createdById === user.id);
              return <tr key={question.id}>
                <td><strong>{question.question}</strong>{question.options.length > 0 && <><br /><span className="muted">{question.options.join(' · ')}</span></>}</td>
                <td>{question.skill}<br /><span className="muted">{question.topic}</span></td>
                <td>{TYPE_LABELS[question.questionType] || question.questionType}</td>
                <td>{question.difficulty}</td><td>{question.marks}</td>
                <td><span className={`status-pill ${question.status === 'APPROVED' ? 'status-verified' : 'status-pending'}`}>{STATUS_LABELS[question.status] || question.status}</span></td>
                <td><div className="toolbar-filters">
                  {canEdit && <Button variant="secondary" onClick={() => startEdit(question)}><Edit3 size={14} /> Edit</Button>}
                  {isAdmin && question.status === 'DRAFT' && <Button variant="secondary" busy={busyId === question.id} onClick={() => updateStatus(question, 'approve')}><Check size={14} /> Approve</Button>}
                  {canArchive && question.status !== 'ARCHIVED' && <Button variant="secondary" busy={busyId === question.id} onClick={() => window.confirm('Archive this question?') && updateStatus(question, 'archive')}><Archive size={14} /> Archive</Button>}
                </div></td>
              </tr>;
            })}</tbody></table></div>
            <div className="list-toolbar"><Button variant="secondary" disabled={!pagination || pagination.page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft size={14} /> Previous</Button>
              <span className="muted">Page {pagination?.page || 1} of {Math.max(1, pagination?.pages || 1)}</span>
              <Button variant="secondary" disabled={!pagination || pagination.page >= pagination.pages} onClick={() => setPage(value => value + 1)}>Next</Button>
            </div>
          </div>)}
      </Card>
      {showForm && <Modal title={editing ? 'Edit question' : 'Add a question'} onClose={() => setShowForm(false)} onSubmit={saveQuestion} submitLabel={editing ? 'Save changes' : 'Save draft'} busy={busy}>
          <label className="field-label">Question<textarea required minLength={5} maxLength={2000} rows={3} value={form.question} onChange={event => setForm({ ...form, question: event.target.value })} /></label>
          <div className="form-grid">
            <label className="field-label">Question type<select value={form.questionType} onChange={event => setForm({ ...form, questionType: event.target.value, options: '', correctAnswer: '' })}><option value="MCQ">Multiple choice</option><option value="TRUE_FALSE">True / False</option><option value="SHORT_OBJECTIVE">Short objective</option></select></label>
            <label className="field-label">Skill<select required value={form.skillId} onChange={event => setForm({ ...form, skillId: event.target.value })}><option value="">Select skill</option>{(skillsQuery.data || []).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
            <label className="field-label">Topic<input required maxLength={120} value={form.topic} onChange={event => setForm({ ...form, topic: event.target.value })} /></label>
            <label className="field-label">Difficulty<select value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value })}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
            <label className="field-label">Marks<input required type="number" min="0.25" max="100" step="0.25" value={form.marks} onChange={event => setForm({ ...form, marks: event.target.value })} /></label>
          </div>
          {form.questionType === 'MCQ' && <label className="field-label">Answer options <span className="muted">One option per line</span><textarea required rows={4} value={form.options} onChange={event => setForm({ ...form, options: event.target.value })} /></label>}
          <label className="field-label">{form.questionType === 'MCQ' ? 'Correct answer (must match an option)' : 'Correct answer'}<input required maxLength={1000} value={form.correctAnswer} onChange={event => setForm({ ...form, correctAnswer: event.target.value })} /></label>
          <label className="field-label">Explanation <span className="muted">Optional</span><textarea rows={2} maxLength={2000} value={form.explanation} onChange={event => setForm({ ...form, explanation: event.target.value })} /></label>
          {error && <Notice kind="error">{error}</Notice>}
      </Modal>}
    </>
  );
}
