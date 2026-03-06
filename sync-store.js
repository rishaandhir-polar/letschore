import { db, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where } from './firebase-config.js';

export class SyncStore {
    constructor(authService) {
        this.authService = authService;
        this.subscribers = [];

        this.chores = [];
        this.wallet = 0;
        this.history = [];

        this.unsubscribeChores = null;
        this.unsubscribeData = null;

        this.authService.onAuthStateChanged((user) => {
            this._loadDataForUser(user);
        });

        this._loadDataForUser(this.authService.getUser());
    }

    _loadDataForUser(user) {
        if (this.unsubscribeChores) this.unsubscribeChores();
        if (this.unsubscribeData) this.unsubscribeData();

        if (!user) {
            this.chores = [];
            this.wallet = 0;
            this.history = [];
            this._notify();
            return;
        }

        if (user.isAnonymous) {
            if (!user.invite) {
                this._loadDataForUser(null);
                return;
            }
            const q = query(collection(db, 'families'), where('inviteCode', '==', user.invite));
            this.unsubscribeData = onSnapshot(q, (snapshot) => {
                if (!snapshot.empty) {
                    const familyDoc = snapshot.docs[0];
                    const data = familyDoc.data();
                    this.wallet = data.wallet || 0;
                    this.history = data.history || [];
                    this.activeFamilyId = familyDoc.id;

                    if (this.unsubscribeChores) this.unsubscribeChores();
                    const choresListRef = collection(db, 'families', this.activeFamilyId, 'chores');
                    this.unsubscribeChores = onSnapshot(query(choresListRef, orderBy('createdAt', 'asc')), (choreSnap) => {
                        this.chores = choreSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        this._notify();
                    });
                } else {
                    this.chores = [];
                    this.activeFamilyId = null;
                    this._notify();
                }
            });
        } else {
            const uid = user.uid;

            let familyQuery;
            if (this.authService.adminInviteCode) {
                familyQuery = query(collection(db, 'families'), where('inviteCode', '==', this.authService.adminInviteCode));
            } else {
                familyQuery = query(collection(db, 'families'), where('admins', 'array-contains', uid));
            }

            this.unsubscribeData = onSnapshot(familyQuery, (snapshot) => {
                if (!snapshot.empty) {
                    const familyDoc = snapshot.docs[0];
                    this.activeFamilyId = familyDoc.id;
                    const data = familyDoc.data();

                    if (this.authService.adminInviteCode) {
                        const admins = data.admins || [];
                        if (!admins.includes(uid)) {
                            updateDoc(doc(db, 'families', this.activeFamilyId), {
                                admins: [...admins, uid]
                            });
                        }
                        this.authService.clearAdminInvite();
                    }

                    this.wallet = data.wallet || 0;
                    this.history = data.history || [];
                    this.inviteCode = data.inviteCode;

                    if (this.unsubscribeChores) this.unsubscribeChores();
                    const choresListRef = collection(db, 'families', this.activeFamilyId, 'chores');
                    this.unsubscribeChores = onSnapshot(query(choresListRef, orderBy('createdAt', 'asc')), (choreSnap) => {
                        this.chores = choreSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        this._notify();
                    });
                    this._notify();
                } else {
                    if (this.authService.adminInviteCode) {
                        this.authService.clearAdminInvite();
                        this._loadDataForUser(user);
                        return;
                    }

                    this.activeFamilyId = uid;
                    const familyDocRef = doc(db, 'families', uid);

                    if (this.unsubscribeData) this.unsubscribeData();

                    this.unsubscribeData = onSnapshot(familyDocRef, (docSnap) => {
                        let data = docSnap.exists() ? docSnap.data() : { wallet: 0, history: [] };
                        this.wallet = data.wallet || 0;
                        this.history = data.history || [];
                        this.inviteCode = data.inviteCode || crypto.randomUUID().split('-')[0];

                        const admins = data.admins || [];
                        if (!admins.includes(uid)) {
                            setDoc(familyDocRef, { ...data, inviteCode: this.inviteCode, admins: [...admins, uid] }, { merge: true });
                        }

                        if (this.unsubscribeChores) this.unsubscribeChores();
                        const choresListRef = collection(familyDocRef, 'chores');
                        this.unsubscribeChores = onSnapshot(query(choresListRef, orderBy('createdAt', 'asc')), (choreSnap) => {
                            this.chores = choreSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                            this._notify();
                        });
                        this._notify();
                    });
                }
            });
        }
    }

    async _updateFamilyData(updates) {
        if (!this.activeFamilyId) return;
        const familyDocRef = doc(db, 'families', this.activeFamilyId);
        await updateDoc(familyDocRef, updates);
    }

    async resetInviteCode() {
        if (!this.activeFamilyId) return;
        const newCode = crypto.randomUUID().split('-')[0];
        await this._updateFamilyData({ inviteCode: newCode });
    }

