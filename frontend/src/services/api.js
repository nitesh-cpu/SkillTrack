import { SESSION_KEY } from '../utils/constants';
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const API_BASE_URL = configuredApiBase.endsWith('/api/v1')
    ? configuredApiBase
    : configuredApiBase.endsWith('/api')
        ? `${configuredApiBase}/v1`
        : `${configuredApiBase}/api/v1`;
export const DATA_VERSION_STORAGE_KEY = 'skilltrack-api-data-version';
function accessToken() {
    try {
        const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        return session?.token;
    }
    catch {
        return undefined;
    }
}
async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
    const token = accessToken();
    if (token)
        headers.set('Authorization', `Bearer ${token}`);
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    }
    catch {
        throw new Error("We couldn't reach SkillTrack. Please check your connection and try again.");
    }
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && token) {
        sessionStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('skilltrack:session-expired'));
    }
    if (!response.ok || !payload?.success) {
        const isServerError = response.status >= 500 || response.status === 404;
        const message = isServerError
            ? "We couldn't complete your request right now. Please try again shortly."
            : payload?.message || "We couldn't complete your request. Please try again.";
        throw new Error(message);
    }
    return payload.data;
}
const send = (method, body) => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const idOf = (value) => {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object' && '_id' in value)
        return String(value._id);
    if (value && typeof value.toHexString === 'function')
        return value.toHexString();
    return '';
};
const roleFromApi = (role) => role.toLowerCase();
const statusFromApi = (status) => ({
    PENDING: 'Pending',
    VERIFIED: 'Verified',
    REJECTED: 'Rejected',
}[status] || 'Pending');
const submissionKindLabels = {
    'Coding Achievement': 'Coding Achievement',
    Project: 'Project',
    'Course/Certification': 'Course/Certification',
    Competition: 'Competition',
    'Other Achievement': 'Other Achievement',
};
const categoryFromApi = (type, data = {}) => data.sourceType === 'EXAM' ? 'Exam result' : submissionKindLabels[data.submissionKind] || ({
    CODING: 'Coding',
    PROJECT: 'Projects',
    ASSESSMENT: 'Assessments',
    COURSE: 'Courses',
    INTERVIEW: 'Interviews',
}[type] || 'Projects');
const typeToApi = {
    Coding: 'CODING',
    Projects: 'PROJECT',
    Assessments: 'ASSESSMENT',
    Courses: 'COURSE',
    Interviews: 'INTERVIEW',
    'Coding Achievement': 'CODING',
    Project: 'PROJECT',
    'Course/Certification': 'COURSE',
    Competition: 'INTERVIEW',
    'Other Achievement': 'ASSESSMENT',
};
function mapUser(raw) {
    return {
        id: idOf(raw.id || raw._id),
        name: String(raw.name || ''),
        email: String(raw.email || ''),
        role: roleFromApi(String(raw.role || 'STUDENT')),
        status: raw.isActive === false ? 'Disabled' : 'Active',
        batch: String(raw.batch || ''),
    };
}
function mapAchievement(raw) {
    const user = raw.userId && typeof raw.userId === 'object' ? raw.userId : {};
    const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
    return {
        id: idOf(raw._id || raw.id),
        studentId: idOf(raw.userId),
        studentName: String(user.name || ''),
        title: String(raw.title || ''),
        category: categoryFromApi(String(raw.type || 'PROJECT'), data),
        details: String(raw.description || ''),
        examResult: data.sourceType === 'EXAM' ? {
            score: Number(data.score || 0),
            totalMarks: Number(data.totalMarks || 0),
            percentage: Number(data.percentage || 0),
            passed: data.passed === true,
        } : null,
        proofUrl: String(data.proofUrl || data.profileUrl || data.githubUrl || data.liveUrl || data.certificateUrl || ''),
        status: statusFromApi(String(raw.status || 'PENDING')),
        feedback: String(raw.mentorFeedback || raw.rejectionReason || ''),
        createdAt: String(raw.submittedAt || raw.createdAt || new Date().toISOString()),
        reviewedAt: raw.reviewedAt || null,
        reviewerName: raw.reviewedBy && typeof raw.reviewedBy === 'object' ? String(raw.reviewedBy.name || '') : '',
        skillMappings: Array.isArray(raw.skillMappings) ? raw.skillMappings.map(mapping => ({
            skill: mapping.skill && typeof mapping.skill === 'object' ? String(mapping.skill.name || 'Skill') : 'Skill',
            relevance: Number(mapping.relevance || 0),
        })) : [],
        scoreImpact: Array.isArray(raw.scoreImpact) ? raw.scoreImpact.map(impact => ({
            skillId: String(impact.skillId || ''),
            skill: String(impact.skill || 'Skill'),
            contribution: Number(impact.contribution || 0),
        })) : [],
        skillImpacts: Array.isArray(raw.skillImpacts) ? raw.skillImpacts.map(impact => ({
            skillId: String(impact.skillId || ''),
            skill: String(impact.skill || 'Skill'),
            relevance: Number(impact.relevance || 0),
            currentScore: impact.currentScore === null || impact.currentScore === undefined ? null : Number(impact.currentScore),
            contribution: impact.contribution === null || impact.contribution === undefined ? null : Number(impact.contribution),
        })) : [],
    };
}
function mapSkill(raw) {
    return {
        id: idOf(raw._id || raw.skillId || raw.id),
        name: String(raw.name || ''),
        category: String(raw.category || 'General'),
        score: Number(raw.score || 0),
        weeklyGrowth: Number(raw.weeklyGrowth || 0),
        activeStudents: Number(raw.activeStudents || 0),
        description: String(raw.description || ''),
        status: raw.status ? String(raw.status) : null,
        prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites.map(item => ({
            id: idOf(item.id || item._id),
            name: String(item.name || 'Skill'),
            score: item.score === null || item.score === undefined ? null : Number(item.score),
            mastered: item.mastered === true,
        })) : [],
        breakdown: Array.isArray(raw.breakdown) ? raw.breakdown : [],
        scoreDetails: raw.scoreDetails || null,
        calculatedAt: raw.calculatedAt || null,
        ruleVersion: raw.ruleVersion ?? null,
        changeReason: raw.changeReason ?? null,
        previousScore: raw.previousScore ?? null,
        scoreChanged: raw.scoreChanged ?? false,
        evidenceCount: raw.evidenceCount ?? 0,
        pendingPrerequisites: Array.isArray(raw.pendingPrerequisites) ? raw.pendingPrerequisites.map(item => ({
            id: idOf(item.id || item._id),
            name: String(item.name || 'Skill'),
            score: item.score === null || item.score === undefined ? null : Number(item.score),
            mastered: item.mastered === true,
        })) : [],
    };
}
function mapLearningCourse(raw) {
    return {
        id: idOf(raw._id || raw.id),
        title: String(raw.title || ''),
        description: String(raw.description || ''),
        skillId: idOf(raw.skillId),
        skillName: raw.skillId && typeof raw.skillId === 'object' ? String(raw.skillId.name || '') : '',
        status: String(raw.status || 'DRAFT'),
        createdBy: idOf(raw.createdBy),
        modules: (raw.modules || []).map((module, moduleIndex) => ({
            id: idOf(module._id || module.id),
            title: String(module.title || ''),
            order: moduleIndex + 1,
            lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
                id: idOf(lesson._id || lesson.id),
                title: String(lesson.title || ''),
                description: String(lesson.description || ''),
                videoUrl: String(lesson.videoUrl || ''),
                durationSeconds: Number(lesson.durationSeconds || 0),
                thumbnailUrl: String(lesson.thumbnailUrl || ''),
                topic: String(lesson.topic || ''),
                skillId: idOf(lesson.skillId),
                order: lessonIndex + 1,
                progress: {
                    watchedSeconds: Number(lesson.progress?.watchedSeconds || 0),
                    lastPosition: Number(lesson.progress?.lastPosition || 0),
                    completed: lesson.progress?.completed === true,
                },
            })),
        })),
    };
}
function mapTask(raw) {
    const student = raw.studentId && typeof raw.studentId === 'object' ? raw.studentId : {};
    const skill = raw.skillId && typeof raw.skillId === 'object' ? raw.skillId : {};
    return {
        id: idOf(raw._id || raw.id),
        title: String(raw.title || ''),
        description: String(raw.description || ''),
        skill: String(skill.name || raw.skill || 'General'),
        studentId: idOf(raw.studentId),
        studentName: String(student.name || raw.studentName || ''),
        priority: (String(raw.priority || 'MEDIUM').toLowerCase().replace(/^./, letter => letter.toUpperCase())),
        deadline: raw.deadline ? String(raw.deadline).slice(0, 10) : 'Not set',
        status: raw.status === 'COMPLETED' || raw.status === 'Completed' ? 'Completed' : 'Pending',
        createdAt: String(raw.createdAt || new Date().toISOString()),
        progress: raw.status === 'COMPLETED' || raw.status === 'Completed' ? 100 : 0,
        feedbackHistory: Array.isArray(raw.feedbackHistory) ? raw.feedbackHistory.map(entry => ({
            feedback: String(entry.feedback || ''),
            createdAt: String(entry.createdAt || raw.createdAt || new Date().toISOString()),
        })) : [],
    };
}
function mapAudit(raw) {
    const actor = raw.actorId && typeof raw.actorId === 'object' ? raw.actorId : {};
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const entity = String(raw.entity || '');
    const descriptor = metadata.name || metadata.role || metadata.version || entity;
    return {
        id: idOf(raw._id || raw.id),
        action: String(raw.action || 'ACTIVITY'),
        details: `${String(raw.action || 'Activity').replace(/_/g, ' ').toLowerCase()}${descriptor ? ` · ${String(descriptor)}` : ''}`,
        actor: String(actor.name || 'System'),
        createdAt: String(raw.createdAt || new Date().toISOString()),
        entity: String(raw.entity || ''),
        entityId: idOf(raw.entityId),
    };
}
function mapStudent(raw) {
    const user = mapUser(raw);
    const mentor = raw.mentor && typeof raw.mentor === 'object' ? raw.mentor : {};
    return {
        ...user,
        role: 'student',
        mentorName: String(mentor.name || 'Not assigned'),
        mentorId: idOf(mentor),
        progress: raw.progress === null || raw.progress === undefined ? null : Number(raw.progress),
        trackedSkills: Number(raw.trackedSkills || 0),
        batch: String(raw.batch || user.batch || ''),
    };
}
function mapMentor(raw) {
    const user = mapUser(raw);
    return { ...user, role: 'mentor', studentCount: Number(raw.studentCount || 0), batch: String(raw.batch || user.batch || '') };
}
function broadcastChange() {
    try {
        localStorage.setItem(DATA_VERSION_STORAGE_KEY, String(Date.now()));
    }
    catch (error) {
        console.warn('Could not notify other open tabs about the saved changes.', error);
    }
}
async function getSkillByName(name) {
    const catalog = await request('/skills');
    const skill = catalog.skills.find(item => String(item.name).toLowerCase() === name.toLowerCase());
    if (!skill)
        throw new Error(`Create the "${name}" skill in the catalog before using it.`);
    return mapSkill(skill);
}
export const api = {
    async login(email, password, role) {
        const data = await request('/auth/login', send('POST', { email, password, role: role.toUpperCase() }));
        return { user: mapUser(data.user), token: data.token };
    },
    async register(name, email, password) {
        const data = await request('/auth/register', send('POST', { name, email, password }));
        return { user: mapUser(data.user), token: data.token };
    },
    async resetPassword(email) {
        await request('/auth/forgot-password', send('POST', { email }));
    },
    async applyPasswordReset(token, password) {
        await request('/auth/reset-password', send('POST', { token, password }));
    },
    async getStudentDashboard(_user) {
        const data = await request('/student/dashboard');
        const achievements = (data.achievements || []).map(item => mapAchievement(item));
        const tasks = (data.tasks || []).map(mapTask);
        const skills = (data.skills || []).map(mapSkill);
        const rawStats = (data.stats || {});
        return {
            achievements,
            tasks,
            skills,
            totals: {
                achievements: rawStats.achievements ?? achievements.length,
                verified: rawStats.verified ?? achievements.filter(item => item.status === 'Verified').length,
                pending: rawStats.pending ?? achievements.filter(item => item.status === 'Pending').length,
                rejected: rawStats.rejected ?? achievements.filter(item => item.status === 'Rejected').length,
                tasks: rawStats.tasks ?? tasks.filter(item => item.status === 'Pending').length,
            },
            recommendations: data.recommendations || [],
        };
    },
    async getStudentProgress() {
        const data = await request('/student/progress');
        return {
            achievements: (data.achievements || []).map(mapAchievement),
            skills: (data.skills || []).map(mapSkill),
            tasks: (data.tasks || []).map(mapTask),
        };
    },
    async getStudentAchievements() {
        const data = await request('/achievements/my');
        return (data.achievements || []).map(mapAchievement);
    },
    async getStudentTasks() {
        const data = await request('/student/tasks');
        return (data.tasks || []).map(mapTask);
    },
    async getStudentExams() {
        const data = await request('/student/exams');
        return (data.exams || []).map(item => ({
            assignmentId: idOf(item.assignmentId),
            status: String(item.status || 'ASSIGNED'),
            category: String(item.category || 'UPCOMING'),
            exam: {
                id: idOf(item.exam?._id || item.exam?.id),
                title: String(item.exam?.title || ''),
                description: String(item.exam?.description || ''),
                durationMinutes: Number(item.exam?.durationMinutes || 0),
                totalMarks: Number(item.exam?.totalMarks || 0),
                passingMarks: Number(item.exam?.passingMarks || 0),
                startAt: String(item.exam?.startAt || ''),
                endAt: String(item.exam?.endAt || ''),
            },
        }));
    },
    async startStudentExam(examId) {
        const data = await request(`/student/exams/${encodeURIComponent(examId)}/start`, send('POST'));
        broadcastChange();
        return data.attempt;
    },
    async getStudentExamAttempt(attemptId) {
        const data = await request(`/student/exam-attempts/${encodeURIComponent(attemptId)}`);
        return data.attempt;
    },
    async saveStudentExamAnswer(attemptId, questionId, answer) {
        const data = await request(`/student/exam-attempts/${encodeURIComponent(attemptId)}/answers`, send('PATCH', { questionId, answer }));
        return data.attempt;
    },
    async recordStudentExamActivity(attemptId, type) {
        const data = await request(`/student/exam-attempts/${encodeURIComponent(attemptId)}/activity`, send('POST', { type }));
        return data.activity;
    },
    async submitStudentExamAttempt(attemptId) {
        const data = await request(`/student/exam-attempts/${encodeURIComponent(attemptId)}/submit`, send('POST'));
        broadcastChange();
        return data.attempt;
    },
    async getExamResults(role, { page = 1, limit = 25 } = {}) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        const path = role === 'student' ? '/student/results' : '/exams/results';
        const data = await request(`${path}?${params}`);
        return {
            results: (data.results || []).map(item => ({
                attemptId: String(item.attemptId || ''),
                student: item.student && typeof item.student === 'object' ? {
                    name: String(item.student.name || ''),
                    email: String(item.student.email || ''),
                } : null,
                exam: item.exam && typeof item.exam === 'object' ? {
                    title: String(item.exam.title || ''),
                    startAt: String(item.exam.startAt || ''),
                    totalMarks: Number(item.exam.totalMarks || 0),
                    passingMarks: Number(item.exam.passingMarks || 0),
                } : { title: 'Exam', startAt: '', totalMarks: 0, passingMarks: 0 },
                submittedAt: String(item.submittedAt || ''),
                result: item.result || {},
                answers: Array.isArray(item.answers) ? item.answers.map(answer => ({
                    questionId: String(answer.questionId || ''),
                    question: String(answer.question || ''),
                    questionType: String(answer.questionType || ''),
                    answer: String(answer.answer || ''),
                })) : [],
                suspiciousActivityCount: Number(item.suspiciousActivityCount || 0),
                activityEvents: Array.isArray(item.activityEvents) ? item.activityEvents.map(event => ({
                    type: String(event.type || ''),
                    occurredAt: String(event.occurredAt || ''),
                })) : [],
            })),
            pagination: data.pagination || { page, limit, total: 0, pages: 0 },
        };
    },
    async getLearningCourses(role) {
        const path = role === 'student' ? '/learning/student/courses' : '/learning/courses';
        const data = await request(path);
        return (data.courses || []).map(mapLearningCourse);
    },
    async getLearningStudents(role) {
        if (role === 'admin') {
            const data = await api.getAdminUsers({ page: 1, limit: 100, role: 'student', isActive: true });
            return data.users;
        }
        const params = new URLSearchParams({ page: '1', limit: '100' });
        const data = await request(`/mentor/students?${params}`);
        return (data.students || []).map(student => ({
            id: idOf(student._id || student.id),
            name: String(student.name || ''),
            email: String(student.email || ''),
        }));
    },
    async createLearningCourse(input) {
        const data = await request('/learning/courses', send('POST', input));
        broadcastChange();
        return mapLearningCourse(data.course);
    },
    async updateLearningCourse(courseId, input) {
        const data = await request(`/learning/courses/${encodeURIComponent(courseId)}`, send('PATCH', input));
        broadcastChange();
        return mapLearningCourse(data.course);
    },
    async addLearningModule(courseId, module) {
        const data = await request(`/learning/courses/${encodeURIComponent(courseId)}/modules`, send('POST', module));
        broadcastChange();
        return mapLearningCourse(data.course);
    },
    async updateLearningLesson(courseId, lessonId, input) {
        const data = await request(`/learning/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`, send('PATCH', input));
        broadcastChange();
        return mapLearningCourse(data.course);
    },
    async assignLearningCourse(courseId, studentIds) {
        const data = await request(`/learning/courses/${encodeURIComponent(courseId)}/assignments`, send('POST', { studentIds }));
        broadcastChange();
        return data;
    },
    async getStudentLearningLesson(lessonId) {
        const data = await request(`/learning/student/lessons/${encodeURIComponent(lessonId)}`);
        const lesson = data.lesson;
        return {
            course: lesson.course,
            module: lesson.module,
            lesson: {
                ...mapLearningCourse({ modules: [{ lessons: [lesson.lesson] }] }).modules[0].lessons[0],
                progress: {
                    watchedSeconds: Number(lesson.progress?.watchedSeconds || 0),
                    lastPosition: Number(lesson.progress?.lastPosition || 0),
                    completed: lesson.progress?.completed === true,
                },
            },
        };
    },
    async saveStudentVideoProgress(lessonId, progress) {
        const data = await request(`/learning/student/lessons/${encodeURIComponent(lessonId)}/progress`, send('PATCH', progress));
        return {
            watchedSeconds: Number(data.progress.watchedSeconds || 0),
            lastPosition: Number(data.progress.lastPosition || 0),
            completed: data.progress.completed === true,
        };
    },
    async getStudentSkillGraph() {
        const data = await request('/student/skill-graph');
        return {
            skills: (data.skills || []).map(mapSkill),
            nodes: data.nodes || [],
            edges: data.edges || [],
            relationships: data.relationships || [],
        };
    },
    async getStudentRecommendations() {
        const data = await request('/student/recommendations');
        return {
            recommendations: data.recommendations || [],
            summary: data.summary || {},
        };
    },
    async getStudentSkillHistory(skillId) {
        const data = await request(`/scores/me/${encodeURIComponent(skillId)}/history`);
        return data.history || [];
    },
    async addAchievement(_user, input) {
        const data = await request('/achievements', send('POST', {
            type: typeToApi[input.category],
            title: input.title,
            description: input.details,
            data: {
                ...(input.proofUrl ? { proofUrl: input.proofUrl } : {}),
                submissionKind: input.category,
            },
            skillMappings: [],
        }));
        broadcastChange();
        return mapAchievement(data.achievement);
    },
    async completeTask(_userId, taskId) {
        await request(`/student/tasks/${encodeURIComponent(taskId)}/complete`, send('PATCH'));
        broadcastChange();
    },
    async getMentorDashboard() {
        const [data, catalog] = await Promise.all([
            request('/mentor/dashboard'),
            request('/skills'),
        ]);
        const students = (data.students || []).map(raw => ({
            ...mapStudent(raw),
            progress: raw.progress === null || raw.progress === undefined ? null : Number(raw.progress),
        }));
        return {
            stats: data.stats || {},
            students,
            pending: (data.pending || []).map(mapAchievement),
            history: (data.history || []).map(mapAchievement),
            tasks: (data.tasks || []).map(mapTask),
            skills: catalog.skills.map(mapSkill),
        };
    },
    async getMentorStudentDetail(studentId) {
        const data = await request(`/mentor/students/${encodeURIComponent(studentId)}`);
        return {
            student: mapStudent(data.student),
            achievements: (data.achievements || []).map(mapAchievement),
            tasks: (data.tasks || []).map(mapTask),
            skills: (data.skills || []).map(mapSkill),
            scoreHistory: (data.scoreHistory || []).map(item => ({
                skillId: idOf(item.skillId),
                skillName: String(item.skillName || ''),
                score: Number(item.score || 0),
                calculatedAt: String(item.calculatedAt || ''),
            })),
        };
    },
    async getMentorReviews() {
        const data = await request('/mentor/reviews');
        return (data.achievements || []).map(mapAchievement);
    },
    async getMentorReviewHistory() {
        const data = await request('/mentor/reviews/history');
        return (data.achievements || []).map(mapAchievement);
    },
    async getMentorReview(achievementId) {
        const data = await request(`/mentor/reviews/${encodeURIComponent(achievementId)}`);
        return mapAchievement(data.achievement);
    },
    async getMentorTasks() {
        const data = await request('/mentor/tasks');
        return (data.tasks || []).map(mapTask);
    },
    async reviewAchievement(id, status, feedback, rejectionReason = feedback, _actor) {
        const rejecting = status === 'Rejected';
        await request(`/mentor/reviews/${encodeURIComponent(id)}/${rejecting ? 'reject' : 'verify'}`, send('PATCH', rejecting
            ? { rejectionReason, feedback }
            : { feedback }));
        broadcastChange();
    },
    async assignTask(input) {
        const skill = await getSkillByName(input.skill);
        await request('/mentor/tasks', send('POST', {
            studentId: input.studentId,
            title: input.title,
            description: input.description,
            skillId: skill.id,
            priority: input.priority.toUpperCase(),
            ...(input.deadline && input.deadline !== 'Not set' ? { deadline: input.deadline } : {}),
        }));
        broadcastChange();
    },
    async getMentorTask(taskId) {
        const data = await request(`/mentor/tasks/${encodeURIComponent(taskId)}`);
        return mapTask(data.task);
    },
    async updateMentorTask(taskId, input) {
        const skill = input.skill ? await getSkillByName(input.skill) : undefined;
        await request(`/mentor/tasks/${encodeURIComponent(taskId)}`, send('PATCH', {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(skill ? { skillId: skill.id } : {}),
            ...(input.priority ? { priority: input.priority.toUpperCase() } : {}),
            ...(input.deadline !== undefined ? { deadline: input.deadline || null } : {}),
        }));
        broadcastChange();
    },
    async cancelMentorTask(taskId) {
        await request(`/mentor/tasks/${encodeURIComponent(taskId)}`, send('DELETE'));
        broadcastChange();
    },
    async addTaskFeedback(taskId, feedback) {
        await request(`/mentor/tasks/${encodeURIComponent(taskId)}/feedback`, send('POST', { feedback }));
        broadcastChange();
    },
    async getAdminOverview() {
        const data = await request('/admin/dashboard');
        return {
            stats: data.stats || {},
            audit: (data.audit || []).map(mapAudit),
            activeRule: String(data.activeRule || 'No active rule'),
        };
    },
    async getAdminDirectory() {
        const data = await request('/admin/overview');
        return {
            students: (data.students || []).map(mapStudent),
            mentors: (data.mentors || []).map(mapMentor),
        };
    },
    async getAdminRelationshipData() {
        const [skillData, relationshipData] = await Promise.all([
            request('/admin/skills'),
            request('/admin/skill-relationships'),
        ]);
        const skills = (skillData.skills || []).filter(item => item.isActive !== false).map(mapSkill);
        const relationships = (relationshipData.relationships || []).map(item => {
            const prerequisite = item.prerequisiteSkillId && typeof item.prerequisiteSkillId === 'object' ? item.prerequisiteSkillId : {};
            const target = item.skillId && typeof item.skillId === 'object' ? item.skillId : {};
            return { id: idOf(item._id), prerequisite: String(prerequisite.name || ''), target: String(target.name || ''), type: 'Prerequisite' };
        });
        return { skills, relationships };
    },
    async getAdminScoringRules() {
        const data = await request('/admin/scoring-rules');
        return {
            rawRules: data.rules || [],
            activeRule: data.activeRule ? `v${data.activeRule.version}` : 'No active rule',
        };
    },
    async getQuestionBank({ page = 1, limit = 25, search = '', topic = '', skillId = '', status = '', questionType = '', difficulty = '' } = {}) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search.trim())
            params.set('search', search.trim());
        if (topic.trim())
            params.set('topic', topic.trim());
        if (skillId)
            params.set('skillId', skillId);
        if (status)
            params.set('status', status);
        if (questionType)
            params.set('questionType', questionType);
        if (difficulty)
            params.set('difficulty', difficulty);
        const data = await request(`/questions?${params}`);
        return {
            questions: (data.questions || []).map(raw => ({
                id: idOf(raw._id || raw.id),
                question: String(raw.question || ''),
                questionType: String(raw.questionType || ''),
                options: Array.isArray(raw.options) ? raw.options.map(String) : [],
                correctAnswer: String(raw.correctAnswer || ''),
                explanation: String(raw.explanation || ''),
                topic: String(raw.topic || ''),
                skillId: idOf(raw.skillId),
                skill: raw.skillId && typeof raw.skillId === 'object' ? String(raw.skillId.name || '') : '',
                difficulty: String(raw.difficulty || ''),
                marks: Number(raw.marks || 0),
                status: String(raw.status || 'DRAFT'),
                createdBy: raw.createdBy && typeof raw.createdBy === 'object' ? String(raw.createdBy.name || '') : '',
                createdById: idOf(raw.createdBy),
                createdAt: String(raw.createdAt || ''),
                updatedAt: String(raw.updatedAt || ''),
            })),
            pagination: data.pagination || { page, limit, total: 0, pages: 0 },
        };
    },
    async getQuestionBankSkills() {
        const data = await request('/skills');
        return (data.skills || []).map(mapSkill);
    },
    async createQuestion(input) {
        await request('/questions', send('POST', input));
        broadcastChange();
    },
    async updateQuestion(id, input) {
        await request(`/questions/${encodeURIComponent(id)}`, send('PATCH', input));
        broadcastChange();
    },
    async approveQuestion(id) {
        await request(`/questions/${encodeURIComponent(id)}/approve`, send('PATCH'));
        broadcastChange();
    },
    async archiveQuestion(id) {
        await request(`/questions/${encodeURIComponent(id)}/archive`, send('PATCH'));
        broadcastChange();
    },
    async getExams({ page = 1, limit = 25, search = '', status = '' } = {}) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search.trim())
            params.set('search', search.trim());
        if (status)
            params.set('status', status);
        const data = await request(`/exams?${params}`);
        return {
            exams: (data.exams || []).map(raw => ({
                id: idOf(raw._id || raw.id),
                title: String(raw.title || ''),
                description: String(raw.description || ''),
                durationMinutes: Number(raw.durationMinutes || 0),
                totalMarks: Number(raw.totalMarks || 0),
                passingMarks: Number(raw.passingMarks || 0),
                startAt: String(raw.startAt || ''),
                endAt: String(raw.endAt || ''),
                difficulty: String(raw.difficulty || ''),
                status: String(raw.status || 'PUBLISHED'),
                selectionMode: String(raw.selectionMode || ''),
                security: {
                    requireFullscreen: raw.security?.requireFullscreen !== false,
                    requireCamera: raw.security?.requireCamera !== false,
                    requireMicrophone: raw.security?.requireMicrophone !== false,
                    maxViolations: Number(raw.security?.maxViolations || 1),
                    violationAction: String(raw.security?.violationAction || 'AUTO_SUBMIT'),
                },
                questionCount: Array.isArray(raw.questions) ? raw.questions.length : 0,
                createdBy: raw.createdBy && typeof raw.createdBy === 'object' ? String(raw.createdBy.name || '') : '',
                assignedStudents: Array.isArray(raw.assignedStudents) ? raw.assignedStudents.map(student => ({
                    id: idOf(student),
                    name: String(student.name || ''),
                    email: String(student.email || ''),
                })) : [],
            })),
            pagination: data.pagination || { page, limit, total: 0, pages: 0 },
        };
    },
    async createExam(input) {
        const data = await request('/exams', send('POST', input));
        broadcastChange();
        return data.exam;
    },
    async assignExam(examId, studentIds) {
        const data = await request(`/exams/${encodeURIComponent(examId)}/assignments`, send('POST', { studentIds }));
        broadcastChange();
        return data;
    },
    async revokeExamAssignment(examId, studentId) {
        await request(`/exams/${encodeURIComponent(examId)}/assignments/${encodeURIComponent(studentId)}`, send('DELETE'));
        broadcastChange();
    },
    async archiveExam(examId) {
        await request(`/exams/${encodeURIComponent(examId)}/archive`, send('PATCH'));
        broadcastChange();
    },
    async deleteExam(examId) {
        await request(`/exams/${encodeURIComponent(examId)}`, send('DELETE'));
        broadcastChange();
    },
    async getAdminUsers({ page = 1, limit = 25, search = '', role = '', isActive = '' } = {}) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search.trim())
            params.set('search', search.trim());
        if (role)
            params.set('role', role.toUpperCase());
        if (isActive !== '')
            params.set('isActive', String(isActive === true || isActive === 'true'));
        const data = await request(`/admin/users?${params}`);
        return {
            users: (data.users || []).map(mapUser),
            pagination: data.pagination,
        };
    },
    async getAdminSkills() {
        const data = await request('/admin/skills');
        return (data.skills || []).map(skill => ({ ...mapSkill(skill), isActive: skill.isActive !== false }));
    },
    async getAdminAuditLogs({ page = 1, limit = 25, search = '', action = '' } = {}) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search.trim())
            params.set('search', search.trim());
        if (action)
            params.set('action', action);
        const data = await request(`/admin/audit-logs?${params}`);
        return { ...data, logs: (data.logs || []).map(mapAudit) };
    },
    async updateAdminUser(userId, input) {
        await request(`/admin/users/${encodeURIComponent(userId)}`, send('PATCH', {
            ...input,
            ...(input.role ? { role: input.role.toUpperCase() } : {}),
        }));
        broadcastChange();
    },
    async assignMentor(mentorId, studentId) {
        await request('/admin/mentor-students', send('POST', { mentorId, studentId }));
        broadcastChange();
    },
    async unassignMentor(studentId) {
        await request(`/admin/mentor-students/${encodeURIComponent(studentId)}`, send('DELETE'));
        broadcastChange();
    },
    async addUser(input) {
        await request('/admin/users', send('POST', { ...input, role: input.role.toUpperCase() }));
        broadcastChange();
    },
    async addSkill(input) {
        await request('/admin/skills', send('POST', input));
        broadcastChange();
    },
    async updateSkill(id, input) {
        await request(`/admin/skills/${encodeURIComponent(id)}`, send('PATCH', input));
        broadcastChange();
    },
    async deleteSkill(id) {
        await request(`/admin/skills/${encodeURIComponent(id)}`, send('DELETE'));
        broadcastChange();
    },
    async addRelationship(input) {
        const [skill, prerequisite] = await Promise.all([getSkillByName(input.target), getSkillByName(input.prerequisite)]);
        await request('/admin/skill-relationships', send('POST', { skillId: skill.id, prerequisiteSkillId: prerequisite.id }));
        broadcastChange();
    },
    async deleteRelationship(id) {
        await request(`/admin/skill-relationships/${encodeURIComponent(id)}`, send('DELETE'));
        broadcastChange();
    },
    async activateRule(version) {
        const rules = await api.getAdminScoringRules();
        const rule = rules.rawRules.find(item => `v${item.version}` === version);
        if (!rule?._id)
            throw new Error(`Scoring rule ${version} is no longer available.`);
        await request(`/admin/scoring-rules/${encodeURIComponent(String(rule._id))}/activate`, send('PATCH'));
        broadcastChange();
    },
    async createRule() {
        const data = await request('/admin/scoring-rules', send('POST', {}));
        broadcastChange();
        return `v${data.rule.version}`;
    },
    async updateRule(version, factors) {
        const rules = await api.getAdminScoringRules();
        const rule = rules.rawRules.find(item => `v${item.version}` === version);
        if (!rule?._id)
            throw new Error(`Scoring rule ${version} is no longer available.`);
        await request(`/admin/scoring-rules/${encodeURIComponent(String(rule._id))}`, send('PATCH', factors));
        broadcastChange();
    },
};
