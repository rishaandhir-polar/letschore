// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncStore } from '../sync-store.js';

describe('SyncStore', () => {
    let store;
    let mockAuthService;

    beforeEach(() => {
        localStorage.clear();
        let authStateCallback = null;
        mockAuthService = {
            getUser: vi.fn().mockReturnValue({ uid: 'admin_1', isAnonymous: false }),
            onAuthStateChanged: vi.fn().mockImplementation((cb) => {
                authStateCallback = cb;
            }),
            triggerAuth: (user) => {
                mockAuthService.getUser.mockReturnValue(user);
                if (authStateCallback) authStateCallback(user);
            }
        };
        store = new SyncStore(mockAuthService);
    });

    it('should initialize empty chores', () => {
        expect(store.getChores().length).toBe(0);
    });

    it('should add a chore', () => {
        const chore = store.addChore('Test', 'low', 10);
        expect(chore.title).toBe('Test');
        expect(chore.value).toBe(10);
        expect(chore.status).toBe('PENDING'); // PENDING, PENDING_APPROVAL, APPROVED
        expect(store.getChores().length).toBe(1);
    });

    it('should toggle chore to PENDING_APPROVAL', () => {
        const chore = store.addChore('Test', 'low', 10);
        store.toggleChore(chore.id);
        const updated = store.getChores()[0];
        expect(updated.status).toBe('PENDING_APPROVAL');
    });

    it('should approve chore and update wallet as admin', () => {
        const chore = store.addChore('Test', 'low', 10);
        store.toggleChore(chore.id);
        store.approveChore(chore.id);
        const updated = store.getChores()[0];
        expect(updated.status).toBe('APPROVED');
        expect(store.getTotalOwed()).toBe(10);
    });

    it('should notify subscribers when chores change', () => {
        const subscriber = vi.fn();
        store.subscribe(subscriber);
        store.addChore('Test', 'low', 10);
        expect(subscriber).toHaveBeenCalled();
    });
});
