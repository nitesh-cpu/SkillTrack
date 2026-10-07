const { AppError } = require('./errors');

function assertNoCycle(edges, source, target) {
  if (String(source) === String(target)) throw new AppError('A skill cannot depend on itself.', 400);
  const adjacency = new Map();
  for (const edge of edges) {
    const from = String(edge.skillId ?? edge.from);
    const to = String(edge.prerequisiteSkillId ?? edge.to);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }
  const stack = [String(target)];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === String(source)) throw new AppError('This relationship would create a prerequisite cycle.', 400);
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) || []));
  }
}

module.exports = { assertNoCycle };
