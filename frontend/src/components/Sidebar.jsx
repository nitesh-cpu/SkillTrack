import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Activity, Award, BookOpen, Boxes, ChartNoAxesCombined, ClipboardCheck, FileClock, GraduationCap, LayoutDashboard, Link2, ListTodo, LogOut, PlayCircle, Settings2, ShieldCheck, Users, UserRound, UserRoundCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { initials } from '../utils/formatters';
const navigation = {
    student: [{ title: 'LEARNING', items: [
                { label: 'Overview', path: '/student', icon: LayoutDashboard },
                { label: 'My skills', path: '/student/skills', icon: BookOpen },
                { label: 'Submissions', path: '/student/achievements', icon: Award },
                { label: 'Add submission', path: '/student/achievements/new', icon: ClipboardCheck },
                { label: 'Tasks', path: '/student/tasks', icon: ListTodo },
                { label: 'Exams', path: '/student/exams', icon: ClipboardCheck },
                { label: 'Video courses', path: '/student/learning', icon: PlayCircle },
                { label: 'Results', path: '/student/results', icon: ChartNoAxesCombined },
                { label: 'Progress', path: '/student/progress', icon: ChartNoAxesCombined },
                { label: 'Recommendations', path: '/student/recommendations', icon: Activity },
            ] }],
    mentor: [{ title: 'MENTOR HUB', items: [
                { label: 'Dashboard', path: '/mentor', icon: LayoutDashboard },
                { label: 'Students', path: '/mentor/students', icon: GraduationCap },
                { label: 'Reviews', path: '/mentor/reviews', icon: ClipboardCheck },
                { label: 'Tasks', path: '/mentor/tasks', icon: ListTodo },
                { label: 'Question bank', path: '/mentor/questions', icon: BookOpen },
                { label: 'Exams', path: '/mentor/exams', icon: ClipboardCheck },
                { label: 'Results', path: '/mentor/results', icon: ChartNoAxesCombined },
                { label: 'Video courses', path: '/mentor/learning', icon: PlayCircle },
            ] }],
    admin: [
        { title: 'PLATFORM', items: [
                { label: 'Overview', path: '/admin', icon: LayoutDashboard },
                { label: 'Users', path: '/admin/users', icon: Users },
                { label: 'Students', path: '/admin/students', icon: GraduationCap },
                { label: 'Mentors', path: '/admin/mentors', icon: UserRoundCheck },
            ] },
        { title: 'CONFIGURATION', items: [
                { label: 'Skills', path: '/admin/skills', icon: BookOpen },
                { label: 'Relationships', path: '/admin/relationships', icon: Link2 },
                { label: 'Scoring rules', path: '/admin/scoring', icon: Settings2 },
                { label: 'Question bank', path: '/admin/questions', icon: BookOpen },
                { label: 'Exams', path: '/admin/exams', icon: ClipboardCheck },
                { label: 'Results', path: '/admin/results', icon: ChartNoAxesCombined },
                { label: 'Video courses', path: '/admin/learning', icon: PlayCircle },
                { label: 'Audit logs', path: '/admin/audit', icon: FileClock },
            ] },
    ],
};
export function Sidebar({ role, open, onNavigate }) {
    const { user, logout } = useAuth();
    return _jsxs("aside", { className: `sidebar ${open ? 'sidebar-open' : ''}`, children: [_jsxs(NavLink, { className: "brand", to: `/${role}`, onClick: onNavigate, children: [_jsx("span", { className: "brand-mark", children: _jsx(Boxes, { size: 20 }) }), _jsxs("span", { children: ["SkillTrack", _jsxs("small", { children: [role, " workspace"] })] })] }), _jsx("nav", { className: "side-navigation", "aria-label": "Main navigation", children: navigation[role].map(group => _jsxs("div", { className: "nav-group", children: [_jsx("p", { className: "eyebrow nav-group-title", children: group.title }), group.items.map(item => {
                            const Icon = item.icon;
                            return _jsxs(NavLink, { end: item.path === `/${role}`, to: item.path, onClick: onNavigate, className: ({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`, children: [_jsx(Icon, { size: 17 }), _jsx("span", { children: item.label })] }, item.path);
                        })] }, group.title)) }), _jsxs("div", { className: "sidebar-account", children: [_jsx("div", { className: "avatar", children: initials(user?.name ?? 'User') }), _jsxs("div", { className: "sidebar-user", children: [_jsx("strong", { children: user?.name }), _jsx("span", { children: user?.email })] }), _jsx("button", { className: "icon-button logout-button", onClick: logout, title: "Sign out", "aria-label": "Sign out", children: _jsx(LogOut, { size: 16 }) })] }), _jsxs("div", { className: "sidebar-secure", children: [_jsx(ShieldCheck, { size: 15 }), " SkillTrack Secure Workspace"] }), _jsx(UserRound, { className: "sidebar-decoration", "aria-hidden": "true" })] });
}
