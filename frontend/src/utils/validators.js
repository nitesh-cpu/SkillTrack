export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function requiredText(value, label) {
    const result = value.trim();
    if (!result)
        throw new Error(`${label} is required.`);
    return result;
}
export function isHttpUrl(value) {
    if (!value)
        return true;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
