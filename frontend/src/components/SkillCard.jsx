import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusLabels = {
  MASTERED: 'Completed',
  IN_PROGRESS: 'In progress',
  NOT_STARTED: 'Ready to start',
  UNASSESSED: 'No score yet',
};

export function SkillCard({ skill, to }) {
  const score = Math.max(0, Math.min(100, Number(skill.score) || 0));
  const status = statusLabels[skill.status] || skill.status;
  const tone = skill.status === 'MASTERED' ? 'strong' : skill.status === 'IN_PROGRESS' ? 'steady' : 'improve';

  return (
    <article className="card skill-card">
      <div className="card-heading">
        <span className={`skill-icon skill-icon-${tone}`} aria-hidden="true">
          <TrendingUp size={17} />
        </span>
        {status && <span className={`status-pill status-${tone}`}>{status}</span>}
      </div>
      <div className="skill-card-copy">
        <h3>{skill.name}</h3>
        <p>{skill.category}</p>
        {skill.description && <p className="skill-description">{skill.description}</p>}
      </div>
      <div className="skill-score-row">
        <strong>{score}</strong>
        <span>/ 100</span>
        {skill.weeklyGrowth !== undefined && (
          <span className={`growth-indicator ${skill.weeklyGrowth < 0 ? 'growth-negative' : ''}`}>
            {skill.weeklyGrowth > 0 ? '+' : ''}{skill.weeklyGrowth} this week
          </span>
        )}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${skill.name} score`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`progress-fill fill-${tone}`} style={{ width: `${score}%` }} />
      </div>
      {skill.prerequisites?.length > 0 && (
        <p className="skill-prerequisite-note">
          Builds on {skill.prerequisites.map(item => item.name).join(', ')}
        </p>
      )}
      <Link className="card-link" to={to ?? `/student/skills/${skill.id}`}>
        View skill details <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </article>
  );
}
