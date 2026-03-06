export class ChoreEvents {
    constructor(store, renderer, uiSystem, authService) {
        this.store = store;
        this.renderer = renderer;
        this.uiSystem = uiSystem;
        this.authService = authService;
        this.currentFilter = 'all';
        this.currentSearch = '';
    }

    init() {
        this.bindForm();
        this.bindListActions();
        this.bindFilters();
        this.bindSearch();
        this.bindReset();
        this.bindThemeSwitcher();
        this.applyTheme(this.store.getTheme());

        const user = this.authService ? this.authService.getUser() : null;
        if (user && user.isAnonymous) {
            const addSection = document.querySelector('.add-chore-section');
            if (addSection) addSection.style.display = 'none';
        }

        // Subscribe to real-time store updates
        this.store.subscribe(() => {
            this.refresh(true);
        });

        this.refresh(true); // Force initial render

        // Heartbeat every 10 seconds for near-instant resets
        setInterval(() => {
            console.log('%c Let\'s Chore %c Heartbeat Sync ', 'background: #7c4dff; color: white; border-radius: 3px 0 0 3px; font-weight: bold;', 'background: #1a1b24; color: #7c4dff; border-radius: 0 3px 3px 0; border: 1px solid #7c4dff;');

            const statusLine = document.getElementById('status-line');
            if (statusLine) {
                const now = new Date();
                statusLine.textContent = `Sync Active: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            }

            this.refresh(false); // Silent refresh - only re-renders if a chore actually resets
        }, 10000);
    }

    bindReset() {
        const resetBtn = document.getElementById('reset-data');
        if (!resetBtn) return;

        resetBtn.addEventListener('click', async () => {
            const user = this.authService.getUser();
            if (!user || user.isAnonymous) {
                this.uiSystem.notify('Access Denied', 'Only admins can reset the family database.');
                return;
            }
            const confirmed = await this.uiSystem.confirm('Clear all chores, history, and wallet balance? This cannot be undone.');
            if (confirmed) {
                this.store.clearAll();
                this.refresh(true);
            }
        });
    }

    applyTheme(theme) {
        document.body.classList.forEach(cls => {
            if (cls.startsWith('theme-')) document.body.classList.remove(cls);
        });

        if (theme !== 'cyber') {
            document.body.classList.add(`theme-${theme}`);
        }

        document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.theme === theme);
        });
    }

    bindThemeSwitcher() {
        const switcher = document.querySelector('.theme-switcher');
        switcher.addEventListener('click', (e) => {
            const dot = e.target.closest('.theme-dot');
            if (dot) {
                const theme = dot.dataset.theme;
                this.store.setTheme(theme);
                this.applyTheme(theme);
            }
        });
    }

    bindForm() {
        const form = document.getElementById('add-chore-form');
        const input = document.getElementById('chore-input');
        const assigneeInput = document.getElementById('chore-assignee');
        const valueInput = document.getElementById('chore-value');
        const daysInput = document.getElementById('refresh-days');
        const hoursInput = document.getElementById('refresh-hours');
        const minutesInput = document.getElementById('refresh-minutes');
        const priority = document.getElementById('priority-select');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = input.value.trim();
            const assignee = assigneeInput ? assigneeInput.value.trim() : '';

            const scheduledDays = [];
            document.querySelectorAll('#add-day-picker input:checked').forEach(cb => {
                scheduledDays.push(parseInt(cb.value));
            });

            const value = valueInput.value || 0;
            const d = daysInput.value || 0;
            const h = hoursInput.value || 0;
            const m = minutesInput.value || 0;

            if (title) {
                this.store.addChore(title, assignee, scheduledDays, priority.value, value, d, h, m);
                input.value = '';
                if (assigneeInput) assigneeInput.value = '';
                document.querySelectorAll('#add-day-picker input:checked').forEach(cb => cb.checked = false);
                valueInput.value = '';
                daysInput.value = '';
                hoursInput.value = '';
                minutesInput.value = '';
                this.refresh(true);
                this.uiSystem.notify('Task Added', `Added "${title}" bounty.`);
            }
        });
    }

    bindListActions() {
        const list = document.getElementById('chore-list');
        list.addEventListener('click', async (e) => {
            const item = e.target.closest('.chore-item');
            if (!item) return;

            const id = item.dataset.id;
            const dayIndex = item.dataset.day ? parseInt(item.dataset.day) : null;
            const chore = this.store.getChores().find(c => c.id === id);

            if (e.target.classList.contains('chore-checkbox')) {
                this.store.toggleChore(id, dayIndex);
                // Re-calculating status for notification
                const updatedChore = this.store.getChores().find(c => c.id === id);
                const dailyStatus = (dayIndex !== null && updatedChore.statusByDay) ? updatedChore.statusByDay[dayIndex] : updatedChore.status;

                if (dailyStatus === 'PENDING_APPROVAL') {
                    this.uiSystem.notify('Sent for Approval', `"${chore.title}" is waiting for admin approval.`);
                }
                this.refresh(true);
            } else if (e.target.classList.contains('approve-btn')) {
                this.store.approveChore(id, dayIndex);
                this.uiSystem.notify('Approved!', `Approved "${chore.title}" and paid $${chore.value.toFixed(2)}.`);
                this.refresh(true);
            } else if (e.target.classList.contains('reject-btn')) {
                const targetName = chore.assignee ? `sent back to ${chore.assignee}.` : 'sent back to To-Do.';
                this.store.rejectChore(id, dayIndex);
                this.uiSystem.notify('Task Rejected', `"${chore.title}" ${targetName}`);
                this.refresh(true);
            } else if (e.target.classList.contains('delete-btn')) {
                const confirmed = await this.uiSystem.confirm(`Delete "${chore.title}"? This cannot be undone.`);
                if (confirmed) {
                    this.store.deleteChore(id);
                    this.refresh(true);
                }
            } else if (e.target.classList.contains('edit-btn')) {
                this.openEditModal(chore);
            } else if (e.target.classList.contains('clone-btn')) {
                this.store.cloneChore(id);
                this.refresh(true);
                this.uiSystem.notify('Task Cloned', `Created a copy of "${chore.title}".`);
            }
        });

        this.bindEditForm();
    }

    bindEditForm() {
        const form = document.getElementById('edit-chore-form');
        const cancelBtn = document.getElementById('edit-cancel');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = form.dataset.editingId;

            const scheduledDays = [];
            document.querySelectorAll('#edit-day-picker input:checked').forEach(cb => {
                scheduledDays.push(parseInt(cb.value));
            });

            const updates = {
                title: document.getElementById('edit-chore-title').value.trim(),
                assignee: document.getElementById('edit-chore-assignee') ? document.getElementById('edit-chore-assignee').value.trim() : '',
                scheduledDays,
                value: parseFloat(document.getElementById('edit-chore-value').value) || 0,
                priority: document.getElementById('edit-priority').value,
                refreshConfig: {
                    days: parseInt(document.getElementById('edit-refresh-days').value) || 0,
                    hours: parseInt(document.getElementById('edit-refresh-hours').value) || 0,
                    minutes: parseInt(document.getElementById('edit-refresh-minutes').value) || 0
                }
            };

            this.store.updateChore(id, updates);
            this.closeEditModal();
            this.refresh(true);
            this.uiSystem.notify('Changes Saved', `Updated "${updates.title}".`);
        });

        cancelBtn.addEventListener('click', () => this.closeEditModal());
    }

    openEditModal(chore) {
        const modal = document.getElementById('edit-modal-container');
        const form = document.getElementById('edit-chore-form');

        form.dataset.editingId = chore.id;
        document.getElementById('edit-chore-title').value = chore.title;
        const editAssignee = document.getElementById('edit-chore-assignee');
        if (editAssignee) editAssignee.value = chore.assignee || '';
        document.getElementById('edit-chore-value').value = chore.value;
        document.getElementById('edit-priority').value = chore.priority;

        document.querySelectorAll('#edit-day-picker input').forEach(cb => {
            cb.checked = chore.scheduledDays && chore.scheduledDays.includes(parseInt(cb.value));
        });

        const config = chore.refreshConfig || { days: 0, hours: 0, minutes: 0 };
        document.getElementById('edit-refresh-days').value = config.days || '';
        document.getElementById('edit-refresh-hours').value = config.hours || '';
        document.getElementById('edit-refresh-minutes').value = config.minutes || '';

        modal.classList.remove('hidden');
    }

    closeEditModal() {
        const modal = document.getElementById('edit-modal-container');
        modal.classList.add('hidden');
    }

    bindFilters() {
        const filterContainer = document.querySelector('.filters');
        filterContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.refresh(true);
            }
        });
    }

    bindSearch() {
        const searchInput = document.getElementById('chore-search');
        searchInput.addEventListener('input', (e) => {
            this.currentSearch = e.target.value.toLowerCase().trim();
            this.refresh(true); // Force render on search
        });
    }

    refresh(force = false) {
        const refreshedTasks = this.store.checkRefreshes();

        if (refreshedTasks.length > 0) {
            this.uiSystem.notify('Smart Reminder', `${refreshedTasks.length} task(s) ready to be done again: ${refreshedTasks.join(', ')}`);
        }

        // Optimization: Don't re-render everything if nothing refreshed and not forced
        if (!force && refreshedTasks.length === 0) {
            return;
        }

        let chores = this.store.getChores();

        // 1. Apply Search Filter
        if (this.currentSearch) {
            chores = chores.filter(c =>
                c.title.toLowerCase().includes(this.currentSearch) ||
                (c.assignee && c.assignee.toLowerCase().includes(this.currentSearch))
            );
        }

        // 2. Apply Category Filter (Day-Aware)
        const today = new Date().getDay();
        if (this.currentFilter !== 'all') {
            chores = chores.filter(c => {
                let status;
                if (c.scheduledDays && c.scheduledDays.includes(today)) {
                    status = (c.statusByDay && c.statusByDay[today]) ? c.statusByDay[today] : 'PENDING';
                } else {
                    status = c.status;
                }

                if (this.currentFilter === 'todo') return status !== 'APPROVED';
                if (this.currentFilter === 'done') return status === 'APPROVED';
                return true;
            });
        }

        const stats = this.store.getStats();
        const history = this.store.getHistory();
        this.renderer.render(chores, stats, history);
    }
}
