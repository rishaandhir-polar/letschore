export class Store {
    constructor() {
        this.storageKey = 'chorely_chores';
        this.walletKey = 'chorely_wallet';
        this.historyKey = 'chorely_history';
        this.themeKey = 'chorely_theme';
        this.chores = this._load();
        this.wallet = parseFloat(localStorage.getItem(this.walletKey)) || 0;
        this.history = JSON.parse(localStorage.getItem(this.historyKey)) || [];
        this.theme = localStorage.getItem(this.themeKey) || 'cyber';
    }

    _load() {
        const saved = localStorage.getItem(this.storageKey);
        let chores = saved ? JSON.parse(saved) : [];

        // DATA MIGRATION: Convert old 'refreshInterval' (hours) to 'refreshIntervalMs'
        chores = chores.map(chore => {
            if (chore.refreshInterval !== undefined && chore.refreshIntervalMs === undefined) {
                chore.refreshIntervalMs = chore.refreshInterval * 60 * 60 * 1000;
                delete chore.refreshInterval;
            }
            return chore;
        });

        return chores;
    }

    _save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.chores));
        localStorage.setItem(this.walletKey, this.wallet.toString());
        localStorage.setItem(this.historyKey, JSON.stringify(this.history));
        localStorage.setItem(this.themeKey, this.theme);
    }

    setTheme(themeName) {
        this.theme = themeName;
        this._save();
    }

    getTheme() {
        return this.theme;
    }

    getChores() {
        const priorityMatrix = { 'high': 0, 'medium': 1, 'low': 2 };
        return [...this.chores].sort((a, b) => {
            return priorityMatrix[a.priority] - priorityMatrix[b.priority];
        });
    }

    addChore(title, priority, value = 0, days = 0, hours = 0, minutes = 0) {
        const normalizedValue = Math.round(parseFloat(value) * 100) / 100;

        const d = parseInt(days) || 0;
        const h = parseInt(hours) || 0;
        const m = parseInt(minutes) || 0;

        // Convert everything to milliseconds internally for 100% precision
        const intervalMs = (d * 24 * 60 * 60 * 1000) + (h * 60 * 60 * 1000) + (m * 60 * 1000);

        const newChore = {
            id: crypto.randomUUID(),
            title,
            priority,
            value: normalizedValue || 0,
            refreshIntervalMs: intervalMs,
            refreshConfig: { days: d, hours: h, minutes: m },
            completed: false,
            createdAt: Date.now(),
            lastCompletedAt: null
        };
        this.chores.push(newChore);
        this._save();
        return newChore;
    }

    toggleChore(id) {
        let moneyDelta = 0;
        this.chores = this.chores.map(chore => {
            if (chore.id === id) {
                const becomingCompleted = !chore.completed;
                const now = Date.now();

                if (becomingCompleted) {
                    moneyDelta = chore.value;
                    // Log to history
                    this.history.unshift({
                        id: crypto.randomUUID(),
                        choreId: chore.id,
                        title: chore.title,
                        value: chore.value,
                        timestamp: now
                    });
                    if (this.history.length > 50) this.history.pop();
                    return { ...chore, completed: true, lastCompletedAt: now };
                } else {
                    // Manual uncheck: Revoke bounty
                    moneyDelta = -chore.value;
                    const index = this.history.findIndex(entry => entry.choreId === id);
                    if (index !== -1) this.history.splice(index, 1);
                    return { ...chore, completed: false };
                }
            }
            return chore;
        });

        if (moneyDelta !== 0) {
            this.wallet = Math.max(0, (Math.round(this.wallet * 100) + Math.round(moneyDelta * 100)) / 100);
        }
        this._save();
    }

    checkRefreshes(currentTime = Date.now()) {
        const notifications = [];
        let changed = false;

        this.chores = this.chores.map(chore => {
            if (chore.completed && chore.refreshIntervalMs > 0 && chore.lastCompletedAt) {
                const timeSince = currentTime - chore.lastCompletedAt;
                const remaining = chore.refreshIntervalMs - timeSince;

                console.log(
                    `%c ⏳ Timer %c ${chore.title}: ${Math.round(timeSince / 1000)}s passed, ${Math.max(0, Math.round(remaining / 1000))}s left `,
                    'background: #40c4ff; color: #000; border-radius: 3px 0 0 3px; font-weight: bold;',
                    'background: #1a1b24; color: #40c4ff; border-radius: 0 3px 3px 0; border: 1px solid #40c4ff;'
                );

                if (timeSince >= chore.refreshIntervalMs) {
                    changed = true;
                    notifications.push(chore.title);
                    console.log(`%c ⚡ OVERDUE %c Resetting "${chore.title}" bounty! `, 'background: #ff5252; color: #fff; border-radius: 3px 0 0 3px; font-weight: bold;', 'background: #1a1b24; color: #ff5252; border-radius: 0 3px 3px 0; border: 1px solid #ff5252;');
                    return { ...chore, completed: false };
                }
            }
            return chore;
        });

        if (changed) this._save();
        return notifications;
    }

    getHistory() {
        return this.history;
    }

    deleteChore(id) {
        this.chores = this.chores.filter(chore => chore.id !== id);
        this._save();
    }

    updateChore(id, updates) {
        this.chores = this.chores.map(chore => {
            if (chore.id === id) {
                // If interval changed, recalculate MS
                if (updates.refreshConfig) {
                    const { days, hours, minutes } = updates.refreshConfig;
                    updates.refreshIntervalMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
                }
                return { ...chore, ...updates };
            }
            return chore;
        });
        this._save();
    }

    cloneChore(id) {
        const original = this.chores.find(c => c.id === id);
        if (original) {
            const clone = {
                ...original,
                id: crypto.randomUUID(),
                title: `${original.title} (Copy)`,
                completed: false,
                lastCompletedAt: null,
                createdAt: Date.now()
            };
            this.chores.push(clone);
            this._save();
            return clone;
        }
        return null;
    }

    getTotalOwed() {
        return this.wallet;
    }

    clearAll() {
        this.chores = [];
        this.wallet = 0;
        this.history = [];
        this._save();
    }

    getStats() {
        const totalCount = this.chores.length;
        const totalOwed = this.getTotalOwed();
        if (totalCount === 0) return { total: 0, completed: 0, percent: 0, totalOwed: 0 };

        const completedCount = this.chores.filter(c => c.completed).length;
        return {
            total: totalCount,
            completed: completedCount,
            percent: Math.round((completedCount / totalCount) * 100),
            totalOwed
        };
    }
}
