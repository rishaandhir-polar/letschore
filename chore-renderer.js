export class ChoreRenderer {
    constructor(listElement, statsElement, progressBar, bankElement, historyListElement, authService) {
        this.listElement = listElement;
        this.statsElement = statsElement;
        this.progressBar = progressBar;
        this.bankElement = bankElement;
        this.historyListElement = historyListElement;
        this.authService = authService;
        this.payBtn = document.getElementById('pay-kid-btn');
        this.expandedThreads = new Set(); // Track which threads are expanded (choreId-dayIndex)
    }

    render(chores, stats, historyData = []) {
        this.listElement.innerHTML = '';
        const user = this.authService ? this.authService.getUser() : null;
        const isAdmin = user && !user.isAnonymous;

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = new Date().getDay();
        const daysOrder = [];
        for (let i = 0; i < 7; i++) {
            daysOrder.push((today + i) % 7);
        }

        const groups = [];

        daysOrder.forEach(dayIndex => {
            const dayChores = chores.filter(c => c.scheduledDays && c.scheduledDays.includes(dayIndex));
            if (dayChores.length > 0) {
                const dayName = dayIndex === today ? `Today (${days[dayIndex]})` : days[dayIndex];
                groups.push({ name: dayName, chores: dayChores, dayIndex });
            }
        });

        const unscheduled = chores.filter(c => !c.scheduledDays || c.scheduledDays.length === 0);
        if (unscheduled.length > 0) {
            groups.push({ name: 'Anytime / Unscheduled', chores: unscheduled });
        }

        if (groups.length === 0) {
            this.listElement.innerHTML = `<li class="chore-item" style="justify-content: center; color: var(--text-secondary); padding: 2rem;">No chores found.</li>`;
        }

        groups.forEach(group => {
            const header = document.createElement('h3');
            header.className = 'list-element-header';
            header.style.color = 'var(--text-secondary)';
            header.style.marginTop = '1.5rem';
            header.style.marginBottom = '0.5rem';
            header.style.fontSize = '0.9rem';
            header.style.textTransform = 'uppercase';
            header.style.letterSpacing = '1px';
            header.style.paddingLeft = '1rem';
            header.textContent = group.name;
            this.listElement.appendChild(header);

            group.chores.forEach(chore => {
                const item = this.createChoreElement(chore, isAdmin, group.dayIndex);
                this.listElement.appendChild(item);
            });
        });

        this.updateStats(stats);
        this.renderHistory(historyData);
    }

    renderHistory(historyData) {
        if (!this.historyListElement) return;
        this.historyListElement.innerHTML = '';

        historyData.forEach(item => {
            const li = document.createElement('li');
            li.className = `history-item ${item.type === 'payment' ? 'payment' : 'earning'}`;
            // Added date to history item
            const dateStr = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
            const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const operator = item.value >= 0 ? '+' : '';

            li.innerHTML = `
                <div class="history-info">
                    <strong>${this.filterAndEscape(item.title)}</strong>
                    <div class="history-time">${dateStr} @ ${timeStr}</div>
                </div>
                <div class="history-amount">${operator}$${Math.abs(item.value).toFixed(2)}</div>
            `;
            this.historyListElement.appendChild(li);
        });
    }

    getIcon(title) {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('dish') || lowerTitle.includes('wash')) return '🧽';
        if (lowerTitle.includes('trash') || lowerTitle.includes('garbage')) return '🗑️';
        if (lowerTitle.includes('dog') || lowerTitle.includes('pet') || lowerTitle.includes('walk')) return '🐕';
        if (lowerTitle.includes('cat')) return '🐈';
        if (lowerTitle.includes('floor') || lowerTitle.includes('vacuum') || lowerTitle.includes('sweep')) return '🧹';
        if (lowerTitle.includes('bed')) return '🛏️';
        if (lowerTitle.includes('laundry') || lowerTitle.includes('clothes')) return '🧺';
        if (lowerTitle.includes('garden') || lowerTitle.includes('mow') || lowerTitle.includes('grass')) return '🌱';
        if (lowerTitle.includes('study') || lowerTitle.includes('homework') || lowerTitle.includes('book')) return '📚';
        if (lowerTitle.includes('clean') || lowerTitle.includes('tidy')) return '✨';
        if (lowerTitle.includes('cook') || lowerTitle.includes('dinner') || lowerTitle.includes('meal')) return '🍳';
        return '🎯'; // Default icon
    }

    createChoreElement(chore, isAdmin, targetDayIndex = null) {
        const li = document.createElement('li');
        const authUser = this.authService ? this.authService.getUser() : null;
        const user = authUser || { uid: 'anonymous', isAnonymous: true, displayName: 'Kid' };

        let dailyStatus = chore.status;
        if (targetDayIndex !== null) {
            dailyStatus = (chore.statusByDay && chore.statusByDay[targetDayIndex])
                ? chore.statusByDay[targetDayIndex]
                : 'PENDING';
        }

        const isDone = dailyStatus === 'APPROVED';

        li.className = `chore-item ${isDone ? 'done' : ''} ${dailyStatus === 'PENDING_APPROVAL' ? 'pending-approval' : ''}`;
        li.dataset.id = chore.id;
        if (targetDayIndex !== null) li.dataset.day = targetDayIndex;

        const icon = this.getIcon(chore.title);

        let refreshStr = '';
        if (chore.refreshIntervalMs > 0 && chore.refreshConfig) {
            const { days, hours, minutes } = chore.refreshConfig;
            const parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            refreshStr = `Every ${parts.join(' ')}`;
        }

        let scheduledStr = '';
        if (chore.scheduledDays && chore.scheduledDays.length > 0) {
            const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            scheduledStr = chore.scheduledDays.map(d => daysMap[d]).join(', ');
        }

        let leadingAction = '';
        let trailingActions = '';

        if (isAdmin) {
            if (dailyStatus === 'PENDING_APPROVAL') {
                leadingAction = `
                    <div style="display: flex; gap: 4px;">
                        <button class="action-btn approve-btn" aria-label="Approve ${chore.title}" title="Approve Task" style="color: var(--success); border-color: var(--success);">✔</button>
                        <button class="action-btn reject-btn" aria-label="Reject ${chore.title}" title="Reject Task" style="color: var(--destructive); border-color: var(--destructive);">✖</button>
                    </div>
                `;
            } else {
                leadingAction = `<div style="width: 24px;"></div>`;
            }
            trailingActions = `
                <button class="action-btn clone-btn" title="Clone Task" aria-label="Clone ${chore.title}">📋</button>
                <button class="action-btn edit-btn" title="Edit Task" aria-label="Edit ${chore.title}">✏️</button>
                <button class="delete-btn" title="Delete Task" aria-label="Delete ${chore.title}">&times;</button>
            `;
        } else {
            // Client View
            if (dailyStatus === 'PENDING') {
                leadingAction = `<input type="checkbox" class="chore-checkbox" aria-label="Complete ${chore.title}">`;
            } else if (dailyStatus === 'PENDING_APPROVAL') {
                leadingAction = `<div style="font-size: 0.8rem; color: var(--text-secondary); padding: 0 4px;">Waiting...</div>`;
            } else {
                leadingAction = `<input type="checkbox" class="chore-checkbox" checked disabled aria-label="Completed ${chore.title}">`;
            }
            trailingActions = ``;
        }

        // Render comments
        const commentsArr = (targetDayIndex !== null && chore.commentsByDay)
            ? (chore.commentsByDay[targetDayIndex] || chore.commentsByDay[String(targetDayIndex)] || [])
            : (chore.comments || []);

        const threadId = `${chore.id}-${targetDayIndex ?? 'all'}`;
        const isExpanded = this.expandedThreads.has(threadId);

        const commentsHtml = `
            <div class="chore-comments" style="display: flex !important; visibility: visible !important;">
                <div class="comments-header">
                    <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">
                        ${commentsArr.length} Comment${commentsArr.length !== 1 ? 's' : ''}
                    </span>
                    ${commentsArr.length > 0 ? `
                        <button class="toggle-comments-btn">${isExpanded ? 'Collapse' : 'Expand'}</button>
                    ` : ''}
                </div>
                
                <div class="comments-thread ${isExpanded ? 'expanded' : 'collapsed'}" ${!isExpanded ? 'style="display: none;"' : ''}>
                    ${commentsArr.length > 0 ? commentsArr.map((comment, index) => {
            const isAuthor = user && user.uid === comment.authorId;
            const isLast = index === commentsArr.length - 1;
            const time = new Date(comment.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `
                            <div class="comment-bubble" data-comment-id="${comment.id}">
                                <div class="comment-author" style="color: ${comment.authorName === 'Kid' ? '#40c4ff' : 'var(--accent)'}">${this.filterAndEscape(comment.authorName)}</div>
                                <div class="comment-text">${this.filterAndEscape(comment.text)}</div>
                                <div class="comment-meta">
                                    <span>${time}</span>
                                    ${isAuthor && isLast && !isDone ? `
                                        <div class="comment-actions">
                                            <button class="comment-edit-btn" title="Edit Comment">Edit</button>
                                            <button class="comment-delete-btn" title="Delete Comment">Delete</button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
        }).join('') : '<div style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7; font-style: italic;">Be the first to comment!</div>'}
                </div>
                ${!isDone ? `<button class="add-comment-inline-btn" style="margin-top: 0.5rem;">+ Add Comment</button>` : ''}
            </div>
        `;

        li.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%; gap: 1rem; margin-bottom: 0.5rem;">
                ${leadingAction}
                <div class="chore-icon-wrapper">${icon}</div>
                <div class="chore-content">
                    <h3 class="chore-title">${this.filterAndEscape(chore.title)}</h3>
                    <div class="chore-meta">
                        <span class="chore-value-badge">$${chore.value.toFixed(2)}</span>
                        ${chore.assignee ? `<span class="chore-refresh-badge assignee-badge">👤 ${this.filterAndEscape(chore.assignee)}</span>` : ''}
                        ${scheduledStr ? `<span class="chore-refresh-badge scheduled-badge">📅 ${scheduledStr}</span>` : ''}
                        ${refreshStr ? `<span class="chore-refresh-badge">${refreshStr}</span>` : ''}
                        <span class="chore-badge badge-${chore.priority}">${chore.priority}</span>
                    </div>
                </div>
                ${trailingActions ? `<div class="chore-actions">${trailingActions}</div>` : ''}
            </div>
            ${commentsHtml}
        `;

        return li;
    }

    updateStats(stats) {
        this.statsElement.textContent = `${stats.percent}% Completed`;
        this.progressBar.style.width = `${stats.percent}%`;
        if (this.bankElement) {
            this.bankElement.textContent = `$${stats.totalOwed.toFixed(2)}`;
        }

        const user = this.authService ? this.authService.getUser() : null;
        const isAdmin = user && !user.isAnonymous;
        if (this.payBtn) {
            this.payBtn.style.display = isAdmin ? 'block' : 'none';
        }
    }

    filterAndEscape(text) {
        return this.escapeHtml(text || '');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
