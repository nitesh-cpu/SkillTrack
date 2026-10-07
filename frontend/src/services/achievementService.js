import { api } from './api';
export const achievementService = {
    getStudentDashboard: api.getStudentDashboard,
    getStudentProgress: api.getStudentProgress,
    getStudentRecommendations: api.getStudentRecommendations,
    getStudentAchievements: api.getStudentAchievements,
    getStudentTasks: api.getStudentTasks,
    submit(user, achievement) {
        return api.addAchievement(user, achievement);
    },
    completeTask: api.completeTask,
};
