export function formatDate(value, options) {
    return new Intl.DateTimeFormat(undefined, options ?? { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
export function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('');
}
