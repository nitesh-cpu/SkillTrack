const AuditLog = require('../models/AuditLog');

const SENSITIVE_FIELD = /password|token|secret|authorization|cookie|credential|hash|privatekey/i;

function safeMetadata(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safeMetadata(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_FIELD.test(key))
    .slice(0, 50)
    .map(([key, entry]) => [key, safeMetadata(entry, depth + 1)]));
}

async function writeAudit({ actorId, action, entity, entityId, metadata = {} }) {
  await AuditLog.create({
    actorId,
    action,
    entity,
    entityId: entityId || undefined,
    metadata: safeMetadata(metadata),
  });
}

module.exports = { safeMetadata, writeAudit };
