import { ArrowRight, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { EmptyState, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';

export default function LearningProgressSummary() {
  const query = useApi(() => api.getLearningCourses('student'), []);
  const lessons = (query.data || []).flatMap(course => course.modules.flatMap(module => module.lessons.map(lesson => ({
    ...lesson,
    courseTitle: course.title,
  })))).filter(lesson => lesson.progress.watchedSeconds > 0 || lesson.progress.completed)
    .sort((left, right) => Number(right.progress.completed) - Number(left.progress.completed)
      || right.progress.watchedSeconds - left.progress.watchedSeconds)
    .slice(0, 3);

  return (
    <section className="section-block student-dashboard-section">
      <div className="section-heading">
        <div><p className="eyebrow">VIDEO LEARNING</p><h3>Your lesson progress</h3></div>
        <Link to="/student/learning" className="text-link">All courses <ArrowRight size={15} /></Link>
      </div>
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (lessons.length ? lessons.map(lesson => {
        const percent = lesson.progress.completed ? 100 : Math.min(99, Math.round(lesson.progress.watchedSeconds / lesson.durationSeconds * 100));
        return <Link to={`/student/learning/lessons/${encodeURIComponent(lesson.id)}`} className="learning-progress-row" key={lesson.id}>
          <span className="task-icon"><PlayCircle size={16} /></span><span className="grow"><strong>{lesson.title}</strong><small>{lesson.courseTitle}</small></span><span className="learning-progress-value">{percent}%</span>
        </Link>;
      }) : <Card><EmptyState title="Start a video lesson" detail="Your lesson progress will appear here once you start learning." action={{ label: 'Browse courses', to: '/student/learning' }} /></Card>)}
    </section>
  );
}
