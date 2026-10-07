import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Loading({ label = 'Loading your workspace…' }) {
    return _jsxs("div", { className: "loading-state", role: "status", children: [_jsx("span", { className: "spinner" }), _jsx("span", { children: label })] });
}
