import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, Inbox, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './Button';
import { Loading } from './Loading';
export function PageHeader({ eyebrow, title, description, action }) {
    return _jsxs("div", { className: "page-heading", children: [_jsxs("div", { children: [eyebrow && _jsx("p", { className: "eyebrow", children: eyebrow }), _jsx("h2", { children: title }), description && _jsx("p", { className: "page-description", children: description })] }), action && _jsx("div", { className: "page-heading-action", children: action })] });
}
export function StatCard({ label, value, detail, icon: Icon, tone = 'blue' }) {
    return _jsxs("article", { className: "card stat-card", children: [_jsxs("div", { className: "stat-top", children: [_jsx("span", { children: label }), _jsx("span", { className: `stat-icon stat-icon-${tone}`, children: _jsx(Icon, { size: 17 }) })] }), _jsx("strong", { children: value }), detail && _jsx("p", { children: detail })] });
}
export function EmptyState({ title, detail, action }) {
    return _jsxs("div", { className: "empty-state", children: [_jsx("span", { className: "empty-icon", children: _jsx(Inbox, { size: 21 }) }), _jsx("h3", { children: title }), _jsx("p", { children: detail }), action && _jsxs(Link, { className: "button button-primary", to: action.to, children: [action.label, _jsx(ArrowRight, { size: 15 })] })] });
}
export function QueryState({ loading, error, onRetry }) {
    if (loading)
        return _jsx(Loading, {});
    if (!error)
        return null;
    return _jsxs("div", { className: "alert alert-error", role: "alert", children: [_jsx(TriangleAlert, { size: 17 }), _jsx("span", { children: error }), onRetry && _jsx(Button, { variant: "secondary", onClick: onRetry, children: "Try again" })] });
}
export function Notice({ children, kind = 'success', onClose }) {
    return _jsxs("div", { className: `alert alert-${kind}`, role: kind === 'error' ? 'alert' : 'status', children: [children, onClose && _jsx("button", { onClick: onClose, "aria-label": "Dismiss message", children: "Dismiss" })] });
}
