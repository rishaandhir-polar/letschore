import { db, collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, where } from './firebase-config.js';
import { SyncStoreChores } from './sync-store-chores.js';
import { SyncStoreAdmin } from './sync-store-admin.js';
import { SyncStoreRefresh } from './sync-store-refresh.js';

export class SyncStore {
    constructor(authService) {
        this.authService = authService;
        this.subscribers = [];
        this.chores = [];
        this.wallet = 0;
        this.history = [];
        this.unsubscribeChores = null;
        this.unsubscribeData = null;

        this.choresModule = new SyncStoreChores(this);
        this.adminModule = new SyncStoreAdmin(this);
        this.refreshModule = new SyncStoreRefresh(this);

        this.authService.onAuthStateChanged((user) => this._loadDataForUser(user));
        // Only load if user is already available, otherwise wait for listener
        const initialUser = this.authService.getUser();
        if (initialUser) {
            this._loadDataForUser(initialUser);
        }
    }

    _loadDataForUser(user) {
        if (this.unsubscribeChores) this.unsubscribeChores();
        if (this.unsubscribeData) this.unsubscribeData();

        if (!user) {
            this.chores = []; this.wallet = 0; this.history = []; this._notify();
            return;
        }

        if (user.isAnonymous) {
            this._setupAnonymousSync(user);
        } else {
            this._setupAdminSync(user);
        }
    }

    _setupAnonymousSync(user) {
        if (!user.invite) { this._loadDataForUser(null); return; }
        const q = query(collection(db, 'families'), where('inviteCode', '==', user.invite));
        this.unsubscribeData = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const familyDoc = snapshot.docs[0];
                this.activeFamilyId = familyDoc.id;
                this._syncFamilyData(familyDoc.data());
                this._syncChores();
            } else {
                this.chores = []; this.activeFamilyId = null; this._notify();
            }
        });
    }

    async _setupAdminSync(user) {
        const uid = user.uid;

        // 1. If we have an invite code, PRIORITIZE it to "latch" onto the right family
        if (this.authService.adminInviteCode) {
            const q = query(collection(db, 'families'), where('inviteCode', '==', this.authService.adminInviteCode));
            const inviteUnsub = onSnapshot(q, async (snapshot) => {
                if (!snapshot.empty) {
                    const familyDoc = snapshot.docs[0];
                    this.activeFamilyId = familyDoc.id;
                    const data = familyDoc.data();

                    // Add ourselves to the admins array immediately
                    await this._ensureAdmin(uid, data.admins);

                    // Clear the code and KILL THIS SUBSCRIBER
                    this.authService.clearAdminInvite();
                    inviteUnsub();

                    // Switch to main listener
                    this._setupAdminSync(user);
                } else {
                    // Invalid code, clear it and fallback
                    this.authService.clearAdminInvite();
                    inviteUnsub();
                    this._setupAdminSync(user);
                }
            });
            this.unsubscribeData = inviteUnsub;
            return;
        }

        // 2. Normal Admin Sync (query by explicit admin membership)
        const q = query(collection(db, 'families'), where('admins', 'array-contains', uid));

        this.unsubscribeData = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const familyDoc = snapshot.docs[0];
                this.activeFamilyId = familyDoc.id;
                this._syncFamilyData(familyDoc.data());
                this._syncChores();
            } else {
                // Not an admin anywhere yet. Solo mode.
                this._initializeNewFamily(uid);
            }
        });
    }

    _initializeNewFamily(uid) {
        this.activeFamilyId = uid;
        const ref = doc(db, 'families', uid);
        this.unsubscribeData = onSnapshot(ref, (snap) => {
            const data = snap.exists() ? snap.data() : { wallet: 0, history: [] };
            this._syncFamilyData(data);
            const admins = data.admins || [];
            if (!admins.includes(uid)) setDoc(ref, { ...data, inviteCode: crypto.randomUUID().split('-')[0], admins: [...admins, uid] }, { merge: true });
            this._syncChores();
        });
    }

    _syncFamilyData(data) {
        this.wallet = data.wallet || 0;
        this.history = data.history || [];
        this.inviteCode = data.inviteCode;
        this._notify();
    }

    _syncChores() {
        if (this.unsubscribeChores) this.unsubscribeChores();
        const ref = collection(db, 'families', this.activeFamilyId, 'chores');
        this.unsubscribeChores = onSnapshot(query(ref, orderBy('createdAt', 'asc')), (snap) => {
            this.chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this._notify();
        });
    }

    async _ensureAdmin(uid, admins = []) {
        if (!admins.includes(uid)) {
            await updateDoc(doc(db, 'families', this.activeFamilyId), { admins: [...admins, uid] });
        }
    }

    async _updateFamilyData(updates) { await this.adminModule._updateFamilyData(updates); }

    // Delegation to Modules
    async addChore(...args) { return this.choresModule.addChore(...args); }
    async toggleChore(...args) { return this.choresModule.toggleChore(...args); }
    async approveChore(...args) { return this.choresModule.approveChore(...args); }
    async rejectChore(...args) { return this.choresModule.rejectChore(...args); }
    async deleteChore(...args) { return this.choresModule.deleteChore(...args); }
    async updateChore(...args) { return this.choresModule.updateChore(...args); }
    async cloneChore(...args) { return this.choresModule.cloneChore(...args); }

    async addComment(...args) { return this.choresModule.addComment(...args); }
    async updateComment(...args) { return this.choresModule.updateComment(...args); }
    async deleteComment(...args) { return this.choresModule.deleteComment(...args); }

    async payAmount(amount) { return this.adminModule.payAmount(amount); }
    async resetInviteCode() { return this.adminModule.resetInviteCode(); }
    async clearAll() { return this.adminModule.clearAll(); }

    checkRefreshes(time) { return this.refreshModule.checkRefreshes(time); }

    // Subscriptions and Getters
    subscribe(cb) { this.subscribers.push(cb); }
    _notify() { this.subscribers.forEach(cb => cb()); }
    getInviteCode() { return this.inviteCode; }
    getTotalOwed() { return this.wallet; }
    getHistory() { return this.history; }
    setTheme(t) { localStorage.setItem('chorely_theme', t); }
    getTheme() { return localStorage.getItem('chorely_theme') || 'cyber'; }
    getChores() {
        const matrix = { 'high': 0, 'medium': 1, 'low': 2 };
        return [...this.chores].sort((a, b) => matrix[a.priority] - matrix[b.priority]);
    }

    getStats() {
        const total = this.chores.length;
        if (total === 0) return { total: 0, completed: 0, pending: 0, percent: 0, totalOwed: this.wallet };
        const currentDay = new Date().getDay();
        let completed = 0, pending = 0;
        this.chores.forEach(c => {
            const status = (c.scheduledDays && c.scheduledDays.includes(currentDay))
                ? (c.statusByDay?.[currentDay] || 'PENDING') : c.status;
            if (status === 'APPROVED') completed++;
            if (status === 'PENDING_APPROVAL') pending++;
        });
        return { total, completed, pending, percent: Math.round((completed / total) * 100), totalOwed: this.wallet };
    }
}
