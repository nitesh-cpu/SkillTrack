import { SkillProgressChart } from './SkillProgressChart';
import { EvidenceStatusChart, WeeklyGrowthChart } from './StudentAnalyticsCharts';

export function StudentProgressCharts({ skills, achievements }) {
  return (
    <div className="student-analytics-grid">
      <section className="card student-analytics-card">
        <p className="eyebrow">CURRENT SCORES</p>
        <h3>Your skills today</h3>
        <p className="muted">Latest available score for each skill, out of 100.</p>
        <SkillProgressChart skills={skills} />
      </section>
      <section className="card student-analytics-card">
        <p className="eyebrow">RECENT CHANGE</p>
        <h3>Score change over 7 days</h3>
        <p className="muted">This compares recorded scores during the last seven days.</p>
        <WeeklyGrowthChart skills={skills} />
      </section>
      {achievements.length > 0 && (
        <section className="card student-analytics-card">
          <p className="eyebrow">EVIDENCE</p>
          <h3>Review status</h3>
          <p className="muted">Status across all of your submitted achievements.</p>
          <EvidenceStatusChart achievements={achievements} />
        </section>
      )}
    </div>
  );
}
