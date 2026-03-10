import { db, doc, updateDoc } from './firebase-config.js';

export class SyncStoreRefresh {
    constructor(store) {
        this.store = store;
    }

    checkRefreshes(currentTime = Date.now()) {
        const notifications = [];
        if (!this.store.activeFamilyId) return notifications;

        const currentDay = new Date(currentTime).getDay();
        const startOfToday = new Date(currentTime);
        startOfToday.setHours(0, 0, 0, 0);

        this.store.chores.forEach(async chore => {
            const daysToRefresh = (chore.scheduledDays && chore.scheduledDays.length > 0)
                ? [currentDay]
                : [null];

            for (const dIdx of daysToRefresh) {
                let shouldReset = false;
                const dailyStatus = (dIdx !== null && chore.statusByDay) ? (chore.statusByDay[dIdx] || 'PENDING') : chore.status;
                const dailyLastCompleted = (dIdx !== null && chore.lastCompletedAtByDay) ? (chore.lastCompletedAtByDay[dIdx] || 0) : (chore.lastCompletedAt || 0);

                if (dailyStatus === 'APPROVED') {
                    // 1. Timer-based Refresh (only if not scheduled)
                    if (dIdx === null && chore.refreshIntervalMs > 0 && dailyLastCompleted) {
                        const timeSince = currentTime - dailyLastCompleted;
                        if (timeSince >= chore.refreshIntervalMs) {
                            shouldReset = true;
                        }
                    }

                    // 2. Calendar-based Refresh
                    if (!shouldReset && dIdx !== null) {
                        if (!dailyLastCompleted || dailyLastCompleted < startOfToday.getTime()) {
                            shouldReset = true;
                        }
                    }

                    if (shouldReset) {
                        notifications.push(chore.title);
                        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', chore.id);
                        if (dIdx !== null) {
                            await updateDoc(choreRef, { [`statusByDay.${dIdx}`]: 'PENDING' });
                        } else {
                            await updateDoc(choreRef, { status: 'PENDING' });
                        }
                    }
                }
            }
        });

        return notifications;
    }
}
