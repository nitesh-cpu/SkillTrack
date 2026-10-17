import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Flame,
  GitBranch,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AchievementCard } from '../../components/AchievementCard';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Loading } from '../../components/Loading';
import {
  EmptyState,
  Notice,
  PageHeader,
  QueryState,
  StatCard,
} from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { achievementService } from '../../services/achievementService';
import { skillService } from '../../services/skillService';
import { formatDate } from '../../utils/formatters';
import { isHttpUrl, requiredText } from '../../utils/validators';
import { SkillCard } from '../../components/SkillCard';
import LearningProgressSummary from './LearningProgressSummary';

const StudentSkillGraph = lazy(() =>
  import('../../components/StudentSkillGraph').then(module => ({
    default: module.StudentSkillGraph,
  })),
);
const ScoreHistoryChart = lazy(() =>
  import('../../components/ScoreHistoryChart').then(module => ({
    default: module.ScoreHistoryChart,
  })),
);
const StudentProgressCharts = lazy(() =>
  import('../../components/StudentProgressCharts').then(module => ({
    default: module.StudentProgressCharts,
  })),
);

function assessedSkills(skills = []) {
  return skills.filter(skill => skill.calculatedAt || skill.evidenceCount > 0);
}

function averageScore(skills) {
  if (!skills.length) return '—';
  return `${Math.round(skills.reduce((total, skill) => total + skill.score, 0) / skills.length)}`;
}

function recommendationPath(recommendation) {
  if (recommendation.skillId) return `/student/skills/${recommendation.skillId}`;
  if (recommendation.type === 'PENDING_REVIEW') return '/student/achievements';
  if (recommendation.type === 'TASK') return '/student/tasks';
  return '/student/achievements/new';
}

function recommendationTitle(recommendation) {
  if (recommendation.type === 'PENDING_REVIEW') return 'Check your submissions';
  if (recommendation.skill) return `Focus on ${recommendation.skill}`;
  return recommendation.type?.replaceAll('_', ' ').toLowerCase() || 'A next step for you';
}

function scoreChangeReason(reason) {
  if (reason === 'evidence_verified') return 'A mentor or administrator reviewed a submission for this skill.';
  if (reason === 'evidence_rejected') return 'A reviewed submission was not counted toward this skill.';
  if (reason === 'evidence_submitted') return 'A new submission was added for this skill.';
  if (reason === 'scoring_rule_activated') return 'Your score was recalculated after a scoring update.';
  return 'Your score was recalculated from the submissions available at that time.';
}

