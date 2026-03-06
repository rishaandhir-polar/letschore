/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../store.js';

describe('Store', () => {
    let store;

    beforeEach(() => {
        localStorage.clear();
        store = new Store();
    });

    it('should add a chore with a value', () => {
        store.addChore('Mow Lawn', 'high', 10.50);
        const chores = store.getChores();
        expect(chores[0].value).toBe(10.50);
    });

    it('should calculate total owed correctly for completed chores', () => {
        store.addChore('Task 1', 'low', 5);
        store.addChore('Task 2', 'medium', 15);

        const chores = store.getChores();
        const task1 = chores.find(c => c.title === 'Task 1');
        const task2 = chores.find(c => c.title === 'Task 2');

        store.toggleChore(task1.id); // $5 chore completed
        expect(store.getTotalOwed()).toBe(5);

        store.toggleChore(task2.id); // Both completed
        expect(store.getTotalOwed()).toBe(20);
    });

    it('should handle cent precision correctly (0.1 + 0.2)', () => {
        store.addChore('Task 1', 'low', 0.1);
        store.addChore('Task 2', 'medium', 0.2);

        const chores = store.getChores();
        store.toggleChore(chores[0].id);
        store.toggleChore(chores[1].id);

        expect(store.getTotalOwed()).toBe(0.3);
    });

    it('should handle zero or invalid values gracefully', () => {
        store.addChore('Free Task', 'low', 'abc');
        expect(store.getChores()[0].value).toBe(0);
    });

    it('should include totalOwed in stats', () => {
        store.addChore('Paid', 'high', 50);
        store.toggleChore(store.getChores()[0].id);
        const stats = store.getStats();
        expect(stats.totalOwed).toBe(50);
    });

    it('should sort chores by priority (High > Medium > Low)', () => {
        store.addChore('Low Task', 'low', 1);
        store.addChore('High Task', 'high', 3);
        store.addChore('Medium Task', 'medium', 2);

        const chores = store.getChores();
        expect(chores[0].priority).toBe('high');
        expect(chores[1].priority).toBe('medium');
        expect(chores[2].priority).toBe('low');
    });

    it('should revoke earnings in wallet when chores are manually unchecked', () => {
        store.addChore('Mow Lawn', 'high', 10);
        const chores = store.getChores();
        store.toggleChore(chores[0].id); // Completed: wallet = 10
        expect(store.getTotalOwed()).toBe(10);

        store.toggleChore(chores[0].id); // Manual Uncompleted: wallet should be 0
        expect(store.getTotalOwed()).toBe(0);
        expect(store.getHistory().length).toBe(0); // History entry should be removed
    });

    it('should stack earnings correctly after multiple completions (Bounty Stacking)', () => {
        // Task with 1 hour refresh
        store.addChore('Task', 'medium', 10, 0, 1, 0);
        const chore = store.getChores()[0];

        // 1st completion
        store.toggleChore(chore.id); // +10
        expect(store.getTotalOwed()).toBe(10);
        expect(store.getHistory().length).toBe(1);

        // Auto-refresh (after 2 hours)
        store.checkRefreshes(Date.now() + 2 * 60 * 60 * 1000);
        expect(store.getChores()[0].completed).toBe(false);
        expect(store.getTotalOwed()).toBe(10); // Money stays!

        // 2nd completion
        store.toggleChore(chore.id); // + another 10
        expect(store.getTotalOwed()).toBe(20);
        expect(store.getHistory().length).toBe(2);
    });

    it('should automatically refresh chores after the interval', () => {
        // Use a 1 hour refresh
        store.addChore('Daily Task', 'medium', 10, 0, 1, 0);
        const chore = store.getChores()[0];

        store.toggleChore(chore.id);
        expect(store.getChores()[0].completed).toBe(true);

        // Mock time forward by 1.1 hours
        const hourPlus = 1.1 * 60 * 60 * 1000;
        const now = Date.now();

        // We need a way to check refreshes, let's assume store.checkRefreshes(currentTime)
        store.checkRefreshes(now + hourPlus);

        expect(store.getChores()[0].completed).toBe(false);
        expect(store.getTotalOwed()).toBe(10); // Money stays
    });

    it('should automatically refresh chores after the interval in days', () => {
        // Use a 1 day refresh
        store.addChore('Daily Task', 'medium', 10, 1, 0, 0);
        const chore = store.getChores()[0];

        store.toggleChore(chore.id);

        // Mock time forward by 25 hours
        const dayPlus = 25 * 60 * 60 * 1000;
        const now = Date.now();

        store.checkRefreshes(now + dayPlus);

        expect(store.getChores()[0].completed).toBe(false);
    });

    it('should maintain a history of completed chores', () => {
        store.addChore('History Task', 'low', 5);
        const chore = store.getChores()[0];

        store.toggleChore(chore.id);

        const history = store.getHistory();
        expect(history.length).toBe(1);
        expect(history[0].title).toBe('History Task');
        expect(history[0].value).toBe(5);
    });

    it('should automatically refresh chores after the interval in minutes', () => {
        // Use a 5 minute refresh
        store.addChore('Quick Task', 'low', 1, 0, 0, 5);
        const chore = store.getChores()[0];

        store.toggleChore(chore.id);

        // Mock time forward by 6 minutes
        const minutesPlus = 6 * 60 * 1000;
        const now = Date.now();

        store.checkRefreshes(now + minutesPlus);

        expect(store.getChores()[0].completed).toBe(false);
    });

    it('should handle specific combined durations (Days + Hours + Minutes)', () => {
        // Task refreshes every 1 day, 2 hours, and 30 minutes
        // Total ms: (1*24*60*60*1000) + (2*60*60*1000) + (30*60*1000)
        // 86,400,000 + 7,200,000 + 1,800,000 = 95,400,000 ms
        store.addChore('Special Task', 'high', 50, 1, 2, 30);
        const chore = store.getChores()[0];

        expect(chore.refreshIntervalMs).toBe(95400000);

        store.toggleChore(chore.id);

        // Mock time forward by 95,300,000 ms (just before reset)
        store.checkRefreshes(Date.now() + 95300000);
        expect(store.getChores()[0].completed).toBe(true);

        // Mock time forward by 95,500,000 ms (after reset)
        store.checkRefreshes(Date.now() + 95500000);
        expect(store.getChores()[0].completed).toBe(false);
    });
});
