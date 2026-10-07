import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';
const titles = {
    student: 'Your learning, in focus', skills: 'Your skills', achievements: 'Submissions', new: 'Add submission', progress: 'Progress & growth', recommendations: 'Learning recommendations',
    mentor: 'Mentor dashboard', students: 'Student roster', detail: 'Student profile', reviews: 'Submission reviews', tasks: 'Mentor tasks',
    admin: 'Platform overview', users: 'User directory', mentors: 'Mentor directory', relationships: 'Skill relationships', scoring: 'Scoring rules', audit: 'Audit logs',
    questions: 'Question bank', exams: 'Exams', results: 'Exam results', learning: 'Video courses', lessons: 'Video lesson', 'exam-attempts': 'Exam in progress',
};
export function WorkspaceLayout({ role }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const segments = location.pathname.split('/').filter(Boolean);
    const title = segments[segments.length - 1] ?? role;
    return _jsxs("div", { className: "workspace-shell", children: [_jsx(Sidebar, { role: role, open: menuOpen, onNavigate: () => setMenuOpen(false) }), menuOpen && _jsx("button", { "aria-label": "Close navigation", className: "mobile-backdrop", onClick: () => setMenuOpen(false) }), _jsxs("div", { className: "workspace-main", children: [_jsx(Navbar, { title: titles[title] ?? title, onMenu: () => setMenuOpen(open => !open) }), _jsx("main", { className: "workspace-content", children: _jsx(Outlet, {}) }), _jsxs("footer", { className: "workspace-footer", children: [_jsx("span", { children: "SkillTrack \u00B7 Secure workspace" }), _jsx("span", { children: "Build skills with proof, feedback, and momentum." })] })] })] });
}
export function StudentLayout() { return _jsx(WorkspaceLayout, { role: "student" }); }
export function MentorLayout() { return _jsx(WorkspaceLayout, { role: "mentor" }); }
export function AdminLayout() { return _jsx(WorkspaceLayout, { role: "admin" }); }
