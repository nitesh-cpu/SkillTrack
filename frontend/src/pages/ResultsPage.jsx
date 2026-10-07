import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, PageHeader, QueryState } from '../components/Workspace';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function Breakdown({ title, rows }) {
  if (!rows?.length) return null;
  return <div className="performance-group"><h4>{title}</h4>{rows.map(row => <div className="performance-line" key={`${title}-${row.label}`}>
    <strong>{row.label}</strong><span>{row.score}/{row.maxScore} marks</span><span>{row.correctCount} correct · {row.incorrectCount} incorrect · {row.unansweredCount} unanswered</span>
  </div>)}</div>;
}

export default function ResultsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const query = useApi(() => api.getExamResults(user?.role, { page, limit: 25 }), [user?.role, page]);
  const results = query.data?.results || [];
  const pagination = query.data?.pagination;
  const studentView = user?.role === 'student';
  const summary = useMemo(() => results.reduce((totals, item) => ({
    attempts: totals.attempts + 1,
    passed: totals.passed + Number(item.result.passed),
    score: totals.score + Number(item.result.percentage || 0),
  }), { attempts: 0, passed: 0, score: 0 }), [results]);

  return (
    <>
      <PageHeader
        eyebrow="ASSESSMENT HISTORY"
        title={studentView ? 'My exam results' : 'Exam results'}
        description={studentView ? 'Review your scores and topic, skill, and difficulty breakdowns.' : 'Review submitted results for students in your authorized workspace.'}
      />
      {results.length > 0 && <div className="stats-grid results-summary">
        <Card className="result-stat"><span>Results shown</span><strong>{summary.attempts}</strong></Card>
        <Card className="result-stat"><span>Passed</span><strong>{summary.passed}</strong></Card>
        <Card className="result-stat"><span>Average percentage</span><strong>{Math.round(summary.score / summary.attempts)}%</strong></Card>
      </div>}
      <Card>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {query.data && (results.length === 0
          ? <EmptyState title="No evaluated results yet" detail="Submitted exams will appear here after evaluation." />
          : <>
            <div className="table-card"><div className="table-scroll"><table><thead><tr>
              {!studentView && <th>Student</th>}<th>Exam</th><th>Submitted</th><th>Score</th><th>Outcome</th><th>Answers</th>{!studentView && <th>Activity</th>}<th>Performance</th>
            </tr></thead><tbody>{results.map(item => <tr key={item.attemptId}>
              {!studentView && <td><strong>{item.student?.name || 'Student'}</strong><br /><span className="muted">{item.student?.email || ''}</span></td>}
              <td><strong>{item.exam.title}</strong><br /><span className="muted">{dateLabel(item.exam.startAt)}</span></td>
              <td>{dateLabel(item.submittedAt)}</td>
              <td><strong>{item.result.score}/{item.exam.totalMarks}</strong><br /><span className="muted">{item.result.percentage}%</span></td>
              <td><span className={`status-pill ${item.result.passed ? 'status-verified' : 'status-rejected'}`}>{item.result.passed ? 'Passed' : 'Not passed'}</span></td>
              <td><span className="result-answer-counts"><span><CheckCircle2 size={13} /> {item.result.correctCount}</span><span><XCircle size={13} /> {item.result.incorrectCount}</span><span>{item.result.unansweredCount} unanswered</span></span></td>
              {!studentView && <td><details className="result-breakdown"><summary>{item.suspiciousActivityCount} events</summary>
                {item.activityEvents?.length ? item.activityEvents.map((event, index) => <p className="muted" key={`${event.type}-${event.occurredAt}-${index}`}>{event.type === 'TAB_HIDDEN' ? 'Tab or window hidden' : 'Fullscreen exited'} · {dateLabel(event.occurredAt)}</p>) : <p className="muted">No recorded activity events.</p>}
              </details></td>}
              <td><details className="result-breakdown"><summary>View breakdown</summary>
                <Breakdown title="Topics" rows={item.result.topicWise} />
                <Breakdown title="Skills" rows={item.result.skillWise} />
                <Breakdown title="Difficulty" rows={item.result.difficultyWise} />
              </details></td>
            </tr>)}</tbody></table></div></div>
            <div className="list-toolbar"><Button variant="secondary" disabled={!pagination || pagination.page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
              <span className="muted">Page {pagination?.page || 1} of {Math.max(1, pagination?.pages || 1)}</span>
              <Button variant="secondary" disabled={!pagination || pagination.page >= pagination.pages} onClick={() => setPage(value => value + 1)}>Next</Button>
            </div>
          </>)}
      </Card>
    </>
  );
}
