// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../auth-service.js';
import * as firebase from '../firebase-config.js';

describe('AuthService', () => {
    let auth;

    beforeEach(() => {
        localStorage.clear();
        auth = new AuthService();
        // Mock window.location.search
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { search: '', pathname: '/', origin: 'http://localhost' }
        });
    });

    it('should initialize with no user if not client and no saved storage', async () => {
        // Mock onAuthStateChanged to trigger with null
        firebase.onAuthStateChanged.mockImplementation((authObj, cb) => {
            cb(null);
            return () => { };
        });

        const userPromise = auth.init();
        const user = await userPromise;
        expect(user).toBeNull();
    });

    it('should initialize as client if invite param is present', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { search: '?invite=XYZ123', pathname: '/', origin: 'http://localhost' }
        });

        firebase.signInAnonymously.mockResolvedValue({ user: { uid: 'anon-123', isAnonymous: true } });
        firebase.onAuthStateChanged.mockImplementation((authObj, cb) => {
            cb({ uid: 'anon-123', isAnonymous: true });
            return () => { };
        });

        const user = await auth.init();
        expect(user).not.toBeNull();
        expect(user.isAnonymous).toBe(true);
        expect(user.invite).toBe('XYZ123');
    });

    it('should loginWithGoogle as admin', async () => {
        const mockUser = { uid: 'admin-123', isAnonymous: false, email: 'admin@test.com' };
        firebase.signInWithPopup.mockResolvedValue({ user: mockUser });

        const user = await auth.loginWithGoogle();
        expect(user.uid).toBe('admin-123');
        expect(user.isAnonymous).toBe(false);
    });

    it('should logout and clear user', async () => {
        firebase.signOut.mockResolvedValue();
        await auth.logout();
        expect(firebase.signOut).toHaveBeenCalled();
        expect(auth.adminInviteCode).toBeNull();
        expect(auth.inviteCode).toBeNull();
    });
});
