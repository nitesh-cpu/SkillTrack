import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, PauseCircle, Save } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function VideoLessonPage() {
  const { lessonId } = useParams();
  const videoRef = useRef(null);
  const tracking = useRef({ position: 0, watched: 0, lastSavedAt: 0, pending: false });
  const query = useApi(() => api.getStudentLearningLesson(lessonId), [lessonId]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const context = query.data;

  useEffect(() => {
    if (!context) return;
    tracking.current = {
      position: context.lesson.progress.lastPosition,
      watched: context.lesson.progress.watchedSeconds,
      lastSavedAt: 0,
      pending: false,
    };
  }, [context]);

  async function persistProgress(force = false) {
    const video = videoRef.current;
    if (!video || !context || (!tracking.current.pending && !force)) return;
    tracking.current.pending = false;
    tracking.current.lastSavedAt = Date.now();
    setSaving(true);
    setSaveError('');
    try {
      const progress = await api.saveStudentVideoProgress(context.lesson.id, {
        lastPosition: Math.floor(video.currentTime),
        watchedSeconds: Math.floor(tracking.current.watched),
      });
      tracking.current.watched = Math.max(tracking.current.watched, progress.watchedSeconds);
      if (progress.completed) setNotice('Lesson completed. Your course progress has been updated.');
    } catch (reason) {
      tracking.current.pending = true;
      setSaveError(reason instanceof Error ? reason.message : 'Could not save lesson progress.');
    } finally {
      setSaving(false);
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const position = video.currentTime;
    const delta = position - tracking.current.position;
    if (delta > 0 && delta <= 3) tracking.current.watched = Math.min(context.lesson.durationSeconds, tracking.current.watched + delta);
    tracking.current.position = position;
    tracking.current.pending = true;
    if (Date.now() - tracking.current.lastSavedAt >= 5000) persistProgress();
  }

  function resumeVideo() {
    const video = videoRef.current;
    if (!video || !context) return;
    const duration = Number.isFinite(video.duration) ? video.duration : context.lesson.durationSeconds;
    video.currentTime = Math.min(context.lesson.progress.lastPosition, Math.max(0, duration - 1));
    tracking.current.position = video.currentTime;
  }

  useEffect(() => () => {
    if (tracking.current.pending && videoRef.current && context) {
      void api.saveStudentVideoProgress(context.lesson.id, {
        lastPosition: Math.floor(videoRef.current.currentTime),
        watchedSeconds: Math.floor(tracking.current.watched),
      });
    }
  }, [context]);

  return (
    <>
      <PageHeader eyebrow="VIDEO LESSON" title={context?.lesson.title || 'Continue lesson'} description={context ? `${context.course.title} · ${context.module.title}` : 'Resume your assigned video lesson.'} action={<Link className="button button-secondary" to="/student/learning"><ArrowLeft size={15} /> All courses</Link>} />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {notice && <Notice>{notice}</Notice>}
      {saveError && <Notice kind="error">{saveError}</Notice>}
      {context && <Card className="video-player-card">
        <video
          ref={videoRef}
          className="learning-video"
          controls
          preload="metadata"
          poster={context.lesson.thumbnailUrl || undefined}
          src={context.lesson.videoUrl}
          onLoadedMetadata={resumeVideo}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={() => {
            if (videoRef.current) tracking.current.position = videoRef.current.currentTime;
          }}
          onPause={() => persistProgress(true)}
          onEnded={() => persistProgress(true)}
        >
          Your browser does not support this video format.
        </video>
        <div className="video-lesson-details">
          <div><p className="eyebrow">{context.lesson.topic}</p><h2>{context.lesson.title}</h2><p className="muted">{context.lesson.description || 'Keep learning at your own pace. Progress is saved automatically.'}</p></div>
          <div className="video-lesson-meta"><span><Clock3 size={14} /> {formatTime(context.lesson.durationSeconds)}</span><span>{context.lesson.progress.completed ? <><CheckCircle2 size={14} /> Complete</> : <><PauseCircle size={14} /> {formatTime(context.lesson.progress.watchedSeconds)} watched</>}</span><Button variant="secondary" busy={saving} onClick={() => persistProgress(true)}><Save size={14} /> Save progress</Button></div>
        </div>
      </Card>}
    </>
  );
}
