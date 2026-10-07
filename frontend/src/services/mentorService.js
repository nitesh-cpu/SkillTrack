import { api } from './api';
export const mentorService = {
    getDashboard: api.getMentorDashboard,
    getStudentDetail: api.getMentorStudentDetail,
    getReviews: api.getMentorReviews,
    getReviewHistory: api.getMentorReviewHistory,
    getReview: api.getMentorReview,
    getTasks: api.getMentorTasks,
    getTask: api.getMentorTask,
    reviewAchievement: api.reviewAchievement,
    assignTask: api.assignTask,
    updateTask: api.updateMentorTask,
    cancelTask: api.cancelMentorTask,
    addTaskFeedback: api.addTaskFeedback,
};
