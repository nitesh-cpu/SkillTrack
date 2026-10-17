import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from './Button';
export function Modal({ title, onClose, onSubmit, submitLabel = 'Save changes', busy = false, className = '', children }) {
    useEffect(() => {
        const closeOnEscape = (event) => { if (event.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);
        return _jsx("div", { className: "modal-backdrop", onMouseDown: event => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("section", { className: `modal card ${className}`.trim(), role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title", children: [_jsxs("header", { className: "modal-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "SKILLTRACK" }), _jsx("h2", { id: "modal-title", children: title })] }), _jsx("button", { className: "icon-button", type: "button", onClick: onClose, "aria-label": "Close", children: _jsx(X, { size: 19 }) })] }), onSubmit ? _jsxs("form", { onSubmit: onSubmit, children: [_jsx("div", { className: "modal-content", children: children }), _jsxs("footer", { className: "modal-footer", children: [_jsx(Button, { variant: "secondary", type: "button", onClick: onClose, children: "Cancel" }), _jsx(Button, { type: "submit", busy: busy, children: submitLabel })] })] }) : _jsx("div", { className: "modal-content", children: children })] }) });
}
