import { useState } from 'react';
import { Archive, BookOpen, Check, Plus, Video } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, Notice, PageHeader, QueryState } from '../components/Workspace';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

const newLesson = () => ({ title: '', description: '', videoUrl: '', durationSeconds: '', thumbnailUrl: '', topic: '', skillId: '' });
const newModule = () => ({ title: '', lessons: [newLesson()] });
const newCourse = () => ({ title: '', description: '', skillId: '', status: 'DRAFT', modules: [newModule()] });

function durationLabel(seconds) {
  const minutes = Math.ceil(Number(seconds || 0) / 60);
  return `${minutes} min`;
}

export default function LearningManagementPage() {
  const { user } = useAuth();
  const coursesQuery = useApi(() => api.getLearningCourses(user?.role), [user?.role]);
  const skillsQuery = useApi(() => api.getQuestionBankSkills(), [user?.role]);
  const studentsQuery = useApi(() => api.getLearningStudents(user?.role), [user?.role]);
  const [form, setForm] = useState(newCourse);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [moduleDraft, setModuleDraft] = useState(newModule);
  const [editingLesson, setEditingLesson] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyCourse, setBusyCourse] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function updateLesson(moduleIndex, lessonIndex, key, value) {
    setForm(previous => ({
      ...previous,
      modules: previous.modules.map((module, currentModule) => currentModule !== moduleIndex ? module : ({
        ...module,
        lessons: module.lessons.map((lesson, currentLesson) => currentLesson === lessonIndex ? { ...lesson, [key]: value } : lesson),
      })),
    }));
  }

  function updateModule(moduleIndex, value) {
    setForm(previous => ({
      ...previous,
      modules: previous.modules.map((module, index) => index === moduleIndex ? { ...module, title: value } : module),
    }));
  }

  async function createCourse(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.createLearningCourse({
        ...form,
        modules: form.modules.map(module => ({
          title: module.title.trim(),
          lessons: module.lessons.map(lesson => ({ ...lesson, durationSeconds: Number(lesson.durationSeconds) })),
        })),
      });
      setForm(newCourse());
      setNotice('Course and lessons created. Publish it and assign it to students when ready.');
      coursesQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create this course.');
    } finally {
      setBusy(false);
    }
  }

  async function changeCourseStatus(course, status) {
    if (status === 'ARCHIVED' && !window.confirm(`Archive "${course.title}"? Students will no longer be able to open its lessons.`)) return;
    setError('');
    setNotice('');
    setBusyCourse(course.id);
    try {
      await api.updateLearningCourse(course.id, { status });
      setNotice(`Course ${status.toLowerCase()}.`);
      coursesQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this course.');
    } finally {
      setBusyCourse('');
    }
  }

  async function saveLesson() {
    if (!editingLesson) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { courseId, lessonId, lesson } = editingLesson;
      await api.updateLearningLesson(courseId, lessonId, {
        ...lesson,
        durationSeconds: Number(lesson.durationSeconds),
      });
      setEditingLesson(null);
      setNotice('Video lesson updated.');
      coursesQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this video lesson.');
    } finally {
      setBusy(false);
    }
  }

  async function addModule(courseId) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.addLearningModule(courseId, {
        ...moduleDraft,
        lessons: moduleDraft.lessons.map(lesson => ({ ...lesson, durationSeconds: Number(lesson.durationSeconds) })),
      });
      setSelectedCourse('');
      setModuleDraft(newModule());
      setNotice('Module and lessons added.');
      coursesQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add this module.');
    } finally {
      setBusy(false);
    }
  }

  async function assignCourse(courseId) {
    setError('');
    setNotice('');
    if (!selectedStudents.length) {
      setError('Choose at least one assigned student.');
      return;
    }
    setBusyCourse(courseId);
    try {
      const result = await api.assignLearningCourse(courseId, selectedStudents);
      setSelectedCourse('');
      setSelectedStudents([]);
      setNotice(`Course assigned to ${result.newlyAssigned} student${result.newlyAssigned === 1 ? '' : 's'}.`);
      coursesQuery.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not assign this course.');
    } finally {
      setBusyCourse('');
    }
  }

  const skills = skillsQuery.data || [];
  const students = studentsQuery.data || [];

  return (
    <>
      <PageHeader eyebrow="LEARNING CONTENT" title="Video courses" description="Build short, skill-aligned video courses and assign them to students." />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {skillsQuery.error && <Notice kind="error">{skillsQuery.error}</Notice>}
      {studentsQuery.error && <Notice kind="error">{studentsQuery.error}</Notice>}
      <Card className="form-card learning-editor">
        <div className="section-heading"><div><p className="eyebrow">COURSE AUTHORING</p><h2>Create a course</h2></div><BookOpen size={20} /></div>
        <form className="stacked-form" onSubmit={createCourse}>
          <div className="form-grid">
            <label>Course title<input required minLength={2} maxLength={150} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
            <label>Course skill<select required value={form.skillId} onChange={event => setForm({ ...form, skillId: event.target.value })}><option value="">Select a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
          </div>
          <label>Description<textarea maxLength={3000} rows={2} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label>Course status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
          {form.modules.map((module, moduleIndex) => <section className="learning-module-editor" key={moduleIndex}>
            <div className="section-heading"><h3>Module {moduleIndex + 1}</h3>{form.modules.length > 1 && <Button type="button" variant="secondary" onClick={() => setForm(previous => ({ ...previous, modules: previous.modules.filter((_, index) => index !== moduleIndex) }))}>Remove module</Button>}</div>
            <label>Module title<input required minLength={2} maxLength={150} value={module.title} onChange={event => updateModule(moduleIndex, event.target.value)} /></label>
            {module.lessons.map((lesson, lessonIndex) => <div className="learning-lesson-editor" key={lessonIndex}>
              <div className="section-heading"><strong>Lesson {lessonIndex + 1}</strong>{module.lessons.length > 1 && <Button type="button" variant="secondary" onClick={() => setForm(previous => ({ ...previous, modules: previous.modules.map((item, index) => index === moduleIndex ? { ...item, lessons: item.lessons.filter((_, current) => current !== lessonIndex) } : item) }))}>Remove lesson</Button>}</div>
              <div className="form-grid">
                <label>Lesson title<input required minLength={2} maxLength={150} value={lesson.title} onChange={event => updateLesson(moduleIndex, lessonIndex, 'title', event.target.value)} /></label>
                <label>Topic<input required maxLength={120} value={lesson.topic} onChange={event => updateLesson(moduleIndex, lessonIndex, 'topic', event.target.value)} /></label>
                <label>Skill<select required value={lesson.skillId} onChange={event => updateLesson(moduleIndex, lessonIndex, 'skillId', event.target.value)}><option value="">Select a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
                <label>Duration (seconds)<input required type="number" min="1" max="86400" value={lesson.durationSeconds} onChange={event => updateLesson(moduleIndex, lessonIndex, 'durationSeconds', event.target.value)} /></label>
                <label className="form-field-wide">Video URL (HTTPS MP4, WebM or OGG)<input required type="url" placeholder="https://media.example.com/lesson.mp4" value={lesson.videoUrl} onChange={event => updateLesson(moduleIndex, lessonIndex, 'videoUrl', event.target.value)} /></label>
                <label className="form-field-wide">Thumbnail URL (optional)<input type="url" placeholder="https://media.example.com/thumbnail.jpg" value={lesson.thumbnailUrl} onChange={event => updateLesson(moduleIndex, lessonIndex, 'thumbnailUrl', event.target.value)} /></label>
              </div>
              <label>Lesson description<textarea maxLength={2000} rows={2} value={lesson.description} onChange={event => updateLesson(moduleIndex, lessonIndex, 'description', event.target.value)} /></label>
            </div>)}
            <Button type="button" variant="secondary" onClick={() => setForm(previous => ({ ...previous, modules: previous.modules.map((item, index) => index === moduleIndex ? { ...item, lessons: [...item.lessons, newLesson()] } : item) }))}><Plus size={14} /> Add lesson</Button>
          </section>)}
          <div className="list-toolbar">
            <Button type="button" variant="secondary" onClick={() => setForm(previous => ({ ...previous, modules: [...previous.modules, newModule()] }))}><Plus size={14} /> Add module</Button>
            <Button type="submit" busy={busy} disabled={skills.length === 0}>Create course</Button>
          </div>
        </form>
      </Card>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">COURSE LIBRARY</p><h2>Manage courses</h2></div></div>
        <QueryState loading={coursesQuery.loading} error={coursesQuery.error} onRetry={coursesQuery.reload} />
        {coursesQuery.data && coursesQuery.data.length === 0 && <EmptyState title="No courses yet" detail="Create a course with at least one module and lesson to begin." />}
        {coursesQuery.data?.map(course => <Card className="learning-course-card" key={course.id}>
          <div className="section-heading"><div><span className={`status-pill ${course.status === 'PUBLISHED' ? 'status-verified' : 'status-pending'}`}>{course.status}</span><h3>{course.title}</h3><p className="muted">{course.description || 'No course description'}{course.skillName ? ` · ${course.skillName}` : ''}</p></div>
            <div className="button-row">
              <Button variant="secondary" busy={busyCourse === course.id} onClick={() => changeCourseStatus(course, course.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED')}>{course.status === 'PUBLISHED' ? <><Archive size={14} /> Archive</> : <><Check size={14} /> Publish</>}</Button>
              <Button variant="secondary" onClick={() => { setError(''); setSelectedCourse(course.id); setSelectedStudents([]); setModuleDraft(newModule()); }}>Add module</Button>
              {course.status === 'PUBLISHED' && <Button onClick={() => { setError(''); setSelectedCourse(course.id); setSelectedStudents([]); }}>Assign course</Button>}
            </div>
          </div>
          <div className="learning-module-list">{course.modules.map(module => <div key={module.id}><strong>{module.title}</strong>
            {module.lessons.map(lesson => <div className="learning-managed-lesson" key={lesson.id}><span>{lesson.title} · {durationLabel(lesson.durationSeconds)}</span><Button type="button" variant="secondary" onClick={() => { setError(''); setSelectedCourse(''); setEditingLesson({ courseId: course.id, lessonId: lesson.id, lesson: { ...lesson } }); }}>Edit video</Button></div>)}
          </div>)}</div>
          {editingLesson?.courseId === course.id && <div className="learning-assignment-panel">
            <div className="section-heading"><h4>Edit video lesson</h4><Button type="button" variant="secondary" onClick={() => setEditingLesson(null)}>Close</Button></div>
            <div className="form-grid">
              <label>Lesson title<input required minLength={2} maxLength={150} value={editingLesson.lesson.title} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, title: event.target.value } }))} /></label>
              <label>Topic<input required maxLength={120} value={editingLesson.lesson.topic} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, topic: event.target.value } }))} /></label>
              <label>Skill<select required value={editingLesson.lesson.skillId} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, skillId: event.target.value } }))}><option value="">Select a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
              <label>Duration (seconds)<input required type="number" min="1" max="86400" value={editingLesson.lesson.durationSeconds} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, durationSeconds: event.target.value } }))} /></label>
              <label className="form-field-wide">Video URL<input required type="url" value={editingLesson.lesson.videoUrl} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, videoUrl: event.target.value } }))} /></label>
              <label className="form-field-wide">Thumbnail URL<input type="url" value={editingLesson.lesson.thumbnailUrl} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, thumbnailUrl: event.target.value } }))} /></label>
            </div>
            <label>Lesson description<textarea maxLength={2000} rows={2} value={editingLesson.lesson.description} onChange={event => setEditingLesson(previous => ({ ...previous, lesson: { ...previous.lesson, description: event.target.value } }))} /></label>
            <Button busy={busy} onClick={saveLesson}>Save lesson</Button>
          </div>}
          {selectedCourse === course.id && <div className="learning-assignment-panel">
            <div className="section-heading"><h4>{course.status === 'PUBLISHED' ? 'Assign students or add a module' : 'Add a module'}</h4><Button type="button" variant="secondary" onClick={() => setSelectedCourse('')}>Close</Button></div>
            {course.status === 'PUBLISHED' && <fieldset className="learning-student-picker"><legend>Select assigned students</legend>{studentsQuery.loading ? <p className="muted">Loading assigned students…</p> : students.length ? students.map(student => <label key={student.id}><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={event => setSelectedStudents(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))} /> {student.name} <span className="muted">{student.email}</span></label>) : <p className="muted">No eligible students are available.</p>}</fieldset>}
            {course.status === 'PUBLISHED' && <Button disabled={!selectedStudents.length || studentsQuery.loading} busy={busyCourse === course.id} onClick={() => assignCourse(course.id, selectedStudents)}>Assign course</Button>}
            <div className="learning-module-editor">
              <h4>New module</h4>
              <label>Module title<input required minLength={2} maxLength={150} value={moduleDraft.title} onChange={event => setModuleDraft({ ...moduleDraft, title: event.target.value })} /></label>
              {moduleDraft.lessons.map((lesson, index) => <div className="learning-lesson-editor" key={index}>
                <strong>Lesson {index + 1}</strong>
                <div className="form-grid">
                  <label>Title<input required minLength={2} maxLength={150} value={lesson.title} onChange={event => setModuleDraft(previous => ({ ...previous, lessons: previous.lessons.map((item, current) => current === index ? { ...item, title: event.target.value } : item) }))} /></label>
                  <label>Topic<input required maxLength={120} value={lesson.topic} onChange={event => setModuleDraft(previous => ({ ...previous, lessons: previous.lessons.map((item, current) => current === index ? { ...item, topic: event.target.value } : item) }))} /></label>
                  <label>Skill<select required value={lesson.skillId} onChange={event => setModuleDraft(previous => ({ ...previous, lessons: previous.lessons.map((item, current) => current === index ? { ...item, skillId: event.target.value } : item) }))}><option value="">Select a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
                  <label>Duration (seconds)<input required type="number" min="1" max="86400" value={lesson.durationSeconds} onChange={event => setModuleDraft(previous => ({ ...previous, lessons: previous.lessons.map((item, current) => current === index ? { ...item, durationSeconds: event.target.value } : item) }))} /></label>
                  <label className="form-field-wide">Video URL<input required type="url" value={lesson.videoUrl} onChange={event => setModuleDraft(previous => ({ ...previous, lessons: previous.lessons.map((item, current) => current === index ? { ...item, videoUrl: event.target.value } : item) }))} /></label>
                </div>
              </div>)}
              <div className="button-row"><Button type="button" variant="secondary" onClick={() => setModuleDraft(previous => ({ ...previous, lessons: [...previous.lessons, newLesson()] }))}><Plus size={14} /> Add lesson</Button><Button busy={busy} onClick={() => addModule(course.id)}>Save module</Button></div>
            </div>
          </div>}
        </Card>)}
      </section>
      <div className="learning-format-note"><Video size={15} /> Video playback uses direct HTTPS MP4, WebM, or OGG links; uploads and third-party video hosting are not configured.</div>
    </>
  );
}
