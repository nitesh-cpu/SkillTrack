import { ArrowRight, BookOpen, CheckCircle2, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { EmptyState, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';

function progressPercent(lesson) {
  if (lesson.progress.completed) return 100;
  if (!lesson.durationSeconds) return 0;
  return Math.min(99, Math.round(lesson.progress.watchedSeconds / lesson.durationSeconds * 100));
}

export default function CoursesPage() {
  const query = useApi(() => api.getLearningCourses('student'), []);
  const courses = query.data || [];

  return (
    <>
      <PageHeader eyebrow="YOUR LEARNING" title="Video courses" description="Continue assigned lessons and pick up where you left off." />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && courses.length === 0 && <EmptyState title="No assigned courses yet" detail="Courses assigned by your mentor will appear here." />}
      <div className="learning-course-grid">{courses.map(course => {
        const lessons = course.modules.flatMap(module => module.lessons);
        const completed = lessons.filter(lesson => lesson.progress.completed).length;
        return <Card className="student-course-card" key={course.id}>
          <div className="course-card-heading"><span className="course-icon"><BookOpen size={17} /></span><div><p className="eyebrow">{course.skillName || 'LEARNING COURSE'}</p><h2>{course.title}</h2></div></div>
          {course.description && <p className="muted">{course.description}</p>}
          <div className="course-progress-overview"><span><CheckCircle2 size={14} /> {completed} of {lessons.length} lessons complete</span><span>{lessons.length ? Math.round(completed / lessons.length * 100) : 0}%</span></div>
          <div className="learning-module-list">{course.modules.map(module => <div key={module.id}>
            <strong>{module.title}</strong>
            {module.lessons.map(lesson => <Link className="learning-lesson-link" to={`/student/learning/lessons/${encodeURIComponent(lesson.id)}`} key={lesson.id}>
              <span className="lesson-link-title">{lesson.progress.completed ? <CheckCircle2 size={14} /> : <PlayCircle size={14} />}{lesson.title}</span>
              <span className="lesson-link-progress">{progressPercent(lesson)}% <ArrowRight size={13} /></span>
            </Link>)}
          </div>)}</div>
        </Card>;
      })}</div>
    </>
  );
}