export function StudentDashboardPage() {
  const { user } = useAuth();
  const query = useApi(async () => {
    const [dashboard, achievements, tasks] = await Promise.all([
      achievementService.getStudentDashboard(user),
      achievementService.getStudentAchievements(),
      achievementService.getStudentTasks(),
    ]);
    return {
      ...dashboard,
      achievements: achievements.slice(0, 8),
      totals: {
        achievements: achievements.length,
        verified: achievements.filter(item => item.status === 'Verified').length,
        pending: achievements.filter(item => item.status === 'Pending').length,
        rejected: achievements.filter(item => item.status === 'Rejected').length,
        tasks: tasks.filter(task => task.status === 'Pending').length,
      },
      tasks,
    };
  }, [user?.id]);
  const data = query.data;
  const scores = assessedSkills(data?.skills);
  const strongest = [...scores].sort((left, right) => right.score - left.score).slice(0, Math.ceil(scores.length / 2));
  const focusSkills = [...scores].sort((left, right) => left.score - right.score).slice(0, Math.floor(scores.length / 2));

  return (
    <>
      <PageHeader
        eyebrow="YOUR LEARNING, IN FOCUS"
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'learner'}.`}
        description={user?.batch || data?.user?.batch ? `Batch: ${user?.batch || data?.user?.batch} · A clear view of your skills, submitted work, and next steps.` : "A clear view of your skills, submitted work, and next steps."}
        action={<Link className="button button-primary" to="/student/achievements/new"><Award size={16} /> Add achievement</Link>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard label="Overall competency" value={averageScore(scores)} detail="Average of your current skill scores" icon={Target} />
            <StatCard label="Submissions" value={data.totals.achievements} detail="All the work you have submitted" icon={Award} />
            <StatCard label="Waiting for review" value={data.totals.pending} detail="Submissions awaiting feedback" icon={Clock3} tone="amber" />
            <StatCard label="Tasks to do" value={data.totals.tasks} detail="Open assignments from your mentor" icon={ClipboardList} tone="violet" />
          </div>

          <section className="section-block student-dashboard-section">
            <div className="section-heading">
              <div><p className="eyebrow">YOUR SKILLS</p><h3>Strengths and areas to revisit</h3></div>
              <Link to="/student/skills" className="text-link">All skills <ArrowRight size={15} /></Link>
            </div>
            {scores.length ? (
              <div className="student-strength-grid">
                <div>
                  <h4><CheckCircle2 size={16} /> Highest current scores</h4>
                  <div className="skills-grid">
                    {strongest.map(skill => <SkillCard key={skill.id} skill={skill} />)}
                  </div>
                </div>
                <div>
                  <h4><Target size={16} /> Skills to work on</h4>
                  <div className="skills-grid">
                    {focusSkills.length ? focusSkills.map(skill => <SkillCard key={skill.id} skill={skill} />) : <p className="muted student-no-weaker-skills">Your current skill scores are evenly represented here.</p>}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="Your skill scores will appear here" detail="Once skills are tracked and submissions are reviewed, you’ll see how your competency is developing." action={{ label: 'Browse skills', to: '/student/skills' }} />
            )}
          </section>

          <div className="dashboard-columns">
            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">RECOMMENDED BY SKILLTRACK</p><h3>Good next steps</h3></div>
                <Link to="/student/recommendations" className="text-link">Explore <ArrowRight size={15} /></Link>
              </div>
              {data.recommendations.slice(0, 3).map((recommendation, index) => (
                <Card className="student-recommendation" key={`${recommendation.type}-${recommendation.skillId || index}`}>
                  <span className="student-recommendation-icon"><Sparkles size={16} aria-hidden="true" /></span>
                  <div className="grow">
                    <strong>{recommendationTitle(recommendation)}</strong>
                    <p>{recommendation.message}</p>
                    {recommendation.pendingCount > 0 && <small>{recommendation.pendingCount} awaiting review</small>}
                  </div>
                  <Link className="icon-button" aria-label={`Open recommendation: ${recommendationTitle(recommendation)}`} to={recommendationPath(recommendation)}><ArrowRight size={16} /></Link>
                </Card>
              ))}
              {!data.recommendations.length && <EmptyState title="No recommendations right now" detail="New suggestions will appear when the system has a skill or review action to recommend." />}
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR LEARNING PLAN</p><h3>Pending tasks</h3></div>
                <Link to="/student/tasks" className="text-link">All tasks <ArrowRight size={15} /></Link>
              </div>
              {data.tasks.filter(task => task.status === 'Pending').slice(0, 3).map(task => (
                <Card className="compact-task" key={task.id}>
                  <span className="task-icon"><ClipboardList size={17} /></span>
                  <span className="grow"><strong>{task.title}</strong><small>{task.skill} · {task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</small></span>
                  <span className="status-pill status-pending">{task.priority}</span>
                </Card>
              ))}
              {!data.tasks.some(task => task.status === 'Pending') && <EmptyState title="Nothing on your task list" detail="Your mentor's next assignment will show up here." />}
            </section>
          </div>

          <LearningProgressSummary />

          <section className="section-block student-dashboard-section">
            <div className="section-heading">
              <div><p className="eyebrow">RECENT EVIDENCE</p><h3>Your latest achievements</h3></div>
              <Link to="/student/achievements" className="text-link">View all <ArrowRight size={15} /></Link>
            </div>
            {data.achievements.length ? (
              <div className="achievement-grid">
                {data.achievements.slice(0, 3).map(achievement => <AchievementCard key={achievement.id} achievement={achievement} />)}
              </div>
            ) : (
              <EmptyState title="Your story starts here" detail="Add the first achievement to start building your portfolio." action={{ label: 'Add an achievement', to: '/student/achievements/new' }} />
            )}
          </section>
        </>
      )}
    </>
  );
}

export function StudentSkillsPage() {
  const { user } = useAuth();
  const query = useApi(async () => {
    const [dashboardSkills, graph] = await Promise.all([
      skillService.getStudentSkills(user),
      skillService.getStudentSkillGraph(),
    ]);
    const dashboardById = new Map(dashboardSkills.map(skill => [skill.id, skill]));
    const skills = graph.skills.map(skill => ({
      ...skill,
      weeklyGrowth: dashboardById.get(skill.id)?.weeklyGrowth ?? 0,
    }));
    return { graph, skills };
  }, [user?.id]);

  return (
    <>
      <PageHeader
        eyebrow="YOUR SKILLS"
        title="A clearer picture of your strengths."
        description="See your current progress and how skills connect to one another."
        action={<a className="button button-secondary" href="#skill-map"><GitBranch size={16} /> Skill map</a>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (
        <>
          {query.data.skills.length ? (
            <div className="skills-grid">
              {query.data.skills.map(skill => <SkillCard key={skill.id} skill={skill} />)}
            </div>
          ) : (
            <EmptyState title="No skills to show yet" detail="Tracked skills will appear here when they are available in your learning plan." />
          )}
          <section className="card skill-graph-card student-skill-map" id="skill-map">
            <div className="skill-graph-heading">
              <p className="eyebrow">YOUR SKILL MAP</p>
              <h3>See what builds on what</h3>
              <p className="muted">Colors show your current progress. Arrows point from prerequisites to the skills they support.</p>
            </div>
            {query.data.graph.skills.length ? (
              <Suspense fallback={<div className="skill-graph-loading"><Loading label="Loading your skill map…" /></div>}>
                <StudentSkillGraph graph={query.data.graph} />
              </Suspense>
            ) : (
              <div className="skill-graph-empty"><EmptyState title="No skills to map yet" detail="Your personalized skill map will appear when your learning plan has skills." /></div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function SkillDetailPage() {
  const { user } = useAuth();
  const { skillId } = useParams();
  const query = useApi(async () => {
    const [graph, history] = await Promise.all([
      skillService.getStudentSkillGraph(),
      skillService.getStudentSkillHistory(skillId),
    ]);
    return { skill: graph.skills.find(item => item.id === skillId), history };
  }, [user?.id, skillId]);
  const skill = query.data?.skill;
  const latest = query.data?.history.at(-1);

  return (
    <>
      <PageHeader
        eyebrow="SKILL PROFILE"
        title={skill?.name ?? 'Skill details'}
        description={skill?.description || skill?.category || 'Your current progress and learning path for this skill.'}
        action={<Link className="button button-secondary" to="/student/skills">Back to skills</Link>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {skill && (
        <>
          <div className="student-skill-detail-grid">
            <Card className="student-current-score">
              <p className="eyebrow">CURRENT SCORE</p>
              <div className="detail-score">{skill.score}<span>/ 100</span></div>
              <div className="progress-track" role="progressbar" aria-label={`${skill.name} score`} aria-valuenow={skill.score} aria-valuemin={0} aria-valuemax={100}>
                <span className="progress-fill" style={{ width: `${skill.score}%` }} />
              </div>
              <p className="student-score-status">{{
                MASTERED: 'Completed',
                IN_PROGRESS: 'In progress',
                NOT_STARTED: 'Ready to start',
                UNASSESSED: 'No score recorded yet',
              }[skill.status] || 'Current progress'}</p>
              {skill.evidenceCount > 0 && <p className="muted">Based on {skill.evidenceCount} submission{skill.evidenceCount === 1 ? '' : 's'}.</p>}
              {latest && (
                <div className="student-score-explanation" role="status">
                  <strong>{latest.scoreChanged && latest.previousScore !== null ? `Changed from ${latest.previousScore} to ${latest.score}` : 'Latest score update'}</strong>
                  <p>{scoreChangeReason(latest.changeReason)}</p>
                  <small>{formatDate(latest.calculatedAt)}</small>
                </div>
              )}
            </Card>
            <Card>
              <p className="eyebrow">BUILDING BLOCKS</p>
              <h3>Skills that come first</h3>
              {skill.prerequisites?.length ? (
                <ul className="student-prerequisite-list">
                  {skill.prerequisites.map(prerequisite => (
                    <li key={prerequisite.id}>
                      <span><strong>{prerequisite.name}</strong><small>{prerequisite.score === null ? 'No score yet' : `${prerequisite.score} / 100`}</small></span>
                      <Link to={`/student/skills/${prerequisite.id}`} aria-label={`View ${prerequisite.name}`}><ArrowRight size={16} /></Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No prerequisite skills are listed for this skill.</p>}
              <Link className="button button-primary" to="/student/achievements/new">Add submission <ArrowRight size={15} /></Link>
            </Card>
          </div>
          <section className="card student-history-card">
            <p className="eyebrow">YOUR SCORE OVER TIME</p>
            <h3>Progress history</h3>
            <p className="muted">Each point reflects a recorded score calculation for this skill.</p>
            {query.data.history.length > 0 ? (
              <Suspense fallback={<div className="skill-graph-loading"><Loading label="Loading score history…" /></div>}>
                <ScoreHistoryChart history={query.data.history} />
              </Suspense>
            ) : (
              <EmptyState title="No score history yet" detail="Score changes will appear after submissions are connected to this skill and recalculated." />
            )}
          </section>
        </>
      )}
      {!query.loading && query.data && !skill && (
        <EmptyState title="This skill isn't in your learning plan" detail="Try opening one of the skills shown in your list." action={{ label: 'Browse skills', to: '/student/skills' }} />
      )}
    </>
  );
}

export function AchievementsPage() {
  const location = useLocation();
  const [filter, setFilter] = useState('All');
  const query = useApi(() => achievementService.getStudentAchievements(), []);
  const achievements = useMemo(
    () => (query.data ?? []).filter(item => filter === 'All' || item.status === filter),
    [query.data, filter],
  );

  return (
    <>
      <PageHeader
        eyebrow="YOUR SUBMISSIONS"
        title="Submissions"
        description="Keep track of submissions and learn from mentor feedback."
        action={<Link className="button button-primary" to="/student/achievements/new"><Award size={16} /> Add submission</Link>}
      />
      {location.state?.notice && <Notice>{location.state.notice}</Notice>}
      <div className="filter-row" role="group" aria-label="Filter submissions">
        {['All', 'Pending', 'Verified', 'Rejected'].map(status => (
          <button
            type="button"
            key={status}
            className={`filter-chip ${filter === status ? 'filter-chip-active' : ''}`}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status === 'Verified' ? 'Approved' : status}<span>{status === 'All' ? query.data?.length ?? 0 : query.data?.filter(item => item.status === status).length ?? 0}</span>
          </button>
        ))}
      </div>
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (achievements.length ? (
        <div className="achievement-grid">
          {achievements.map(achievement => <AchievementCard key={achievement.id} achievement={achievement} />)}
        </div>
      ) : (
        <EmptyState
          title={filter === 'All' ? 'No submissions yet' : `No ${filter === 'Verified' ? 'approved' : filter.toLowerCase()} submissions`}
          detail={filter === 'All' ? 'Add a submission of your work to build your learning portfolio.' : 'Submissions with this review status will appear here.'}
          action={filter === 'All' ? { label: 'Add submission', to: '/student/achievements/new' } : undefined}
        />
      ))}
    </>
  );
}

export function AddAchievementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Project');
  const [details, setDetails] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      requiredText(title, 'Submission title');
      requiredText(details, 'Description');
      if (!isHttpUrl(proofUrl.trim())) throw new Error('Enter a valid link beginning with http:// or https://.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the form fields.');
      return;
    }
    setBusy(true);
    try {
      await achievementService.submit(user, {
        title: title.trim(),
        category,
        details: details.trim(),
        proofUrl: proofUrl.trim(),
      });
      navigate('/student/achievements', { state: { notice: 'Your submission was sent for mentor review.' } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not submit this achievement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="ADD A SUBMISSION"
        title="Show what you’ve been working on."
        description="A clear description and optional proof link help your mentor give useful feedback."
      />
      <Card className="form-card">
        <div className="form-intro">
          <span className="stat-icon stat-icon-violet"><Sparkles size={18} /></span>
          <div><strong>Every step counts</strong><p>Submissions are sent to your mentor's review queue.</p></div>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <form className="stacked-form" onSubmit={submit}>
          <label htmlFor="achievement-title">Submission title
            <input id="achievement-title" value={title} onChange={event => setTitle(event.target.value)} required minLength={2} maxLength={150} autoComplete="off" placeholder="e.g. Launched my first React app" />
          </label>
          <label htmlFor="achievement-category">Submission type
            <select id="achievement-category" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="Project">Project</option>
              <option value="Coding Achievement">Coding Achievement</option>
              <option value="Course/Certification">Course/Certification</option>
              <option value="Competition">Competition</option>
              <option value="Other Achievement">Other Achievement</option>
            </select>
          </label>
          <label htmlFor="achievement-details">What did you accomplish?
            <textarea id="achievement-details" value={details} onChange={event => setDetails(event.target.value)} rows={5} required minLength={5} maxLength={3000} placeholder="Describe the challenge, tools you used, and what you learned." />
            <small className="field-hint">At least 5 characters. Include enough detail to help your mentor review the work.</small>
          </label>
          <label htmlFor="achievement-proof">Supporting link <span className="optional-label">OPTIONAL</span>
            <input id="achievement-proof" type="url" value={proofUrl} onChange={event => setProofUrl(event.target.value)} maxLength={2048} placeholder="https://github.com/you/project" aria-describedby="proof-help" />
            <small className="field-hint" id="proof-help">Use a link to a project, certificate, assessment, or other supporting work.</small>
          </label>
          <div className="form-actions">
            <Link className="button button-secondary" to="/student/achievements">Cancel</Link>
            <Button type="submit" busy={busy}><ArrowRight size={15} /> Submit</Button>
          </div>
        </form>
      </Card>
    </>
  );
}

export function StudentTasksPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const query = useApi(() => achievementService.getStudentTasks(), [user?.id]);
  const tasks = (query.data ?? []).filter(task => filter === 'All' || task.status === filter);

  async function complete(taskId) {
    setBusyId(taskId);
    setError('');
    setNotice('');
    try {
      await achievementService.completeTask(user.id, taskId);
      setNotice('Task marked complete. Nice work.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this task.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader eyebrow="YOUR LEARNING PLAN" title="One clear next step at a time." description="Assignments from your mentor are kept here so you can see what’s next." />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <div className="filter-row" role="group" aria-label="Filter tasks">
        {['All', 'Pending', 'Completed'].map(status => (
          <button type="button" key={status} className={`filter-chip ${filter === status ? 'filter-chip-active' : ''}`} aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {status}<span>{status === 'All' ? query.data?.length ?? 0 : query.data?.filter(task => task.status === status).length ?? 0}</span>
          </button>
        ))}
      </div>
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (tasks.length ? (
        <div className="task-list">
          {tasks.map(task => (
            <Card className="assigned-task-card" key={task.id}>
              <span className={`task-icon ${task.status === 'Completed' ? 'task-icon-done' : ''}`}>
                {task.status === 'Completed' ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
              </span>
              <div className="grow">
                <div className="task-heading-row"><h3>{task.title}</h3><span className={`status-pill status-${task.status === 'Completed' ? 'verified' : 'pending'}`}>{task.status}</span></div>
                <p className="muted">{task.description || 'Your mentor added a new learning goal.'}</p>
                <div className="task-meta"><span>{task.skill}</span><span>{task.priority} priority</span><span>{task.deadline === 'Not set' ? 'No due date' : `Due ${formatDate(task.deadline)}`}</span></div>
              </div>
              {task.status === 'Pending' && <Button className="task-complete-button" busy={busyId === task.id} onClick={() => void complete(task.id)}><Check size={15} /> Complete</Button>}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={filter === 'All' ? 'No assignments yet' : `No ${filter.toLowerCase()} assignments`} detail="Your mentor's learning tasks will show up here when they assign them." />
      ))}
    </>
  );
}

export function ProgressPage() {
  const { user } = useAuth();
  const query = useApi(async () => {
    const [dashboard, progress, achievements] = await Promise.all([
      achievementService.getStudentDashboard(user),
      achievementService.getStudentProgress(),
      achievementService.getStudentAchievements(),
    ]);
    return { dashboard, progress, achievements };
  }, [user?.id]);
  const data = query.data;
  const scores = assessedSkills(data?.dashboard.skills);
  const verified = data?.achievements.filter(item => item.status === 'Verified').length ?? 0;
  const pending = data?.achievements.filter(item => item.status === 'Pending').length ?? 0;
  const openTasks = data?.progress.tasks.filter(task => task.status === 'Pending').length ?? 0;

  return (
    <>
      <PageHeader eyebrow="YOUR MOMENTUM" title="Progress that adds up." description="A snapshot of your current scores, recent score changes, and submitted work." />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard label="Overall competency" value={averageScore(scores)} detail="Average across recorded skill scores" icon={Target} />
            <StatCard label="Approved submissions" value={verified} detail="Work approved by your reviewer" icon={Check} tone="green" />
            <StatCard label="Open tasks" value={openTasks} detail="Current assignments to work through" icon={Flame} tone="amber" />
            <StatCard label="Waiting for review" value={pending} detail="Submissions awaiting a decision" icon={Clock3} tone="violet" />
          </div>
          {scores.length ? (
            <Suspense fallback={<Loading label="Loading your progress charts…" />}>
              <StudentProgressCharts skills={scores} achievements={data.achievements} />
            </Suspense>
          ) : (
            <EmptyState title="No skill progress to chart yet" detail="Current skill scores and score changes will appear here when they are available." />
          )}
          <section className="section-block student-dashboard-section">
            <div className="section-heading">
              <div><p className="eyebrow">YOUR SKILLS</p><h3>Latest progress by skill</h3></div>
              <Link to="/student/skills" className="text-link">Explore skills <ArrowRight size={15} /></Link>
            </div>
            {data.dashboard.skills.length ? (
              <div className="skills-grid">{data.dashboard.skills.map(skill => <SkillCard key={skill.id} skill={skill} />)}</div>
            ) : <EmptyState title="No tracked skills yet" detail="Your skill list will appear here when it is available." />}
          </section>
        </>
      )}
    </>
  );
}

export function RecommendationsPage() {
  const { user } = useAuth();
  const query = useApi(() => achievementService.getStudentRecommendations(), [user?.id]);
  const recommendations = query.data?.recommendations ?? [];

  return (
    <>
      <PageHeader eyebrow="PERSONALIZED NEXT STEPS" title="A plan that meets you where you are." description="These suggestions use your current skill scores, prerequisite skills, and submission review status." />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (recommendations.length ? (
        <div className="recommendation-grid">
          {recommendations.map((recommendation, index) => (
            <Card className="recommendation-card student-recommendation-card" key={`${recommendation.type}-${recommendation.skillId || recommendation.blockedSkillId || index}`}>
              <span className="recommendation-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="stat-icon stat-icon-amber"><Target size={18} /></span>
              <p className="eyebrow">{recommendation.type?.replaceAll('_', ' ')}</p>
              <h3>{recommendationTitle(recommendation)}</h3>
              <p className="muted">{recommendation.message}</p>
              {recommendation.blockedSkill && <p className="recommendation-context">This is a prerequisite for {recommendation.blockedSkill}.</p>}
              {Number.isFinite(recommendation.score) && <p className="recommendation-context">Current score: {recommendation.score} / 100</p>}
              {recommendation.pendingCount > 0 && <p className="recommendation-context">{recommendation.pendingCount} submission{recommendation.pendingCount === 1 ? '' : 's'} waiting for review.</p>}
              {recommendation.suggestedActions?.length > 0 && (
                <ul className="suggested-action-list">{recommendation.suggestedActions.map(action => <li key={action}>{action}</li>)}</ul>
              )}
              <Link className="text-link" to={recommendationPath(recommendation)}>
                {recommendation.skillId ? 'View this skill' : recommendation.type === 'PENDING_REVIEW' ? 'View submissions' : 'Take the next step'} <ArrowRight size={15} />
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No recommended actions right now" detail="SkillTrack will show suggestions when your skill scores, prerequisites, or review status indicate a useful next step." />
      ))}
    </>
  );
}
