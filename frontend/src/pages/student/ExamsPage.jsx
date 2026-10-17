import { useState } from 'react';
import { ArrowRight, CalendarClock, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';

const SECTIONS = [
  { category: 'UPCOMING', title: 'Upcoming exams', detail: 'These exams will open at their scheduled start time.' },
  { category: 'ACTIVE', title: 'Active exams', detail: 'Start or continue an available exam before its deadline.' },
  { category: 'COMPLETED', title: 'Completed exams', detail: 'Submitted or expired exam assignments.' },
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Schedule pending' : date.toLocaleString();
}

export default function ExamsPage() {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const query = useApi(() => api.getStudentExams(), []);
  const exams = query.data || [];

  async function startExam(item) {
    setError('');
    setBusyId(item.exam.id);
    try {
      const attempt = await api.startStudentExam(item.exam.id);
      navigate(`/student/exam-attempts/${encodeURIComponent(attempt.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this exam.');
      query.reload();
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader eyebrow="ASSESSMENTS" title="My exams" description="View your scheduled exams and continue an active attempt." />
      {error && <Notice kind="error">{error}</Notice>}
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && SECTIONS.map(section => {
        const sectionExams = exams.filter(item => item.category === section.category);
        return <section className="section-block" key={section.category}>
          <div className="section-heading"><div><p className="eyebrow">{section.title.toUpperCase()}</p><p className="muted">{section.detail}</p></div><span className="muted">{sectionExams.length}</span></div>
          {sectionExams.length === 0
            ? <EmptyState title={`No ${section.title.toLowerCase()}`} detail={section.category === 'UPCOMING' ? 'New exam assignments will appear here.' : 'Your exam list will update as assignments change.'} />
            : <div className="achievement-grid">{sectionExams.map(item => <Card className="exam-card" key={item.assignmentId}>
              <div className="task-heading-row"><span className={`status-pill ${item.category === 'ACTIVE' ? 'status-verified' : item.category === 'COMPLETED' ? 'status-strong' : 'status-pending'}`}>{item.status === 'IN_PROGRESS' ? 'In progress' : item.category === 'COMPLETED' ? 'Completed' : section.title}</span><Clock3 size={16} /></div>
              <h3>{item.exam.title}</h3>
              {item.exam.description && <p className="muted">{item.exam.description}</p>}
              <div className="task-meta"><span>{item.exam.durationMinutes} minutes</span><span>{item.exam.totalMarks} marks · pass {item.exam.passingMarks}</span></div>
              <p className="muted"><CalendarClock size={14} /> {formatDate(item.exam.startAt)} – {formatDate(item.exam.endAt)}</p>
              {section.category === 'ACTIVE'
                ? <Button busy={busyId === item.exam.id} onClick={() => startExam(item)}>{item.status === 'IN_PROGRESS' ? 'Continue exam' : 'Start exam'} <ArrowRight size={15} /></Button>
                : <Button variant="secondary" disabled> {section.category === 'UPCOMING' ? 'Not open yet' : 'Completed'} </Button>}
            </Card>)}</div>}
        </section>;
      })}
    </>
  );
}
