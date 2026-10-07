import { api } from './api';
export const skillService = {
    getStudentSkills(user) {
        return api.getStudentDashboard(user).then(result => result.skills);
    },
    getStudentSkillGraph: api.getStudentSkillGraph,
    getStudentSkillHistory: api.getStudentSkillHistory,
    getCatalog() {
        return api.getAdminSkills();
    },
    add: api.addSkill,
    remove: api.deleteSkill,
    addRelationship: api.addRelationship,
    removeRelationship: api.deleteRelationship,
};
