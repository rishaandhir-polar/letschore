import { db, collection, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from './firebase-config.js';

export class SyncStoreChores {
    constructor(store) {
        this.store = store; // Reference to main SyncStore for context (activeFamilyId, authService, etc)
    }

    async addChore(title, assignee, scheduledDays, priority, value = 0, days = 0, hours = 0, minutes = 0) {
        if (!this.store.activeFamilyId) return null;

        const normalizedValue = Math.round(parseFloat(value) * 100) / 100;
        const intervalMs = (parseInt(days) || 0) * 24 * 3600000 + (parseInt(hours) || 0) * 3600000 + (parseInt(minutes) || 0) * 60000;

        const choreData = {
            title,
            assignee: assignee || '',
            scheduledDays: scheduledDays || [],
            priority,
            value: normalizedValue || 0,
            refreshIntervalMs: intervalMs,
            refreshConfig: { days: parseInt(days) || 0, hours: parseInt(hours) || 0, minutes: parseInt(minutes) || 0 },
            status: 'PENDING',
            createdAt: Date.now(),
            lastCompletedAt: null
        };

        const choreRef = doc(collection(doc(db, 'families', this.store.activeFamilyId), 'chores'));
        await setDoc(choreRef, choreData);

        return { id: choreRef.id, ...choreData };
    }

    async toggleChore(id, dayIndex = null, commentText = null) {
        if (!this.store.activeFamilyId) return;

        const chore = this.store.chores.find(c => c.id === id);
        if (!chore) return;

        let currentStatus;
        if (dayIndex !== null) {
            currentStatus = (chore.statusByDay && chore.statusByDay[dayIndex]) ? chore.statusByDay[dayIndex] : 'PENDING';
        } else {
            currentStatus = chore.status;
        }

        let newStatus = currentStatus === 'PENDING' ? 'PENDING_APPROVAL' : 'PENDING';

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);
        const updates = {};

        if (dayIndex !== null) {
            updates[`statusByDay.${dayIndex}`] = newStatus;
        } else {
            updates.status = newStatus;
        }

        await updateDoc(choreRef, updates);

        if (commentText) {
            await this.addComment(id, commentText, dayIndex);
        }
    }

    async approveChore(id, dayIndex = null) {
        const user = this.store.authService.getUser();
        if (!this.store.activeFamilyId || !user || user.isAnonymous) return;

        const chore = this.store.chores.find(c => c.id === id);
        if (!chore) return;

        let currentStatus;
        if (dayIndex !== null) {
            currentStatus = (chore.statusByDay && chore.statusByDay[dayIndex]) ? chore.statusByDay[dayIndex] : 'PENDING';
        } else {
            currentStatus = chore.status;
        }

        if (currentStatus !== 'PENDING_APPROVAL') return;

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);
        const now = Date.now();

        if (dayIndex !== null) {
            await updateDoc(choreRef, {
                [`statusByDay.${dayIndex}`]: 'APPROVED',
                [`lastCompletedAtByDay.${dayIndex}`]: now
            });
        } else {
            await updateDoc(choreRef, {
                status: 'APPROVED',
                lastCompletedAt: now
            });
        }

        const newWallet = Math.max(0, (Math.round(this.store.wallet * 100) + Math.round(chore.value * 100)) / 100);

        const updatedHistory = [{
            id: crypto.randomUUID(),
            choreId: chore.id,
            title: chore.title,
            value: chore.value,
            type: 'earning',
            timestamp: now,
            approvedBy: user.uid
        }, ...this.store.history].slice(0, 50);

        await this.store._updateFamilyData({
            wallet: newWallet,
            history: updatedHistory
        });
    }

    async rejectChore(id, dayIndex = null, commentText = null) {
        if (!this.store.activeFamilyId) return;
        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);
        const updates = {};

        if (dayIndex !== null) {
            updates[`statusByDay.${dayIndex}`] = 'PENDING';
        } else {
            updates.status = 'PENDING';
        }

        await updateDoc(choreRef, updates);

        if (commentText) {
            await this.addComment(id, commentText, dayIndex);
        }
    }

    async deleteChore(id) {
        if (!this.store.activeFamilyId) return;
        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);
        await deleteDoc(choreRef);
    }

    async updateChore(id, updates) {
        if (!this.store.activeFamilyId) return;

        if (updates.refreshConfig) {
            const { days, hours, minutes } = updates.refreshConfig;
            updates.refreshIntervalMs = (days * 24 * 3600000) + (hours * 3600000) + (minutes * 60000);
        }

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);
        await updateDoc(choreRef, updates);
    }

    async cloneChore(id) {
        if (!this.store.activeFamilyId) return null;

        const original = this.store.chores.find(c => c.id === id);
        if (original) {
            const cloneData = {
                ...original,
                title: `${original.title} (Copy)`,
                status: 'PENDING',
                lastCompletedAt: null,
                createdAt: Date.now()
            };
            delete cloneData.id;

            const choreRef = doc(collection(doc(db, 'families', this.store.activeFamilyId), 'chores'));
            await setDoc(choreRef, cloneData);
            return { id: choreRef.id, ...cloneData };
        }
        return null;
    }

    async addComment(id, text, dayIndex = null) {
        const user = this.store.authService.getUser();
        if (!this.store.activeFamilyId || !user) return;

        const chore = this.store.chores.find(c => c.id === id);
        if (!chore) return;

        // Use a robust UUID generation fallback
        const commentId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const newComment = {
            id: commentId,
            text,
            authorId: user.uid,
            authorName: user.displayName || (user.isAnonymous ? 'Kid' : 'Parent'),
            timestamp: Date.now()
        };

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', id);

        try {
            if (dayIndex !== null) {
                const dayKey = String(dayIndex);
                const status = (chore.statusByDay && (chore.statusByDay[dayKey] || chore.statusByDay[dayIndex])) || 'PENDING';
                if (status === 'APPROVED') return; // Read-only after approval

                // Ensure we check both number and string keys from existing data
                const existingComments = (chore.commentsByDay && (chore.commentsByDay[dayKey] || chore.commentsByDay[dayIndex]))
                    ? [...(chore.commentsByDay[dayKey] || chore.commentsByDay[dayIndex])]
                    : [];

                existingComments.push(newComment);
                await updateDoc(choreRef, { [`commentsByDay.${dayKey}`]: existingComments });
            } else {
                if (chore.status === 'APPROVED') return; // Read-only after approval
                const comments = chore.comments ? [...chore.comments] : [];
                comments.push(newComment);
                await updateDoc(choreRef, { comments });
            }
        } catch (err) {
            throw err;
        }
    }

    async updateComment(choreId, commentId, text, dayIndex = null) {
        if (!this.store.activeFamilyId) return;
        const chore = this.store.chores.find(c => c.id === choreId);
        if (!chore) return;

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', choreId);
        if (dayIndex !== null) {
            const dayKey = String(dayIndex);
            const status = (chore.statusByDay && (chore.statusByDay[dayKey] || chore.statusByDay[dayIndex])) || 'PENDING';
            if (status === 'APPROVED') return; // Read-only after approval

            const comments = (chore.commentsByDay && (chore.commentsByDay[dayKey] || chore.commentsByDay[dayIndex]));
            if (!comments || comments[comments.length - 1].id !== commentId) return; // Locked by reply

            const updated = comments.map(c =>
                c.id === commentId ? { ...c, text, timestamp: Date.now() } : c
            );
            await updateDoc(choreRef, { [`commentsByDay.${dayKey}`]: updated });
        } else {
            if (chore.status === 'APPROVED') return; // Read-only after approval
            if (!chore.comments) return;
            const comments = chore.comments;
            if (comments[comments.length - 1].id !== commentId) return; // Locked by reply

            const updated = comments.map(c =>
                c.id === commentId ? { ...c, text, timestamp: Date.now() } : c
            );
            await updateDoc(choreRef, { comments: updated });
        }
    }

    async deleteComment(choreId, commentId, dayIndex = null) {
        if (!this.store.activeFamilyId) return;
        const chore = this.store.chores.find(c => c.id === choreId);
        if (!chore) return;

        const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', choreId);
        if (dayIndex !== null) {
            const dayKey = String(dayIndex);
            const status = (chore.statusByDay && (chore.statusByDay[dayKey] || chore.statusByDay[dayIndex])) || 'PENDING';
            if (status === 'APPROVED') return; // Read-only after approval

            const comments = (chore.commentsByDay && (chore.commentsByDay[dayKey] || chore.commentsByDay[dayIndex]));
            if (!comments || comments[comments.length - 1].id !== commentId) return; // Locked by reply

            const updated = comments.filter(c => c.id !== commentId);
            await updateDoc(choreRef, { [`commentsByDay.${dayKey}`]: updated });
        } else {
            if (chore.status === 'APPROVED') return; // Read-only after approval
            if (!chore.comments) return;
            const comments = chore.comments;
            if (comments[comments.length - 1].id !== commentId) return; // Locked by reply

            const updated = comments.filter(c => c.id !== commentId);
            await updateDoc(choreRef, { comments: updated });
        }
    }
}
