import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LoaderCircle } from 'lucide-react';
export function Button({ children, variant = 'primary', busy = false, disabled, className = '', ...props }) {
    return _jsxs("button", { className: `button button-${variant} ${className}`, disabled: disabled || busy, ...props, children: [busy && _jsx(LoaderCircle, { size: 16, className: "spin", "aria-hidden": "true" }), children] });
}
