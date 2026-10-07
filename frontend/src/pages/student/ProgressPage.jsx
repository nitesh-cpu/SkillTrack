import { lazy, Suspense } from 'react';
import { BookOpenCheck, Check, Clock3, Flame } from 'lucide-react';
import { Card } from '../../components/Card';
import { Loading } from '../../components/Loading';
import { EmptyState, PageHeader, QueryState, StatCard } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { achievementService } from '../../services/achievementService';

const SkillProgressChart = lazy(() =>
  import('../../components/SkillProgressChart').then(module => ({
    default: module.SkillProgressChart,
  })),
);

export default function ProgressPage() {
  const { user } = useAuth();
  const query = useApi(() => achievementService.getStudentDashboard(user), [user?.id]);
  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow="YOUR MOMENTUM"
        title="Progress that adds up."
        description="A snapshot of the work you've shared and the skills you're building."
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard
              label="Verified work"
              value={data.totals.verified}
              detail="Achievements approved by your mentor"
              icon={Check}
              tone="green"
            />
            <StatCard
              label="Current tasks"
              value={data.totals.tasks}
              detail="Small steps to keep you moving"
              icon={Flame}
              tone="amber"
            />
            <StatCard
              label="Skills tracked"
              value={data.skills.length}
              detail="Competencies in your learning plan"
              icon={BookOpenCheck}
            />
            <StatCard
              label="Waiting for review"
              value={data.totals.pending}
              detail="Your mentor will take a look"
              icon={Clock3}
              tone="violet"
            />
          </div>

          {data.skills.length ? (
            <Card className="progress-card">
              <p className="eyebrow">SKILL-BY-SKILL</p>
              <h3>Your current learning mix</h3>
              <Suspense fallback={<Loading label="Loading skill progress chart…" />}>
                <SkillProgressChart skills={data.skills} />
              </Suspense>
              <div className="progress-list">
                {data.skills.map(skill => (
                  <div className="progress-row" key={skill.id}>
                    <div className="progress-row-label">
                      <span>{skill.name}</span>
                      <strong>{skill.score}%</strong>
                    </div>
                    <div className="progress-track">
                      <span
                        className={`progress-fill ${skill.score < 60 ? 'fill-improve' : ''}`}
                        style={{ width: `${skill.score}%` }}
                      />
                    </div>
                    <span className="muted progress-growth">
                      {skill.weeklyGrowth > 0 ? '+' : ''}
                      {skill.weeklyGrowth} points this week
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No skills to chart yet"
              detail="Your tracked skills and progress will appear here when they are available."
            />
          )}
        </>
      )}
    </>
  );
}
