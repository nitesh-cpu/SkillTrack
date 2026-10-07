import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Award,
  Check,
  CheckCheck,
  ClipboardCheck,
  GraduationCap,
  ListTodo,
  MessageSquareText,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AchievementCard } from '../../components/AchievementCard';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Loading } from '../../components/Loading';
import { EmptyState, Notice, PageHeader, QueryState, StatCard } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { mentorService } from '../../services/mentorService';
import { formatDate, initials } from '../../utils/formatters';
import { requiredText } from '../../utils/validators';

const MentorStudentCharts = lazy(() =>
  import('../../components/MentorStudentCharts').then(module => ({
    default: module.MentorStudentCharts,
  })),
);

function useMentorData() {
  return useApi(() => mentorService.getDashboard(), []);
}

function submissionStatus(status) {
  return status === 'Verified' ? 'Approved' : status;
}

function StudentCompact({ student }) {
  return (
    <Link className="student-compact" to={`/mentor/students/${student.id}`}>
      <span className="avatar">{initials(student.name)}</span>
      <span className="grow"><strong>{student.name}</strong><small>{student.progress === null ? 'No recorded skill scores' : `${student.progress}% average across ${student.trackedSkills} recorded skill${student.trackedSkills === 1 ? '' : 's'}`}</small></span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

function PendingTaskCard({ task }) {
  return (
    <Link className="compact-task" to={`/mentor/tasks?task=${encodeURIComponent(task.id)}`}>
      <span className="task-icon"><ListTodo size={17} aria-hidden="true" /></span>
      <span className="grow"><strong>{task.title}</strong><small>{task.studentName} · {task.skill} · {task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</small></span>
      <span className="status-pill status-pending">Pending</span>
      <span className="button button-secondary button-small">View Task</span>
    </Link>
  );
}

export function MentorDashboardPage() {
  const query = useMentorData();
  const data = query.data;
  const pendingTasks = data?.tasks.filter(task => task.status === 'Pending') ?? [];
  const recentActivity = data ? [
    ...data.history.map(item => ({
      id: `review-${item.id}`,
      title: `${submissionStatus(item.status)} ${item.category.toLowerCase()} submission`,
      detail: `${item.studentName} · ${item.title}`,
      date: item.reviewedAt || item.createdAt,
      href: `/mentor/students/${item.studentId}`,
    })),
    ...data.tasks.map(task => ({
      id: `task-${task.id}`,
      title: 'Task assigned',
      detail: `${task.studentName} · ${task.title}`,
      date: task.createdAt,
      href: `/mentor/students/${task.studentId}`,
    })),
    ...data.tasks.flatMap(task => task.feedbackHistory.map(entry => ({
      id: `feedback-${task.id}-${entry.createdAt}`,
      title: 'Task feedback shared',
      detail: `${task.studentName} · ${task.title}`,
      date: entry.createdAt,
      href: `/mentor/students/${task.studentId}`,
    }))),
  ].sort((left, right) => new Date(right.date) - new Date(left.date)).slice(0, 6) : [];

  return (
    <>
      <PageHeader
        eyebrow="MENTOR HUB"
        title="Support progress with timely guidance."
        description="Review student work, check learning progress, and keep assignments moving."
        action={<Link className="button button-primary" to="/mentor/tasks?assign=true"><Plus size={16} /> Assign Task</Link>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard label="Assigned students" value={data.students.length} detail="Students in your cohort" icon={GraduationCap} />
            <StatCard label="Submissions to review" value={data.pending.length} detail="Submissions awaiting a decision" icon={ClipboardCheck} tone="amber" />
            <StatCard label="Open tasks" value={pendingTasks.length} detail="Assignments awaiting completion" icon={ListTodo} tone="violet" />
            <StatCard label="Recent reviews" value={data.history.length} detail="Previously reviewed submissions" icon={CheckCheck} tone="green" />
          </div>

          <div className="mentor-dashboard-grid">
            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">NEEDS YOUR EYES</p><h3>Pending submissions</h3></div>
                <Link to="/mentor/reviews" className="text-link">Review queue <ArrowRight size={15} /></Link>
              </div>
              {data.pending.slice(0, 4).map(item => (
                <Card className="compact-task" key={item.id}>
                  <span className="task-icon"><Award size={17} aria-hidden="true" /></span>
                  <span className="grow"><strong>{item.title}</strong><small>{item.studentName} · {item.category} · {formatDate(item.createdAt)}</small></span>
                  <Link to={`/mentor/reviews/${item.id}`} className="button button-secondary button-small">Review Submission</Link>
                </Card>
              ))}
              {!data.pending.length && <EmptyState title="You're all caught up" detail="New student submissions will appear in your review queue." />}
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR COHORT</p><h3>Students to check in on</h3></div>
                <Link to="/mentor/students" className="text-link">All students <ArrowRight size={15} /></Link>
              </div>
              {data.students.slice(0, 5).map(student => <StudentCompact key={student.id} student={student} />)}
              {!data.students.length && <EmptyState title="No students assigned" detail="Students assigned to your mentor account will appear here." />}
            </section>
          </div>

          <div className="mentor-dashboard-grid mentor-dashboard-lower">
            <section className="section-block">
              <div className="section-heading"><div><p className="eyebrow">ASSIGNMENTS</p><h3>Tasks still in progress</h3></div><Link to="/mentor/tasks" className="text-link">Manage tasks <ArrowRight size={15} /></Link></div>
              {pendingTasks.slice(0, 4).map(task => <PendingTaskCard key={task.id} task={task} />)}
              {!pendingTasks.length && <EmptyState title="No pending tasks" detail="Tasks assigned to your students will appear here while they work through them." />}
            </section>
            <section className="section-block">
              <div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>Mentor workspace updates</h3></div></div>
              {recentActivity.length ? (
                <Card className="mentor-activity-card">
                  {recentActivity.map(item => (
                    <Link className="activity-line mentor-activity-line" to={item.href} key={item.id}>
                      <span className="activity-dot" aria-hidden="true" />
                      <span className="grow"><strong>{item.title}</strong><small>{item.detail}</small></span>
                      <time dateTime={item.date}>{formatDate(item.date)}</time>
                    </Link>
                  ))}
                </Card>
              ) : <EmptyState title="No activity yet" detail="Reviews and task assignments will show here as your cohort gets started." />}
            </section>
          </div>
        </>
      )}
    </>
  );
}

export function MentorStudentsPage() {
  const query = useMentorData();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const students = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (query.data?.students ?? [])
      .filter(student => !normalized || `${student.name} ${student.email}`.toLowerCase().includes(normalized))
      .slice()
      .sort((left, right) => sort === 'progress'
        ? (right.progress ?? -1) - (left.progress ?? -1) || left.name.localeCompare(right.name)
        : left.name.localeCompare(right.name));
  }, [query.data, search, sort]);

  return (
    <>
      <PageHeader eyebrow="YOUR COHORT" title="Assigned students" description="Only students assigned to your mentor account are shown here." />
      <div className="list-toolbar">
        <label className="search-field"><Search size={16} /><input aria-label="Search assigned students" placeholder="Search students by name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="mentor-sort-control"><ArrowDownUp size={14} aria-hidden="true" /><span className="visually-hidden">Sort students</span><select aria-label="Sort students" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="progress">Progress</option></select></label>
        <span className="muted">{students.length} student{students.length === 1 ? '' : 's'}</span>
      </div>
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (students.length ? (
        <div className="student-grid">
          {students.map(student => (
            <Card className="student-card" key={student.id}>
              <div className="student-card-head">
                <span className="avatar avatar-large">{initials(student.name)}</span>
                <div className="grow"><h3>{student.name}</h3><span className="muted">{student.email}</span></div>
                <span className={`status-pill ${student.status === 'Active' ? 'status-verified' : 'status-rejected'}`}>{student.status}</span>
              </div>
              <div className="student-progress-line"><span>{student.trackedSkills ? `Average across ${student.trackedSkills} recorded skills` : 'Recorded skill progress'}</span><strong>{student.progress === null ? 'Not available' : `${student.progress}%`}</strong></div>
              {student.progress !== null && <div className="progress-track" role="progressbar" aria-label={`${student.name} average recorded score`} aria-valuenow={student.progress} aria-valuemin={0} aria-valuemax={100}><span className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, student.progress))}%` }} /></div>}
              <Link to={`/mentor/students/${student.id}`} className="button button-secondary button-full">Open student profile <ArrowRight size={15} /></Link>
            </Card>
          ))}
        </div>
      ) : <EmptyState title={search ? 'No matching students' : 'No students assigned'} detail={search ? 'Try a different name or email address.' : 'Students assigned to your mentor account will appear here.'} />)}
    </>
  );
}

export function StudentDetailPage() {
  const { studentId } = useParams();
  const query = useApi(() => mentorService.getStudentDetail(studentId), [studentId]);
  const data = query.data;
  const pendingSubmissions = data?.achievements.filter(item => item.status === 'Pending').length ?? 0;
  const openTasks = data?.tasks.filter(item => item.status === 'Pending').length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="ASSIGNED STUDENT"
        title={data?.student.name ?? 'Student profile'}
        description={data?.student.email}
        action={data && <Link className="button button-primary" to={`/mentor/tasks?student=${data.student.id}&assign=true`}><Plus size={15} /> Assign Task</Link>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard label="Current skill average" value={data.skills.length ? `${Math.round(data.skills.reduce((sum, skill) => sum + skill.score, 0) / data.skills.length)}%` : '—'} detail="Average of latest recorded skill scores" icon={GraduationCap} />
            <StatCard label="Tracked skills" value={data.skills.length} detail="Skills with recorded scores" icon={Users} />
            <StatCard label="Submissions to review" value={pendingSubmissions} detail="Awaiting your decision" icon={ClipboardCheck} tone="amber" />
            <StatCard label="Open tasks" value={openTasks} detail="Assigned by you" icon={ListTodo} tone="violet" />
          </div>

          <section className="section-block mentor-student-progress">
            <div className="section-heading"><div><p className="eyebrow">SKILL PROGRESS</p><h3>Latest recorded scores</h3></div></div>
            {data.skills.length ? (
              <>
                <Card className="mentor-progress-card">
                  <Suspense fallback={<div className="skill-graph-loading"><Loading label="Loading student progress charts…" /></div>}>
                    <MentorStudentCharts skills={data.skills} scoreHistory={data.scoreHistory} />
                  </Suspense>
                </Card>
                <div className="mentor-skill-grid">
                  {data.skills.map(skill => (
                    <Card className="mentor-skill-summary" key={skill.id}>
                      <div className="card-heading"><strong>{skill.name}</strong><span className="status-pill status-steady">{skill.score} / 100</span></div>
                      <p className="muted">{skill.category} · {skill.weeklyGrowth > 0 ? '+' : ''}{skill.weeklyGrowth} points since the previous recorded score</p>
                      {skill.breakdown?.length > 0 && <small className="muted">Includes {skill.breakdown.length} submission contribution{skill.breakdown.length === 1 ? '' : 's'} in the latest calculation.</small>}
                      {skill.pendingPrerequisites?.length > 0 && <small className="mentor-pending-prerequisites">Pending prerequisite: {skill.pendingPrerequisites.map(item => item.name).join(', ')}</small>}
                    </Card>
                  ))}
                </div>
              </>
            ) : <EmptyState title="No skill scores available" detail="Scores will appear when this student's submissions have been reviewed and calculated." />}
          </section>

          <div className="mentor-detail-grid">
            <section className="section-block">
              <div className="section-heading"><div><p className="eyebrow">PORTFOLIO</p><h3>Student submissions</h3></div><Link className="text-link" to="/mentor/reviews">Review queue <ArrowRight size={15} /></Link></div>
              {data.achievements.length ? data.achievements.map(item => (
                <div className="mentor-evidence-entry" key={item.id}>
                  <AchievementCard achievement={item} />
                  {item.status === 'Pending' && <Link className="button button-secondary button-small" to={`/mentor/reviews/${item.id}`}>Review Submission <ArrowRight size={14} /></Link>}
                  {item.skillMappings.length > 0 && (
                    <p className="mentor-evidence-skills"><strong>Skills linked:</strong> {item.skillMappings.map(mapping => `${mapping.skill} (${Math.round(mapping.relevance * 100)}% relevance)`).join(', ')}</p>
                  )}
                  {item.scoreImpact.length > 0 && (
                    <p className="mentor-evidence-skills"><strong>Latest score contribution:</strong> {item.scoreImpact.map(impact => `${impact.skill} (${impact.contribution.toFixed(1)} points)`).join(', ')}</p>
                  )}
                </div>
              )) : <EmptyState title="No submissions yet" detail="Student submissions will be listed here." />}
            </section>

            <section className="section-block">
              <div className="section-heading"><div><p className="eyebrow">ASSIGNMENTS</p><h3>Tasks assigned by you</h3></div></div>
              {data.tasks.length ? data.tasks.map(task => (
                <Card className="mentor-task-summary" key={task.id}>
                  <div className="card-heading"><strong>{task.title}</strong><span className={`status-pill ${task.status === 'Completed' ? 'status-verified' : 'status-pending'}`}>{task.status}</span></div>
                  <p className="muted">{task.description || 'No task description.'}</p>
                  <small className="muted">{task.skill} · {task.priority} priority · {task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</small>
                  {task.feedbackHistory?.slice().reverse().map((entry, index) => <p className="task-feedback-history" key={`${entry.createdAt}-${index}`}><MessageSquareText size={14} /><span><strong>{entry.feedback}</strong><small>{formatDate(entry.createdAt)}</small></span></p>)}
                  <Link className="button button-secondary button-small" to={`/mentor/tasks?task=${encodeURIComponent(task.id)}`}>View Task <ArrowRight size={14} /></Link>
                </Card>
              )) : <EmptyState title="No tasks assigned" detail="Tasks assigned to this student will appear here." action={{ label: 'Assign Task', to: `/mentor/tasks?student=${studentId}&assign=true` }} />}
            </section>
          </div>
        </>
      )}
    </>
  );
}

export function MentorReviewsPage() {
  const location = useLocation();
  const [showHistory, setShowHistory] = useState(false);
  const query = useApi(
    () => showHistory ? mentorService.getReviewHistory() : mentorService.getReviews(),
    [showHistory],
  );
  const reviews = query.data ?? [];

  return (
    <>
      <PageHeader eyebrow="SUBMISSION REVIEWS" title={showHistory ? 'Review history' : 'Give useful, timely feedback.'} description="Review submissions from students assigned to your mentor account." />
      {location.state?.notice && <Notice onClose={() => navigate(location.pathname, { replace: true, state: null })}>{location.state.notice}</Notice>}
      <div className="filter-row" role="group" aria-label="Review queue view">
        <button type="button" className={`filter-chip ${!showHistory ? 'filter-chip-active' : ''}`} aria-pressed={!showHistory} onClick={() => setShowHistory(false)}>Needs review</button>
        <button type="button" className={`filter-chip ${showHistory ? 'filter-chip-active' : ''}`} aria-pressed={showHistory} onClick={() => setShowHistory(true)}>Reviewed</button>
      </div>
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (reviews.length ? (
        <div className="mentor-review-list">
          {reviews.map(review => (
            <Card className="mentor-review-card" key={review.id}>
              <div className="card-heading"><span className="category-label">{review.category}</span><span className={`status-pill status-${review.status.toLowerCase()}`}>{submissionStatus(review.status)}</span></div>
              <h3>{review.title}</h3>
              <p className="muted">{review.studentName} · Submitted {formatDate(review.createdAt)}</p>
              <p className="mentor-review-description">{review.details}</p>
              {review.feedback && <p className="feedback-note"><strong>Feedback recorded:</strong> {review.feedback}</p>}
              {review.proofUrl && <a className="text-link" href={review.proofUrl} target="_blank" rel="noreferrer">Open submission link <ArrowRight size={14} /></a>}
              {showHistory && review.reviewerName && <p className="muted mentor-review-meta">Reviewed by {review.reviewerName}{review.reviewedAt ? ` · ${formatDate(review.reviewedAt)}` : ''}</p>}
              {!showHistory && <Link className="button button-primary" to={`/mentor/reviews/${review.id}`}>Review Submission <ArrowRight size={15} /></Link>}
              {review.studentId && <Link className="text-link mentor-review-student" to={`/mentor/students/${review.studentId}`}>View student profile</Link>}
            </Card>
          ))}
        </div>
      ) : <EmptyState title={showHistory ? 'No reviews recorded yet' : 'Review queue is clear'} detail={showHistory ? 'Completed submission decisions will appear here.' : 'Pending submissions from your assigned students will appear here.'} />)}
    </>
  );
}

export function MentorReviewDetailPage() {
  const { achievementId } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const query = useApi(() => mentorService.getReview(achievementId), [achievementId]);
  const review = query.data;

  async function decide(status) {
    setError('');
    if (status === 'Rejected') {
      try {
        requiredText(rejectionReason, 'Rejection reason');
        if (rejectionReason.trim().length < 5) throw new Error('Please provide at least 5 characters so the student can act on your feedback.');
      } catch (reason) {
        setError(reason.message);
        return;
      }
      if (!window.confirm('Reject this submission and send the feedback to the student?')) return;
    }
    setBusy(status);
    try {
      await mentorService.reviewAchievement(achievementId, status, feedback.trim(), rejectionReason.trim());
      navigate('/mentor/reviews', { replace: true, state: { notice: status === 'Verified' ? 'Submission approved and skill scores recalculated.' : 'Submission rejected and feedback sent to the student.' } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this review.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader eyebrow="REVIEW SUBMISSION" title={review?.title ?? 'Submission details'} description={review ? `${review.studentName} · ${review.category} · Submitted ${formatDate(review.createdAt)}` : 'Check the submission and leave clear feedback for the student.'} action={<Link className="button button-secondary" to="/mentor/reviews">Back to review queue</Link>} />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {review && (
        <div className="mentor-review-detail-grid">
          <Card>
            <div className="card-heading"><span className="category-label">{review.category}</span><span className={`status-pill status-${review.status.toLowerCase()}`}>{submissionStatus(review.status)}</span></div>
            <h3 className="mentor-evidence-title">{review.title}</h3>
            <p className="mentor-review-description">{review.details}</p>
            {review.proofUrl && <a className="button button-secondary" href={review.proofUrl} target="_blank" rel="noreferrer">Open submission link <ArrowRight size={15} /></a>}
            {review.skillImpacts?.length > 0 && (
              <div className="mentor-review-impact">
                <p className="eyebrow">CURRENT SKILL IMPACT</p>
                {review.skillImpacts.map(impact => (
                  <div className="mentor-review-impact-row" key={impact.skillId}>
                    <strong>{impact.skill}</strong>
                    <span>{impact.currentScore === null ? 'No score yet' : `Current score ${impact.currentScore} / 100`}</span>
                    <small>{impact.contribution === null ? 'Not included in a recorded score yet' : `${impact.contribution.toFixed(1)} points in the latest score`}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="mentor-evidence-meta">
              <span>Submitted {formatDate(review.createdAt)}</span>
              {review.studentId && <Link to={`/mentor/students/${review.studentId}`}>Open student profile <ArrowRight size={14} /></Link>}
            </div>
          </Card>
          <Card className="mentor-review-form">
            <p className="eyebrow">YOUR REVIEW</p>
            <h3>Give clear, actionable feedback</h3>
            {error && <Notice kind="error">{error}</Notice>}
            {review.status === 'Pending' ? <>
            <label htmlFor="review-feedback">Feedback for the student <span className="optional-label">OPTIONAL ON APPROVAL</span>
              <textarea id="review-feedback" value={feedback} onChange={event => setFeedback(event.target.value)} rows={4} maxLength={1000} placeholder="Share what was strong and what they could improve next." />
            </label>
            <label htmlFor="review-rejection">Reason for rejection <span className="optional-label">REQUIRED TO REJECT</span>
              <textarea id="review-rejection" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} rows={3} minLength={5} maxLength={1000} placeholder="Explain what proof or detail the student should add." />
            </label>
            <div className="form-actions mentor-review-actions">
              <Button variant="danger" busy={busy === 'Rejected'} disabled={Boolean(busy)} onClick={() => void decide('Rejected')}>Reject submission</Button>
              <Button busy={busy === 'Verified'} disabled={Boolean(busy)} onClick={() => void decide('Verified')}><Check size={15} /> Approve submission</Button>
            </div>
            </> : <Notice>Already reviewed as {submissionStatus(review.status)}. The review decision cannot be changed here.</Notice>}
          </Card>
        </div>
      )}
    </>
  );
}

export function MentorTasksPage() {
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get('student') || '';
  const taskId = searchParams.get('task');
  const editTaskId = searchParams.get('edit');
  const navigate = useNavigate();
  const location = useLocation();
  const query = useMentorData();
  const taskQuery = useApi(() => mentorService.getTasks(), []);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skill, setSkill] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [deadline, setDeadline] = useState('');
  const [editingTaskId, setEditingTaskId] = useState('');
  const [showForm, setShowForm] = useState(searchParams.get('assign') === 'true');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const students = query.data?.students ?? [];
  const skills = query.data?.skills ?? [];
  const tasks = taskQuery.data ?? [];
  const [statusFilter, setStatusFilter] = useState('All');
  const filteredTasks = tasks.filter(task => statusFilter === 'All' || task.status === statusFilter);

  useEffect(() => {
    if (searchParams.get('assign') === 'true') setShowForm(true);
    if (!editTaskId || !taskQuery.data) return;
    const task = taskQuery.data.find(item => item.id === editTaskId);
    if (!task) return;
    setEditingTaskId(task.id);
    setStudentId(task.studentId);
    setTitle(task.title);
    setDescription(task.description);
    setSkill(task.skill);
    setPriority(task.priority.toUpperCase());
    setDeadline(task.deadline === 'Not set' ? '' : task.deadline.slice(0, 10));
    setShowForm(true);
  }, [editTaskId, searchParams, taskQuery.data]);

  if (taskId) return <MentorTaskDetailsPage taskId={taskId} />;

  async function assign(event) {
    event.preventDefault();
    setError('');
    try {
      requiredText(studentId, 'Student');
      requiredText(title, 'Task title');
      requiredText(skill, 'Skill');
    } catch (reason) {
      setError(reason.message);
      return;
    }
    setBusy('save');
    try {
      if (editingTaskId) {
        await mentorService.updateTask(editingTaskId, {
          title: title.trim(),
          description: description.trim(),
          skill,
          priority,
          deadline,
        });
      } else {
        await mentorService.assignTask({
          studentId,
          title: title.trim(),
          description: description.trim(),
          skill,
          priority,
          deadline,
        });
      }
      navigate('/mentor/tasks', {
        replace: Boolean(editingTaskId),
        state: { notice: editingTaskId ? 'Task updated.' : 'Task assigned successfully.' },
      });
      setEditingTaskId('');
      setShowForm(false);
      setStudentId('');
      setTitle('');
      setDescription('');
      setSkill('');
      setPriority('MEDIUM');
      setDeadline('');
      taskQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not assign this task.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="MENTOR TASKS"
        title="Manage student tasks."
        description="Assign tasks to your students, follow their progress, and share feedback."
        action={!showForm && <Button onClick={() => setShowForm(true)}><Plus size={15} /> Assign Task</Button>}
      />
      {location.state?.notice && <Notice>{location.state.notice}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <QueryState loading={query.loading || taskQuery.loading} error={query.error || taskQuery.error} onRetry={() => { query.reload(); taskQuery.reload(); }} />
      {query.data && taskQuery.data && (
        <>
          {showForm && <Card className="mentor-task-form-card">
            <div className="section-heading"><div><p className="eyebrow">{editingTaskId ? 'EDIT ASSIGNMENT' : 'NEW ASSIGNMENT'}</p><h3>{editingTaskId ? 'Edit task' : 'Assign Task'}</h3></div></div>
            {students.length && skills.length ? (
              <form className="stacked-form mentor-task-form" onSubmit={assign}>
                <label htmlFor="task-student">Assigned student
                  <select id="task-student" value={studentId} onChange={event => setStudentId(event.target.value)} required disabled={Boolean(editingTaskId)}>
                    <option value="">Choose an assigned student</option>
                    {students.map(student => <option key={student.id} value={student.id}>{student.name} · {student.email}</option>)}
                  </select>
                </label>
                <label htmlFor="task-title">Task title
                  <input id="task-title" value={title} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={150} required placeholder="e.g. Build a responsive portfolio page" />
                </label>
                <label htmlFor="task-skill">Related skill
                  <select id="task-skill" value={skill} onChange={event => setSkill(event.target.value)} required>
                    <option value="">Choose a skill</option>
                    {skills.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label htmlFor="task-description">Instructions
                  <textarea id="task-description" value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={1500} placeholder="Add context, expectations, or useful resources." />
                </label>
                <label htmlFor="task-priority">Priority
                  <select id="task-priority" value={priority} onChange={event => setPriority(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select>
                </label>
                <label htmlFor="task-deadline">Due date <span className="optional-label">OPTIONAL</span>
                  <input id="task-deadline" type="date" value={deadline} onChange={event => setDeadline(event.target.value)} />
                </label>
                <div className="form-actions">
                  <Button type="submit" busy={busy === 'save'}>{editingTaskId ? 'Save changes' : <><Plus size={15} /> Assign Task</>}</Button>
                  <Button type="button" variant="secondary" onClick={() => {
                    setShowForm(false);
                    setEditingTaskId('');
                    setStudentId('');
                    setTitle('');
                    setDescription('');
                    setSkill('');
                    setPriority('MEDIUM');
                    setDeadline('');
                    setError('');
                    navigate('/mentor/tasks', { replace: true });
                  }}>Cancel</Button>
                </div>
              </form>
            ) : (
              <EmptyState title={!students.length ? 'No assigned students' : 'No active skills'} detail={!students.length ? 'Only students assigned to your mentor account can receive tasks.' : 'Tasks need an active skill from the skill catalog.'} />
            )}
          </Card>}

          <section className="section-block mentor-task-list-section">
            <div className="section-heading"><div><p className="eyebrow">TASK TRACKER</p><h3>Tasks you assigned</h3></div><span className="muted">{tasks.length} total</span></div>
            <div className="filter-row" role="group" aria-label="Filter tasks by status">
              {['All', 'Pending', 'Completed'].map(status => <button key={status} type="button" className={`filter-chip ${statusFilter === status ? 'filter-chip-active' : ''}`} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status}<span>{status === 'All' ? tasks.length : tasks.filter(task => task.status === status).length}</span></button>)}
            </div>
            {filteredTasks.length ? (
              <div className="mentor-task-list">
                {filteredTasks.map(task => (
                  <Card className="mentor-task-card" key={task.id}>
                    <div className="card-heading"><div><h3>{task.title}</h3><p className="muted">{task.studentName} · {task.skill}</p></div><span className={`status-pill ${task.status === 'Completed' ? 'status-verified' : 'status-pending'}`}>{task.status}</span></div>
                    <p className="muted">{task.description || 'No additional instructions.'}</p>
                    <div className="task-meta"><span>{task.priority} priority</span><span>{task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</span><Link to={`/mentor/students/${task.studentId}`}>Student profile <ArrowRight size={13} /></Link></div>
                    <Link className="button button-secondary button-small" to={`/mentor/tasks?task=${encodeURIComponent(task.id)}`}>View Task <ArrowRight size={14} /></Link>
                  </Card>
                ))}
              </div>
            ) : <EmptyState title={`No ${statusFilter.toLowerCase()} tasks`} detail="Tasks you assign to your students will appear here." action={{ label: 'Assign Task', to: '/mentor/tasks?assign=true' }} />}
          </section>
        </>
      )}
    </>
  );
}

function MentorTaskDetailsPage({ taskId }) {
  const navigate = useNavigate();
  const query = useApi(() => mentorService.getTask(taskId), [taskId]);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const task = query.data;

  async function saveFeedback(event) {
    event.preventDefault();
    if (feedback.trim().length < 2) {
      setError('Feedback must be at least 2 characters.');
      return;
    }
    setBusy('feedback');
    setError('');
    setNotice('');
    try {
      await mentorService.addTaskFeedback(taskId, feedback.trim());
      setFeedback('');
      setNotice('Feedback added to the task history.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save task feedback.');
    } finally {
      setBusy('');
    }
  }

  async function cancelTask() {
    if (!window.confirm('Cancel this pending task? It will be removed from the student task list.')) return;
    setBusy('cancel');
    setError('');
    try {
      await mentorService.cancelTask(taskId);
      navigate('/mentor/tasks', { replace: true, state: { notice: 'Task cancelled.' } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not cancel this task.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="TASK DETAILS"
        title={task?.title ?? 'Task details'}
        description={task ? `Assigned to ${task.studentName}` : 'View task status and share feedback.'}
        action={<Link className="button button-secondary" to="/mentor/tasks">Back to Tasks</Link>}
      />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {task && (
        <div className="mentor-task-detail-grid">
          <Card>
            <div className="card-heading">
              <span className={`status-pill ${task.status === 'Completed' ? 'status-verified' : 'status-pending'}`}>{task.status}</span>
              <span>{task.priority} priority</span>
            </div>
            <h3>{task.title}</h3>
            <p className="mentor-review-description">{task.description || 'No additional instructions.'}</p>
            <div className="task-meta">
              <Link to={`/mentor/students/${task.studentId}`}>{task.studentName} · View student <ArrowRight size={13} /></Link>
              <span>{task.skill}</span>
              <span>Created {formatDate(task.createdAt)}</span>
              <span>{task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</span>
            </div>
            <div className="mentor-task-progress">
              <div className="card-heading"><strong>Task progress</strong><span>{task.progress}%</span></div>
              <div className="progress-track" role="progressbar" aria-label="Task completion" aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100}>
                <span className="progress-fill" style={{ width: `${task.progress}%` }} />
              </div>
              <p className="muted">{task.status === 'Completed' ? 'The student marked this task complete.' : 'Waiting for the student to complete this task.'}</p>
            </div>
            {task.feedbackHistory?.length > 0 && (
              <div className="task-feedback-history-list">
                <strong>Feedback history</strong>
                {task.feedbackHistory.map((entry, index) => (
                  <p className="task-feedback-history" key={`${entry.createdAt}-${index}`}>
                    <MessageSquareText size={14} />
                    <span><strong>{entry.feedback}</strong><small>{formatDate(entry.createdAt)}</small></span>
                  </p>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <p className="eyebrow">MENTOR ACTIONS</p>
            <h3>Keep the task moving</h3>
            <div className="form-actions">
              {task.status === 'Pending' && <Link className="button button-secondary" to={`/mentor/tasks?edit=${encodeURIComponent(task.id)}`}>Edit task</Link>}
              {task.status === 'Pending' && <Button variant="danger" busy={busy === 'cancel'} onClick={() => void cancelTask()}>Cancel task</Button>}
            </div>
            <form className="stacked-form mentor-task-detail-feedback" onSubmit={saveFeedback}>
              <label htmlFor="task-detail-feedback">Feedback for the student
                <textarea id="task-detail-feedback" value={feedback} onChange={event => setFeedback(event.target.value)} rows={4} maxLength={1000} required minLength={2} placeholder="Share a specific note or next step." />
              </label>
              <Button type="submit" busy={busy === 'feedback'}><MessageSquareText size={15} /> Save feedback</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
