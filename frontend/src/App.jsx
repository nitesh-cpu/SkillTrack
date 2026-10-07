import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loading } from './components/Loading';
import { useAuth } from './hooks/useAuth';
import { AdminLayout } from './layouts/AdminLayout';
import { MentorLayout } from './layouts/MentorLayout';
import { StudentLayout } from './layouts/StudentLayout';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import AdminDashboardPage from './pages/admin/DashboardPage';
import MentorsPage from './pages/admin/MentorsPage';
import RelationshipsPage from './pages/admin/SkillRelationshipsPage';
import ScoringRulesPage from './pages/admin/ScoringRulesPage';
import AdminSkillsPage from './pages/admin/SkillsPage';
import AdminStudentsPage from './pages/admin/StudentsPage';
import UsersPage from './pages/admin/UsersPage';
import QuestionBankPage from './pages/QuestionBankPage';
import ExamManagementPage from './pages/ExamManagementPage';
import ResultsPage from './pages/ResultsPage';
import LearningManagementPage from './pages/LearningManagementPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import MentorDashboardPage from './pages/mentor/DashboardPage';
import ReviewsPage from './pages/mentor/ReviewsPage';
import ReviewDetailPage from './pages/mentor/ReviewDetailPage';
import StudentDetailPage from './pages/mentor/StudentDetailPage';
import MentorStudentsPage from './pages/mentor/StudentsPage';
import TasksPage from './pages/mentor/TasksPage';
import AchievementsPage from './pages/student/AchievementsPage';
import AddAchievementPage from './pages/student/AddAchievementPage';
import StudentDashboardPage from './pages/student/DashboardPage';
import StudentTasksPage from './pages/student/TasksPage';
import StudentExamsPage from './pages/student/ExamsPage';
import StudentExamAttemptPage from './pages/student/ExamAttemptPage';
import StudentCoursesPage from './pages/student/CoursesPage';
import StudentVideoLessonPage from './pages/student/VideoLessonPage';
import ProgressPage from './pages/student/ProgressPage';
import RecommendationsPage from './pages/student/RecommendationsPage';
import SkillDetailPage from './pages/student/SkillDetailPage';
import SkillsPage from './pages/student/SkillsPage';
import { ROLE_HOME } from './utils/constants';
function Authenticated({ roles }) {
    const { user, isLoading } = useAuth();
    const location = useLocation();
    if (isLoading)
        return _jsx(Loading, { label: "Restoring your session\u2026" });
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location.pathname } });
    if (!ROLE_HOME[user.role])
        return _jsx(Navigate, { to: "/login", replace: true });
    if (roles && !roles.includes(user.role))
        return _jsx(Navigate, { to: ROLE_HOME[user.role], replace: true });
    return _jsx(Outlet, {});
}
function HomeRedirect() {
    const { user, isLoading } = useAuth();
    if (isLoading)
        return _jsx(Loading, { label: "Opening SkillTrack\u2026" });
    return _jsx(Navigate, { to: user && ROLE_HOME[user.role] ? ROLE_HOME[user.role] : '/login', replace: true });
}
function PublicOnly() {
    const { user, isLoading } = useAuth();
    if (isLoading)
        return _jsx(Loading, { label: "Restoring your session\u2026" });
    if (!user)
        return _jsx(Outlet, {});
    return ROLE_HOME[user.role]
        ? _jsx(Navigate, { to: ROLE_HOME[user.role], replace: true })
        : _jsx(Navigate, { to: "/login", replace: true });
}
function NotFoundPage() {
    return _jsxs("main", { className: "not-found", children: [_jsx("p", { className: "eyebrow", children: "PAGE NOT FOUND" }), _jsx("h1", { children: "That page wandered off." }), _jsx("p", { className: "muted", children: "The link might be old, or this page may not exist in your workspace." }), _jsx(Link, { className: "button button-primary", to: "/", children: "Return to SkillTrack" })] });
}
export default function App() {
    return _jsxs(Routes, { children: [
        _jsx(Route, { path: "/", element: _jsx(HomeRedirect, {}) }),
        _jsxs(Route, { element: _jsx(PublicOnly, {}), children: [
            _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }),
            _jsx(Route, { path: "/register", element: _jsx(RegisterPage, {}) }),
            _jsx(Route, { path: "/forgot-password", element: _jsx(ForgotPasswordPage, {}) }),
            _jsx(Route, { path: "/reset-password", element: _jsx(ResetPasswordPage, {}) }),
        ] }),
        _jsx(Route, { element: _jsx(Authenticated, { roles: ['student'] }), children: _jsxs(Route, { path: "/student", element: _jsx(StudentLayout, {}), children: [
            _jsx(Route, { index: true, element: _jsx(StudentDashboardPage, {}) }),
            _jsx(Route, { path: "skills", element: _jsx(SkillsPage, {}) }),
            _jsx(Route, { path: "skills/:skillId", element: _jsx(SkillDetailPage, {}) }),
            _jsx(Route, { path: "achievements", element: _jsx(AchievementsPage, {}) }),
            _jsx(Route, { path: "achievements/new", element: _jsx(AddAchievementPage, {}) }),
            _jsx(Route, { path: "tasks", element: _jsx(StudentTasksPage, {}) }),
            _jsx(Route, { path: "exams", element: _jsx(StudentExamsPage, {}) }),
            _jsx(Route, { path: "exam-attempts/:attemptId", element: _jsx(StudentExamAttemptPage, {}) }),
            _jsx(Route, { path: "results", element: _jsx(ResultsPage, {}) }),
            _jsx(Route, { path: "learning", element: _jsx(StudentCoursesPage, {}) }),
            _jsx(Route, { path: "learning/lessons/:lessonId", element: _jsx(StudentVideoLessonPage, {}) }),
            _jsx(Route, { path: "progress", element: _jsx(ProgressPage, {}) }),
            _jsx(Route, { path: "recommendations", element: _jsx(RecommendationsPage, {}) }),
        ] }) }),
        _jsx(Route, { element: _jsx(Authenticated, { roles: ['mentor'] }), children: _jsxs(Route, { path: "/mentor", element: _jsx(MentorLayout, {}), children: [
            _jsx(Route, { index: true, element: _jsx(MentorDashboardPage, {}) }),
            _jsx(Route, { path: "students", element: _jsx(MentorStudentsPage, {}) }),
            _jsx(Route, { path: "students/:studentId", element: _jsx(StudentDetailPage, {}) }),
            _jsx(Route, { path: "reviews", element: _jsx(ReviewsPage, {}) }),
            _jsx(Route, { path: "reviews/:achievementId", element: _jsx(ReviewDetailPage, {}) }),
            _jsx(Route, { path: "tasks", element: _jsx(TasksPage, {}) }),
            _jsx(Route, { path: "questions", element: _jsx(QuestionBankPage, {}) }),
            _jsx(Route, { path: "exams", element: _jsx(ExamManagementPage, {}) }),
            _jsx(Route, { path: "results", element: _jsx(ResultsPage, {}) }),
            _jsx(Route, { path: "learning", element: _jsx(LearningManagementPage, {}) }),
        ] }) }),
        _jsx(Route, { element: _jsx(Authenticated, { roles: ['admin'] }), children: _jsxs(Route, { path: "/admin", element: _jsx(AdminLayout, {}), children: [
            _jsx(Route, { index: true, element: _jsx(AdminDashboardPage, {}) }),
            _jsx(Route, { path: "users", element: _jsx(UsersPage, {}) }),
            _jsx(Route, { path: "students", element: _jsx(AdminStudentsPage, {}) }),
            _jsx(Route, { path: "mentors", element: _jsx(MentorsPage, {}) }),
            _jsx(Route, { path: "skills", element: _jsx(AdminSkillsPage, {}) }),
            _jsx(Route, { path: "relationships", element: _jsx(RelationshipsPage, {}) }),
            _jsx(Route, { path: "scoring", element: _jsx(ScoringRulesPage, {}) }),
            _jsx(Route, { path: "audit", element: _jsx(AuditLogsPage, {}) }),
            _jsx(Route, { path: "questions", element: _jsx(QuestionBankPage, {}) }),
            _jsx(Route, { path: "exams", element: _jsx(ExamManagementPage, {}) }),
            _jsx(Route, { path: "results", element: _jsx(ResultsPage, {}) }),
            _jsx(Route, { path: "learning", element: _jsx(LearningManagementPage, {}) }),
        ] }) }),
        _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) }),
    ] });
}
