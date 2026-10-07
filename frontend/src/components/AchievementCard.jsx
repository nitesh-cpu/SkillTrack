import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { formatDate } from '../utils/formatters';

export function AchievementCard({ achievement }) {
  const statusClass = achievement.status.toLowerCase();
  return (
    <article className="card achievement-card">
      <div className="card-heading">
        <span className="category-label">{achievement.category}</span>
        <span className={`status-pill status-${statusClass}`}>{achievement.status === 'Verified' && achievement.category !== 'Exam result' ? 'Approved' : achievement.status}</span>
      </div>
      <h3>{achievement.title}</h3>
      <p className="muted achievement-description">{achievement.details}</p>
      {achievement.examResult && <p className="exam-evidence-score">{achievement.examResult.score}/{achievement.examResult.totalMarks} skill marks · {achievement.examResult.percentage}% · {achievement.examResult.passed ? 'Passed' : 'Not passed'}</p>}
      {achievement.feedback && (
        <p className={`feedback-note ${statusClass === 'rejected' ? 'feedback-note-rejected' : ''}`}>
          <strong>{statusClass === 'rejected' ? 'Review note:' : 'Mentor feedback:'}</strong>{' '}
          {achievement.feedback}
        </p>
      )}
      <div className="achievement-footer">
        <span><CalendarDays size={14} aria-hidden="true" />{formatDate(achievement.createdAt)}</span>
        {achievement.proofUrl && (
          <a className="card-link" href={achievement.proofUrl} target="_blank" rel="noreferrer">
            View submission link <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}
