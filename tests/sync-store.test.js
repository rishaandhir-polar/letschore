// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncStore } from '../sync-store.js';
import { resetMockState } from './setup.js';

describe('SyncStore', () => {
    let store;
    let mockAuthService;

    const waitForReady = async (s) => {
        return new Promise(resolve => {
            const check = () => {
                if (s.activeFamilyId) resolve();
                else setTimeout(check, 10);
            };
            check();
        });
    };

    const waitForUpdate = (s, count = 1) => {
        let current = 0;
        return new Promise(resolve => {
            const unsub = s.subscribe(() => {
                current++;
                if (current >= count) {
                    // Give it one more microtask to be sure
                    setTimeout(resolve, 0);
                }
            });
            // Timeout safety
            setTimeout(resolve, 100);
        });
    };

    beforeEach(async () => {
        resetMockState();
        localStorage.clear();
        mockAuthService = {
            getUser: vi.fn().mockReturnValue({ uid: 'admin_1', isAnonymous: false }),
            onAuthStateChanged: vi.fn().mockImplementation((cb) => {
                cb({ uid: 'admin_1', isAnonymous: false });
            }),
        };
        store = new SyncStore(mockAuthService);
        await waitForReady(store);
    });

    it('should initialize empty chores', () => {
        expect(store.getChores().length).toBe(0);
    });

    it('should add a chore', async () => {
        const chore = await store.addChore('Test', 'kid1', [], 'medium', 10);
        expect(chore.title).toBe('Test');
        expect(chore.value).toBe(10);
        expect(store.getChores().length).toBe(1);
    });

    it('should toggle chore to PENDING_APPROVAL', async () => {
        const chore = await store.addChore('Test', 'kid1', [], 'medium', 10);
        await store.toggleChore(chore.id);
        const updated = store.getChores()[0];
        expect(updated.status).toBe('PENDING_APPROVAL');
    });

    it('should approve chore and update wallet as admin', async () => {
        const chore = await store.addChore('Test', 'kid1', [], 'medium', 10);
        await store.toggleChore(chore.id);
        await store.approveChore(chore.id);

        expect(store.getTotalOwed()).toBe(10);
        const updated = store.getChores()[0];
        expect(updated.status).toBe('APPROVED');
    });

    it('should notify subscribers when chores change', async () => {
        const subscriber = vi.fn();
        store.subscribe(subscriber);
        await store.addChore('Test', 'kid1', [], 'medium', 10);
        expect(subscriber).toHaveBeenCalled();
    });

    it('should reject a chore', async () => {
        const chore = await store.addChore('Test', 'kid1', [], 'medium', 10);
        await store.toggleChore(chore.id);
        await store.rejectChore(chore.id, null, 'Not good enough');

        const updated = store.getChores()[0];
        expect(updated.status).toBe('PENDING');
        expect(updated.comments.length).toBe(1);
        expect(updated.comments[0].text).toBe('Not good enough');
    });

    it('should manage comments: add, update, delete', async () => {
        const chore = await store.addChore('Test', 'kid1', [], 'medium', 10);

        // Add
        await store.addComment(chore.id, 'Comment 1');
        let updated = store.getChores()[0];
        expect(updated.comments.length).toBe(1);
        expect(updated.comments[0].text).toBe('Comment 1');

        const commentId = updated.comments[0].id;

        // Update
        await store.updateComment(chore.id, commentId, 'Updated');
        updated = store.getChores()[0];
        expect(updated.comments[0].text).toBe('Updated');

        // Delete
        await store.deleteComment(chore.id, commentId);
        updated = store.getChores()[0];
        expect(updated.comments.length).toBe(0);
    });

    it('should clone a chore', async () => {
        const chore = await store.addChore('Original', 'kid1', [], 'high', 20);
        const updatePromise = waitForUpdate(store);
        const clone = await store.cloneChore(chore.id);
        await updatePromise;

        expect(clone.title).toBe('Original (Copy)');
        expect(clone.value).toBe(20);
        expect(store.getChores().length).toBe(2);
    });

    it('should update family data: payAmount and resetInvite', async () => {
        const updatePromise = waitForUpdate(store);
        await store.payAmount(50);
        await updatePromise;

        expect(store.getTotalOwed()).toBe(-50);
        expect(store.getHistory().length).toBe(1);
        expect(store.getHistory()[0].type).toBe('payment');

        await store.resetInviteCode();
        expect(store.getInviteCode()).toBeDefined();
    });

    it('should update and delete chores', async () => {
        const chore = await store.addChore('Task', 'kid1', [], 'low', 5);

        // Update
        await store.updateChore(chore.id, { title: 'New Name', priority: 'high' });
        let updated = store.getChores()[0];
        expect(updated.title).toBe('New Name');
        expect(updated.priority).toBe('high');

        // Delete
        const updatePromise = waitForUpdate(store);
        await store.deleteChore(chore.id);
        await updatePromise;
        expect(store.getChores().length).toBe(0);
    });

    it('should handle chore refreshes', async () => {
        const now = Date.now();
        const chore = await store.addChore('Refresh Task', 'kid1', [], 'medium', 10, 0, 1, 0); // 1 hour refresh

        // Complete it
        await store.toggleChore(chore.id);
        const updated = store.getChores()[0];
        await store.approveChore(updated.id);

        // Check refresh after 2 hours
        const refreshed = store.checkRefreshes(now + (2 * 60 * 60 * 1000));
        expect(refreshed).toContain('Refresh Task');
    });

    it('should clearAll data as admin', async () => {
        await store.addChore('Task 1', 'kid1', [], 'low', 5);
        await store.payAmount(20);

        const updatePromise = waitForUpdate(store, 2); // Wallet + Chores
        await store.clearAll();
        // Clear all deletes chores one by one in the mock? 
        // SyncStoreAdmin.clearAll deletes all chores.
        await updatePromise;

        expect(store.getChores().length).toBe(0);
        expect(store.getTotalOwed()).toBe(0);
    });

    it('should handle admin invite code flow', async () => {
        // Change mock auth service to have an admin invite code
        mockAuthService.adminInviteCode = 'ADMIN_INVITE_123';
        mockAuthService.clearAdminInvite = vi.fn(() => { mockAuthService.adminInviteCode = null; });

        // Trigger a new initialization
        const newStore = new SyncStore(mockAuthService);
        await waitForReady(newStore);

        expect(mockAuthService.clearAdminInvite).toHaveBeenCalled();
        expect(newStore.activeFamilyId).toBeDefined();
    });

    it('should handle anonymous user with invite', async () => {
        const anonAuth = {
            getUser: () => ({ uid: 'anon_1', isAnonymous: true, invite: 'INVITE_123' }),
            onAuthStateChanged: (cb) => { cb({ uid: 'anon_1', isAnonymous: true, invite: 'INVITE_123' }); return () => { }; }
        };
        const anonStore = new SyncStore(anonAuth);
        await waitForReady(anonStore);
        expect(anonStore.activeFamilyId).toBeDefined();
    });

    it('should handle null user during load', async () => {
        const nullAuth = {
            getUser: () => null,
            onAuthStateChanged: (cb) => { cb(null); return () => { }; }
        };
        const nullStore = new SyncStore(nullAuth);
        expect(nullStore.authService.getUser()).toBeNull();
    });
});
