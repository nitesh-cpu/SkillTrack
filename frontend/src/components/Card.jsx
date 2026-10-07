import { jsx as _jsx } from "react/jsx-runtime";
export function Card({ children, className = '', ...props }) {
    return _jsx("article", { className: `card ${className}`, ...props, children: children });
}
