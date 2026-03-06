// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../auth-service.js';

describe('AuthService', () => {
    let auth;

    beforeEach(() => {
        localStorage.clear();
        auth = new AuthService();
        // Mock window.location.search
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { search: '' }
        });
    });

    it('should initialize with no user if not client and no saved storage', async () => {
        const user = await auth.init();
        expect(user).toBeNull();
    });

    it('should initialize as client if invite param is present', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { search: '?invite=XYZ123' }
        });
        const user = await auth.init();
        expect(user).not.toBeNull();
        expect(user.isAnonymous).toBe(true);
        expect(user.invite).toBe('XYZ123');
    });

    it('should loginWithGoogle as admin', async () => {
        const user = await auth.loginWithGoogle();
        expect(user.isAnonymous).toBe(false);
        expect(user.email).toBe('admin@mock.com');

        // Should persist
        const saved = localStorage.getItem('chorevault_admin_user');
        expect(JSON.parse(saved).uid).toBe(user.uid);
    });

    it('should logout and clear user', async () => {
        await auth.loginWithGoogle();
        await auth.logout();
        expect(auth.getUser()).toBeNull();
        expect(localStorage.getItem('chorevault_admin_user')).toBeNull();
    });

    it('should notify listeners on auth state change', async () => {
        const mockCallback = vi.fn();
        auth.onAuthStateChanged(mockCallback);

        await auth.loginWithGoogle();
        expect(mockCallback).toHaveBeenCalledWith(auth.getUser());

        await auth.logout();
        expect(mockCallback).toHaveBeenCalledWith(null);
    });
});
