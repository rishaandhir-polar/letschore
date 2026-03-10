import { db, doc, updateDoc, deleteDoc } from './firebase-config.js';

export class SyncStoreAdmin {
    constructor(store) {
        this.store = store;
    }

    async _updateFamilyData(updates) {
        if (!this.store.activeFamilyId) return;
        const familyDocRef = doc(db, 'families', this.store.activeFamilyId);
        await updateDoc(familyDocRef, updates);
    }

    async payAmount(amount) {
        const user = this.store.authService.getUser();
        if (!this.store.activeFamilyId || !user || user.isAnonymous) return;

        const numericAmount = parseFloat(amount) || 0;
        if (numericAmount <= 0) return;

        const newWallet = (Math.round(this.store.wallet * 100) - Math.round(numericAmount * 100)) / 100;
        const now = Date.now();

        const updatedHistory = [{
            id: crypto.randomUUID(),
            title: 'Payment Received 💸',
            value: -numericAmount,
            type: 'payment',
            timestamp: now,
            approvedBy: user.uid
        }, ...this.store.history].slice(0, 50);

        await this._updateFamilyData({
            wallet: newWallet,
            history: updatedHistory
        });
    }

    async resetInviteCode() {
        if (!this.store.activeFamilyId) return;
        const newCode = crypto.randomUUID().split('-')[0];
        await this._updateFamilyData({ inviteCode: newCode });
    }

    async clearAll() {
        if (!this.store.activeFamilyId) return;

        const user = this.store.authService.getUser();
        if (!user || user.isAnonymous) return;

        // Reset wallet and history
        await this._updateFamilyData({
            wallet: 0,
            history: []
        });

        // Delete all chores
        for (const chore of this.store.chores) {
            const choreRef = doc(db, 'families', this.store.activeFamilyId, 'chores', chore.id);
            await deleteDoc(choreRef);
        }
    }
}
