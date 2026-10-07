import { api } from './api';
export const authService = {
    login({ email, password }) {
        return api.login(email, password);
    },
    register({ name, email, password }) {
        return api.register(name, email, password);
    },
    forgotPassword(email) {
        return api.resetPassword(email);
    },
    resetPassword(token, password) {
        return api.applyPasswordReset(token, password);
    },
};
