const { assertNoCycle } = require('../src/utils/graph');

describe('skill prerequisite graph', () => {
  const edges = [
    { skillId: 'oop', prerequisiteSkillId: 'java' },
    { skillId: 'collections', prerequisiteSkillId: 'oop' },
    { skillId: 'dsa', prerequisiteSkillId: 'collections' },
  ];

  test('allows a valid edge which does not form a cycle', () => {
    expect(() => assertNoCycle(edges, 'advanced-dsa', 'dsa')).not.toThrow();
  });

  test('rejects self-dependencies', () => {
    expect(() => assertNoCycle(edges, 'java', 'java')).toThrow('cannot depend on itself');
  });

  test('rejects paths which create a cycle', () => {
    expect(() => assertNoCycle(edges, 'java', 'dsa')).toThrow('cycle');
  });
});
