import { api } from './api';
export const adminService = {
    getDashboard: api.getAdminOverview,
    getDirectory: api.getAdminDirectory,
    getRelationshipData: api.getAdminRelationshipData,
    getScoringRules: api.getAdminScoringRules,
    getAuditLogs: api.getAdminAuditLogs,
    getUsers: api.getAdminUsers,
    getSkills: api.getAdminSkills,
    updateUser: api.updateAdminUser,
    assignMentor: api.assignMentor,
    unassignMentor: api.unassignMentor,
    addUser(input) {
        return api.addUser(input);
    },
    addSkill: api.addSkill,
    updateSkill: api.updateSkill,
    removeSkill: api.deleteSkill,
    addRelationship: api.addRelationship,
    removeRelationship: api.deleteRelationship,
    activateRule: api.activateRule,
    createRule: api.createRule,
    updateRule: api.updateRule,
};
