import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, Boxes, Eye, EyeOff, KeyRound, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLE_HOME } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Workspace';
import { authService } from '../../services/authService';
import { isValidEmail } from '../../utils/validators';
function AuthFrame({ children, mode }) {
    return _jsxs("main", { className: "auth-shell", children: [_jsxs("section", { className: "auth-aside", children: [_jsxs(Link, { to: "/login", className: "brand auth-brand", children: [_jsx("span", { className: "brand-mark", children: _jsx(Boxes, { size: 21 }) }), _jsxs("span", { children: ["SkillTrack", _jsx("small", { children: "LEARN WITH PROOF" })] })] }), _jsxs("div", { className: "auth-pitch", children: [_jsxs("span", { className: "auth-kicker", children: [_jsx(Sparkles, { size: 14 }), " YOUR GROWTH, MADE VISIBLE"] }), _jsxs("h1", { children: ["Small wins.", _jsx("br", {}), _jsx("em", { children: "Real momentum." })] }), _jsx("p", { children: "A calm, focused space to build skills, share your work, and grow with feedback that moves you forward." }), _jsxs("div", { className: "auth-points", children: [_jsxs("span", { children: [_jsx(ShieldCheck, { size: 16 }), " A clear view of your progress"] }), _jsxs("span", { children: [_jsx(KeyRound, { size: 16 }), " Built for students, mentors, and teams"] })] })] }), _jsx("span", { className: "auth-aside-footer", children: "Learn something. Prove something. Repeat." })] }), _jsx("section", { className: "auth-panel", children: _jsxs("div", { className: "auth-card", children: [_jsxs("div", { className: "auth-mobile-brand", children: [_jsx("span", { className: "brand-mark", children: _jsx(Boxes, { size: 19 }) }), "SkillTrack"] }), _jsx("p", { className: "eyebrow", children: mode }), children, _jsx("p", { className: "auth-legal", children: "Your account and learning data are securely protected by SkillTrack." })] }) })] });
}
export function LoginPage() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    if (user)
        return _jsx(Navigate, { to: ROLE_HOME[user.role], replace: true });
    async function submitCredentials(targetEmail, targetPass) {
        setEmail(targetEmail);
        setPassword(targetPass);
        setError('');
        setBusy(true);
        try {
            const authenticated = await login({ email: targetEmail, password: targetPass });
            navigate(ROLE_HOME[authenticated.role], { replace: true });
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not sign in with these credentials.');
        }
        finally {
            setBusy(false);
        }
    }
    async function submit(event) {
        event.preventDefault();
        setError('');
        if (!isValidEmail(email)) {
            setError('Enter a valid email address.');
            return;
        }
        if (password.length < 8) {
            setError('Your password must be at least 8 characters.');
            return;
        }
        await submitCredentials(email, password);
    }
    return _jsxs(AuthFrame, { mode: "WELCOME BACK", children: [_jsx("h2", { children: "Sign in to your space" }), _jsx("p", { className: "auth-intro", children: "Pick up where you left off." }), error && _jsx(Notice, { kind: "error", onClose: () => setError(''), children: error }), _jsxs("form", { className: "auth-form", onSubmit: submit, children: [_jsxs("label", { children: ["Email address", _jsxs("span", { className: "input-shell", children: [_jsx(Mail, { size: 16 }), _jsx("input", { type: "email", value: email, onChange: event => setEmail(event.target.value), autoComplete: "email", placeholder: "you@example.com", required: true })] })] }), _jsxs("label", { children: ["Password", _jsxs("span", { className: "input-shell", children: [_jsx(KeyRound, { size: 16 }), _jsx("input", { type: visible ? 'text' : 'password', value: password, onChange: event => setPassword(event.target.value), autoComplete: "current-password", placeholder: "At least 8 characters", minLength: 8, required: true }), _jsx("button", { className: "password-toggle", type: "button", onClick: () => setVisible(value => !value), "aria-label": visible ? 'Hide password' : 'Show password', children: visible ? _jsx(EyeOff, { size: 16 }) : _jsx(Eye, { size: 16 }) })] })] }), _jsx("div", { className: "form-inline-link", children: _jsx(Link, { to: "/forgot-password", children: "Forgot password?" }) }), _jsxs(Button, { type: "submit", busy: busy, className: "button-full", children: ["Sign in ", _jsx(ArrowLeft, { size: 16, className: "button-arrow" })] })] }), _jsxs("p", { className: "auth-switch", children: ["New to SkillTrack? ", _jsx(Link, { to: "/register", children: "Create your account" })] })] });
}
export function RegisterPage() {
    const { user, register } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    if (user)
        return _jsx(Navigate, { to: ROLE_HOME[user.role], replace: true });
    async function submit(event) {
        event.preventDefault();
        setError('');
        if (name.trim().length < 2 || !isValidEmail(email) || password.length < 8) {
            setError('Enter your name and a valid email. Password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            const created = await register({ name: name.trim(), email: email.trim(), password });
            navigate(ROLE_HOME[created.role], { replace: true });
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not create your account.');
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(AuthFrame, { mode: "GET STARTED", children: [_jsx("h2", { children: "Create your account" }), _jsx("p", { className: "auth-intro", children: "Your SkillTrack student workspace starts here." }), error && _jsx(Notice, { kind: "error", children: error }), _jsxs("form", { className: "auth-form", onSubmit: submit, children: [_jsxs("label", { children: ["Full name", _jsx("span", { className: "input-shell", children: _jsx("input", { value: name, onChange: event => setName(event.target.value), autoComplete: "name", placeholder: "Your name", required: true }) })] }), _jsxs("label", { children: ["Email address", _jsx("span", { className: "input-shell", children: _jsx("input", { type: "email", value: email, onChange: event => setEmail(event.target.value), autoComplete: "email", placeholder: "you@example.com", required: true }) })] }), _jsxs("label", { children: ["Password", _jsx("span", { className: "input-shell", children: _jsx("input", { type: "password", value: password, onChange: event => setPassword(event.target.value), autoComplete: "new-password", minLength: 8, placeholder: "At least 8 characters", required: true }) })] }), _jsxs("label", { children: ["Confirm Password", _jsx("span", { className: "input-shell", children: _jsx("input", { type: "password", value: confirmPassword, onChange: event => setConfirmPassword(event.target.value), autoComplete: "new-password", minLength: 8, placeholder: "Re-enter your password", required: true }) })] }), _jsx(Button, { type: "submit", busy: busy, className: "button-full", children: "Create account" })] }), _jsxs("p", { className: "auth-switch", children: ["Already have an account? ", _jsx(Link, { to: "/login", children: "Sign in" })] })] });
}
export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit(event) {
        event.preventDefault();
        setMessage('');
        setError('');
        if (!isValidEmail(email)) {
            setError('Enter a valid email address.');
            return;
        }
        setBusy(true);
        try {
            await authService.forgotPassword(email);
            setMessage('If an active account exists for this email, password recovery instructions will be sent.');
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not process this request.');
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(AuthFrame, { mode: "ACCOUNT RECOVERY", children: [_jsx("h2", { children: "Forgot your password?" }), _jsx("p", { className: "auth-intro", children: "Enter your account email to begin recovery." }), error && _jsx(Notice, { kind: "error", children: error }), message && _jsx(Notice, { children: message }), _jsxs("form", { className: "auth-form", onSubmit: submit, children: [_jsxs("label", { children: ["Email address", _jsxs("span", { className: "input-shell", children: [_jsx(Mail, { size: 16 }), _jsx("input", { type: "email", value: email, onChange: event => setEmail(event.target.value), autoComplete: "email", required: true })] })] }), _jsx(Button, { busy: busy, type: "submit", className: "button-full", children: "Continue" })] }), _jsx("p", { className: "auth-switch", children: _jsx(Link, { to: "/login", children: "Back to sign in" }) })] });
}
export function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const [token] = useState(() => searchParams.get('token') || '');
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (token)
            navigate('/reset-password', { replace: true });
    }, [navigate, token]);
    async function submit(event) {
        event.preventDefault();
        setError('');
        setMessage('');
        if (!token) {
            setError('This reset link is invalid or expired. Please request a new link.');
            return;
        }
        if (password.length < 8) {
            setError('Your new password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            await authService.resetPassword(token, password);
            setMessage('Your password has been updated. You can now sign in.');
            setPassword('');
            setConfirmPassword('');
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not reset your password.');
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(AuthFrame, { mode: "ACCOUNT RECOVERY", children: [_jsx("h2", { children: "Choose a new password" }), _jsx("p", { className: "auth-intro", children: "Enter a new password for your account." }), error && _jsx(Notice, { kind: "error", children: error }), message && _jsx(Notice, { children: message }), _jsxs("form", { className: "auth-form", onSubmit: submit, children: [_jsxs("label", { children: ["New password", _jsxs("span", { className: "input-shell", children: [_jsx(KeyRound, { size: 16 }), _jsx("input", { type: "password", value: password, onChange: event => setPassword(event.target.value), autoComplete: "new-password", minLength: 8, maxLength: 128, required: true })] })] }), _jsxs("label", { children: ["Confirm new password", _jsxs("span", { className: "input-shell", children: [_jsx(KeyRound, { size: 16 }), _jsx("input", { type: "password", value: confirmPassword, onChange: event => setConfirmPassword(event.target.value), autoComplete: "new-password", minLength: 8, maxLength: 128, required: true })] })] }), _jsx(Button, { busy: busy, type: "submit", className: "button-full", disabled: Boolean(message), children: "Reset password" })] }), _jsxs("p", { className: "auth-switch", children: [_jsx(Link, { to: "/forgot-password", children: "Request a new link" }), " \u00B7 ", _jsx(Link, { to: "/login", children: "Sign in" })] })] });
}
