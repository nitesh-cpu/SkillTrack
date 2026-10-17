import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, Clock3, Maximize, Mic, Send, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';

function clockString(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

const DEFAULT_SECURITY = {
  requireFullscreen: true,
  requireCamera: true,
  requireMicrophone: true,
  maxViolations: 1,
  violationAction: 'AUTO_SUBMIT',
};

export default function ExamAttemptPage() {
  const { attemptId } = useParams();
  const query = useApi(() => api.getStudentExamAttempt(attemptId), [attemptId]);
  const attempt = query.data;
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(0);
  const [timerReady, setTimerReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const timers = useRef(new Map());
  const pendingAnswers = useRef(new Map());
  const inFlight = useRef(new Map());
  const finishing = useRef(false);
  const activityTimestamps = useRef(new Map());
  const fullscreenEntered = useRef(false);
  const mediaStream = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [activityCount, setActivityCount] = useState(0);
  const [secureReady, setSecureReady] = useState(false);
  const security = attempt?.security || attempt?.exam?.security || DEFAULT_SECURITY;
  const requiresSecureMode = security.requireFullscreen || security.requireCamera || security.requireMicrophone;

  function stopMedia() {
    mediaStream.current?.getTracks().forEach(track => track.stop());
    mediaStream.current = null;
  }

  useEffect(() => () => stopMedia(), []);

  useEffect(() => {
    if (!query.data) return;
    setAnswers(Object.fromEntries(query.data.questions.map(question => [question.id, question.answer || ''])));
    const offset = new Date(query.data.serverTime).getTime() - Date.now();
    const expiresAt = new Date(query.data.expiresAt).getTime();
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - (Date.now() + offset)) / 1000));
      setRemaining(seconds);
    };
    updateRemaining();
    setTimerReady(true);
    setSecureReady(!requiresSecureMode);
    if (query.data.status !== 'IN_PROGRESS') {
      setSubmitted(true);
      return undefined;
    }
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [query.data, requiresSecureMode]);

  async function enterSecureMode() {
    setError('');
    try {
      if (security.requireCamera || security.requireMicrophone) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera and microphone access are not supported by this browser.');
        mediaStream.current = await navigator.mediaDevices.getUserMedia({
          video: security.requireCamera,
          audio: security.requireMicrophone,
        });
      }
      if (security.requireFullscreen && !document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen mode is not supported by this browser.');
        await document.documentElement.requestFullscreen();
      }
      setSecureReady(true);
    } catch (reason) {
      stopMedia();
      setError(reason instanceof Error ? reason.message : 'Camera, microphone, and fullscreen access are required.');
      if (attempt?.id) {
        if (security.requireCamera) void api.recordStudentExamActivity(attempt.id, 'CAMERA_DENIED');
        if (security.requireMicrophone) void api.recordStudentExamActivity(attempt.id, 'MICROPHONE_DENIED');
      }
    }
  }

  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS' || submitted) return undefined;
    setActivityCount(attempt.suspiciousActivityCount || 0);
    async function recordActivity(type) {
      const now = Date.now();
      const previous = activityTimestamps.current.get(type) || 0;
      if (now - previous < 10_000 || finishing.current) return;
      activityTimestamps.current.set(type, now);
      try {
        const activity = await api.recordStudentExamActivity(attempt.id, type);
        setActivityCount(activity.suspiciousActivityCount);
        if (activity.autoSubmitted) {
          setSubmitted(true);
          setNotice('Your exam was submitted after the secure-exam violation limit was reached.');
          stopMedia();
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not record exam activity.');
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void recordActivity('TAB_HIDDEN');
    };
    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isFullscreen);
      if (isFullscreen) fullscreenEntered.current = true;
      else if (fullscreenEntered.current) {
        if (security.requireFullscreen) setSecureReady(false);
        void recordActivity('FULLSCREEN_EXITED');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [attempt?.id, attempt?.status, submitted, security.requireFullscreen]);

  function flushAnswers() {
    const pending = Array.from(pendingAnswers.current.values());
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    pendingAnswers.current.clear();
    pending.forEach(item => { void saveOne(item.questionId, item.answer); });
    return Promise.all(Array.from(inFlight.current.values())).then(results => {
      if (results.some(saved => !saved)) throw new Error('Some answers could not be saved. Try again before submitting.');
    });
  }

  async function saveOne(questionId, answer) {
    setSaving(true);
    let request;
    try {
      const previous = inFlight.current.get(questionId) || Promise.resolve();
      request = previous.then(() => api.saveStudentExamAnswer(attemptId, questionId, answer));
      inFlight.current.set(questionId, request);
      const attempt = await request;
      if (attempt.status !== 'IN_PROGRESS') setSubmitted(true);
      setError('');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your answer could not be saved. Check your connection and try again.');
      pendingAnswers.current.set(questionId, { questionId, answer });
      return false;
    } finally {
      if (inFlight.current.get(questionId) === request) inFlight.current.delete(questionId);
      setSaving(false);
    }
  }

  function updateAnswer(question, answer) {
    setAnswers(currentAnswers => ({ ...currentAnswers, [question.id]: answer }));
    pendingAnswers.current.set(question.id, { questionId: question.id, answer });
    const oldTimer = timers.current.get(question.id);
    if (oldTimer) window.clearTimeout(oldTimer);
    const timer = window.setTimeout(() => {
      timers.current.delete(question.id);
      const queued = pendingAnswers.current.get(question.id);
      if (!queued) return;
      pendingAnswers.current.delete(question.id);
      const request = saveOne(queued.questionId, queued.answer);
      inFlight.current.set(queued.questionId, request);
      request.finally(() => {
        if (inFlight.current.get(queued.questionId) === request) inFlight.current.delete(queued.questionId);
      });
    }, 450);
    timers.current.set(question.id, timer);
  }

  async function submitExam(automatic = false) {
    if (finishing.current || submitted) return;
    finishing.current = true;
    setSubmitting(true);
    setError('');
    try {
      await flushAnswers();
      await api.submitStudentExamAttempt(attemptId);
      setSubmitted(true);
      setNotice(automatic ? 'Time is up. Your exam has been submitted.' : 'Your exam has been submitted.');
    } catch (reason) {
      finishing.current = false;
      setError(reason instanceof Error ? reason.message : 'Could not submit the exam. Please retry.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFullscreen() {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error('Fullscreen mode is not supported by this browser.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Fullscreen mode could not be changed.');
    }
  }

  useEffect(() => {
    if (timerReady && query.data?.status === 'IN_PROGRESS' && remaining === 0 && !submitted) void submitExam(true);
  }, [timerReady, remaining, query.data?.status, submitted]);

  const question = attempt?.questions[current];
  const answeredCount = Object.values(answers).filter(answer => String(answer).trim()).length;

  return (
    <>
      <PageHeader
        eyebrow="EXAM IN PROGRESS"
        title={attempt?.exam?.title || 'Exam attempt'}
        description={attempt?.exam?.description || 'Your answers are saved securely as you work.'}
        action={<div className="exam-header-controls"><Button variant="secondary" disabled={submitted} onClick={toggleFullscreen}><Maximize size={15} /> {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</Button><div className={`exam-clock ${remaining < 60 ? 'exam-clock-warning' : ''}`} aria-live="polite"><Clock3 size={17} /> {clockString(remaining)}</div></div>}
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {attempt && !submitted && <div className="alert alert-warning" role="status"><AlertTriangle size={16} />Secure-exam violations are recorded. Reaching {security.maxViolations} violation{security.maxViolations === 1 ? '' : 's'} will {security.violationAction === 'AUTO_SUBMIT' ? 'submit the exam automatically' : 'flag the attempt for review'}. Recorded events: {activityCount}.</div>}
      {submitted
        ? <Card className="exam-submitted"><Check size={24} /><h3>Exam submitted</h3><p className="muted">Your response has been received. Results will be available after evaluation.</p><Link className="button button-primary" to="/student/exams">Return to my exams</Link></Card>
        : attempt && !secureReady && requiresSecureMode ? <Card className="secure-exam-gate"><ShieldCheck size={28} /><h3>Secure exam check</h3><p className="muted">Before the questions open, allow the required camera, microphone, and fullscreen access. Leaving fullscreen or switching tabs is recorded as a violation.</p><div className="secure-check-list"><span><Maximize size={15} /> {security.requireFullscreen ? 'Fullscreen required' : 'Fullscreen optional'}</span><span><Camera size={15} /> {security.requireCamera ? 'Camera required' : 'Camera optional'}</span><span><Mic size={15} /> {security.requireMicrophone ? 'Microphone required' : 'Microphone optional'}</span></div><Button onClick={enterSecureMode}><Maximize size={15} /> Enter secure exam</Button></Card>
        : attempt && question && <div className="exam-workspace">
          <Card className="exam-question-card">
            <div className="exam-question-toolbar"><span className="eyebrow">QUESTION {question.number} OF {attempt.questions.length}</span><span className="muted">{question.marks} marks · {question.difficulty}</span></div>
            <h3>{question.question}</h3>
            {question.questionType === 'MCQ' && <div className="exam-options">{question.options.map((option, index) => <label className="exam-option" key={`${question.id}-${option}`}>
              <input type="radio" name={question.id} value={option} disabled={submitting} checked={answers[question.id] === option} onChange={() => updateAnswer(question, option)} />
              <span>{String.fromCharCode(65 + index)}. {option}</span>
            </label>)}</div>}
            {question.questionType === 'TRUE_FALSE' && <div className="exam-options">{['True', 'False'].map(option => <label className="exam-option" key={option}>
              <input type="radio" name={question.id} value={option} disabled={submitting} checked={answers[question.id]?.toLowerCase() === option.toLowerCase()} onChange={() => updateAnswer(question, option)} />
              <span>{option}</span>
            </label>)}</div>}
            {question.questionType === 'SHORT_OBJECTIVE' && <label className="field-label">Your answer<textarea rows={4} maxLength={1000} disabled={submitting} value={answers[question.id] || ''} onChange={event => updateAnswer(question, event.target.value)} /></label>}
            <div className="exam-question-actions"><Button variant="secondary" disabled={submitting || current === 0} onClick={() => setCurrent(value => value - 1)}><ArrowLeft size={15} /> Previous</Button>
              <span className="muted">{saving ? 'Saving answer…' : answers[question.id] ? 'Answer saved' : 'Not answered'}</span>
              <Button variant="secondary" disabled={submitting || current >= attempt.questions.length - 1} onClick={() => setCurrent(value => value + 1)}>Next <ArrowRight size={15} /></Button>
            </div>
          </Card>
          <Card className="exam-navigation-card">
            <div className="section-heading"><h3>Question navigation</h3><span className="muted">{answeredCount}/{attempt.questions.length} answered</span></div>
            <div className="exam-question-navigation">{attempt.questions.map((item, index) => <button type="button" disabled={submitting} key={item.id} className={`exam-number${current === index ? ' exam-number-active' : ''}${answers[item.id]?.trim() ? ' exam-number-answered' : ''}`} aria-label={`Question ${index + 1}${answers[item.id]?.trim() ? ', answered' : ', not answered'}`} onClick={() => setCurrent(index)}>{index + 1}</button>)}</div>
            <Button busy={submitting} onClick={() => window.confirm('Submit your exam now? You cannot change your answers after submission.') && submitExam()}><Send size={15} /> Submit exam</Button>
          </Card>
        </div>}
      {attempt && !submitted && secureReady && <><video ref={element => { if (element && mediaStream.current) element.srcObject = mediaStream.current; }} className="secure-camera-preview" autoPlay muted playsInline aria-label="Secure exam camera preview" /><p className="muted exam-autosave-note">Your answers are autosaved to your account. Keep this page open until your exam is submitted.</p></>}
    </>
  );
}