    getInviteCode() {
        return this.inviteCode;
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    _notify() {
        this.subscribers.forEach(cb => cb());
    }

    getChores() {
        const priorityMatrix = { 'high': 0, 'medium': 1, 'low': 2 };
        return [...this.chores].sort((a, b) => {
            return priorityMatrix[a.priority] - priorityMatrix[b.priority];
        });
    }

    async addChore(title, assignee, scheduledDays, priority, value = 0, days = 0, hours = 0, minutes = 0) {
        if (!this.activeFamilyId) return null;

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

        const choreRef = doc(collection(doc(db, 'families', this.activeFamilyId), 'chores'));
        await setDoc(choreRef, choreData);

        return { id: choreRef.id, ...choreData };
    }

    async toggleChore(id, dayIndex = null) {
        if (!this.activeFamilyId) return;

        const chore = this.chores.find(c => c.id === id);
        if (!chore) return;

        let currentStatus;
        if (dayIndex !== null) {
            currentStatus = (chore.statusByDay && chore.statusByDay[dayIndex]) ? chore.statusByDay[dayIndex] : 'PENDING';
        } else {
            currentStatus = chore.status;
        }

        let newStatus = currentStatus === 'PENDING' ? 'PENDING_APPROVAL' : 'PENDING';

        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', id);
        if (dayIndex !== null) {
            await updateDoc(choreRef, {
                [`statusByDay.${dayIndex}`]: newStatus
            });
        } else {
            await updateDoc(choreRef, { status: newStatus });
        }
    }

    async approveChore(id, dayIndex = null) {
        const user = this.authService.getUser();
        if (!this.activeFamilyId || !user || user.isAnonymous) return;

        const chore = this.chores.find(c => c.id === id);
        if (!chore) return;

        let currentStatus;
        if (dayIndex !== null) {
            currentStatus = (chore.statusByDay && chore.statusByDay[dayIndex]) ? chore.statusByDay[dayIndex] : 'PENDING';
        } else {
            currentStatus = chore.status;
        }

        if (currentStatus !== 'PENDING_APPROVAL') return;

        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', id);
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

        const newWallet = Math.max(0, (Math.round(this.wallet * 100) + Math.round(chore.value * 100)) / 100);

        const updatedHistory = [{
            id: crypto.randomUUID(),
            choreId: chore.id,
            title: chore.title,
            value: chore.value,
            timestamp: now,
            approvedBy: user.uid
        }, ...this.history].slice(0, 50);

        await this._updateFamilyData({
            wallet: newWallet,
            history: updatedHistory
        });
    }

    async rejectChore(id, dayIndex = null) {
        if (!this.activeFamilyId) return;
        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', id);
        if (dayIndex !== null) {
            await updateDoc(choreRef, {
                [`statusByDay.${dayIndex}`]: 'PENDING'
            });
        } else {
            await updateDoc(choreRef, { status: 'PENDING' });
        }
    }

    async deleteChore(id) {
        if (!this.activeFamilyId) return;
        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', id);
        await deleteDoc(choreRef);
    }

    async clearAll() {
        if (!this.activeFamilyId) return;

        const user = this.authService.getUser();
        if (!user || user.isAnonymous) return;

        // Reset wallet and history
        await this._updateFamilyData({
            wallet: 0,
            history: []
        });

        // Delete all chores
        for (const chore of this.chores) {
            const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', chore.id);
            await deleteDoc(choreRef);
        }
    }

    async updateChore(id, updates) {
        if (!this.activeFamilyId) return;

        if (updates.refreshConfig) {
            const { days, hours, minutes } = updates.refreshConfig;
            updates.refreshIntervalMs = (days * 24 * 3600000) + (hours * 3600000) + (minutes * 60000);
        }

        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', id);
        await updateDoc(choreRef, updates);
    }

    async cloneChore(id) {
        if (!this.activeFamilyId) return null;

        const original = this.chores.find(c => c.id === id);
        if (original) {
            const cloneData = {
                ...original,
                title: `${original.title} (Copy)`,
                status: 'PENDING',
                lastCompletedAt: null,
                createdAt: Date.now()
            };
            delete cloneData.id;

            const choreRef = doc(collection(doc(db, 'families', this.activeFamilyId), 'chores'));
            await setDoc(choreRef, cloneData);
            return { id: choreRef.id, ...cloneData };
        }
        return null;
    }

    checkRefreshes(currentTime = Date.now()) {
        const notifications = [];
        if (!this.activeFamilyId) return notifications;

        const currentDay = new Date(currentTime).getDay();
        const startOfToday = new Date(currentTime);
        startOfToday.setHours(0, 0, 0, 0);

        this.chores.forEach(async chore => {
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
                        const choreRef = doc(db, 'families', this.activeFamilyId, 'chores', chore.id);
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

    getTotalOwed() { return this.wallet; }
    getHistory() { return this.history; }

    setTheme(themeName) {
        localStorage.setItem('chorely_theme', themeName);
    }

    getTheme() {
        return localStorage.getItem('chorely_theme') || 'cyber';
    }

    getStats() {
        const totalCount = this.chores.length;
        if (totalCount === 0) return { total: 0, completed: 0, pending: 0, percent: 0, totalOwed: this.wallet };

        const currentDay = new Date().getDay();
        let completedCount = 0;
        let pendingCount = 0;

        this.chores.forEach(chore => {
            let status;
            if (chore.scheduledDays && chore.scheduledDays.includes(currentDay)) {
                status = (chore.statusByDay && chore.statusByDay[currentDay]) ? chore.statusByDay[currentDay] : 'PENDING';
            } else {
                status = chore.status;
            }

            if (status === 'APPROVED') completedCount++;
            if (status === 'PENDING_APPROVAL') pendingCount++;
        });

        return {
            total: totalCount,
            completed: completedCount,
            pending: pendingCount,
            percent: Math.round((completedCount / totalCount) * 100),
            totalOwed: this.wallet
        };
    }
}
