import { SyncStore } from './sync-store.js';
import { AuthService } from './auth-service.js';
import { ChoreRenderer } from './chore-renderer.js';
import { ChoreEvents } from './chore-events.js';
import { UISystem } from './ui-system.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authService = new AuthService();
    const uiSystem = new UISystem();

    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const roleIndicator = document.getElementById('role-indicator');
    const logoutBtn = document.getElementById('logout-btn');
    const inviteBtn = document.getElementById('invite-btn');
    const adminInviteBtn = document.getElementById('admin-invite-btn');
    const resetInviteBtn = document.getElementById('reset-invite-btn');
    const resetDataBtn = document.getElementById('reset-data');

    // Routing Logic
    authService.onAuthStateChanged((user) => {
        const hasAdminInvite = !!authService.adminInviteCode;

        if (!user || (user.isAnonymous && hasAdminInvite)) {
            authContainer.style.display = 'flex';
            appContainer.style.display = 'none';

            // Specialized message if they came from an admin link
            const title = authContainer.querySelector('h1');
            const subtitle = authContainer.querySelector('.subtitle');
            if (hasAdminInvite) {
                subtitle.textContent = "You've been invited as an Admin!";
                subtitle.style.color = "var(--accent)";
            } else {
                subtitle.textContent = "Secure Family Sync";
                subtitle.style.color = "var(--text-secondary)";
            }
        } else {
            authContainer.style.display = 'none';
            appContainer.style.display = 'flex';

            const addSection = document.querySelector('.add-chore-section');
            if (user.isAnonymous) {
                roleIndicator.textContent = 'CHILD';
                roleIndicator.style.color = 'var(--priority-med)';
                roleIndicator.style.borderColor = 'var(--priority-med)';
                if (addSection) addSection.style.display = 'none';
                if (inviteBtn) inviteBtn.style.display = 'none';
                if (adminInviteBtn) adminInviteBtn.style.display = 'none';
                if (resetInviteBtn) resetInviteBtn.style.display = 'none';
                if (resetDataBtn) resetDataBtn.style.display = 'none';
            } else {
                roleIndicator.textContent = 'PARENT';
                roleIndicator.style.color = 'var(--accent)';
                roleIndicator.style.borderColor = 'var(--accent)';
                if (addSection) addSection.style.display = 'block';
                if (inviteBtn) inviteBtn.style.display = 'block';
                if (adminInviteBtn) adminInviteBtn.style.display = 'block';
                if (resetInviteBtn) resetInviteBtn.style.display = 'block';
                if (resetDataBtn) resetDataBtn.style.display = 'inline-block';
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await authService.logout();
        // Drop the invite from the URL so they don't auto-login again
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
    });

    googleLoginBtn.addEventListener('click', async () => {
        await authService.loginWithGoogle();
    });

    await authService.init();

    const store = new SyncStore(authService);

    const listElement = document.getElementById('chore-list');
    const statsElement = document.getElementById('completion-stats');
    const progressBar = document.getElementById('progress-bar');
    const bankElement = document.getElementById('bank-total');
    const historyListElement = document.getElementById('history-list');

    const renderer = new ChoreRenderer(listElement, statsElement, progressBar, bankElement, historyListElement, authService);
    // You might want to update ChoreEvents to handle Admin vs Client permissions
    const events = new ChoreEvents(store, renderer, uiSystem, authService);

    events.init();

    if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
            const code = store.getInviteCode();
            if (!code) {
                uiSystem.notify('Syncing', 'Please wait for database to sync...');
                return;
            }
            const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${code}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                uiSystem.notify('Link Copied', `Invite copied! (Code: ${code})`);
            }).catch(e => {
                console.error('Clipboard copy failed:', e);
                uiSystem.notify('Copy Error', 'Please copy from the console.');
            });
        });
    }

    if (adminInviteBtn) {
        adminInviteBtn.addEventListener('click', () => {
            const code = store.getInviteCode();
            if (!code) {
                uiSystem.notify('Syncing', 'Please wait for database to sync...');
                return;
            }
            const inviteUrl = `${window.location.origin}${window.location.pathname}?adminInvite=${code}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                uiSystem.notify('Admin Link Copied', `Admin Invite copied! Send this to your co-parent.`);
            }).catch(e => {
                console.error('Clipboard copy failed:', e);
                uiSystem.notify('Copy Error', 'Please copy from the console.');
            });
        });
    }

    if (resetInviteBtn) {
        resetInviteBtn.addEventListener('click', async () => {
            const confirmed = await uiSystem.confirm('Resetting the invite link will disconnect all current kids. Are you sure?');
            if (confirmed) {
                await store.resetInviteCode();
                uiSystem.notify('Link Regenerated', 'Old links will no longer work.');
            }
        });
    }

    console.log('Let\'s Chore initialized with Auth!');
});
