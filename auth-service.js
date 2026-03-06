import { auth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from './firebase-config.js';

export class AuthService {
    constructor() {
        this.user = null;
        this.listeners = [];
        this.inviteCode = null;
        this.adminInviteCode = null;
    }

    onAuthStateChanged(callback) {
        this.listeners.push(callback);
    }

    notify(user) {
        this.user = user;
        // If it's a client, graft the invite ID onto the user token so SyncStore can find the right family
        if (user && user.isAnonymous && this.inviteCode) {
            user.invite = this.inviteCode;
        }
        this.listeners.forEach(cb => cb(user));
    }

    async init() {
        const search = window.location.search || '';
        const params = new URLSearchParams(search);
        const urlInvite = params.get('invite');
        const adminInvite = params.get('adminInvite');

        if (urlInvite) {
            this.inviteCode = urlInvite;
            localStorage.setItem('chorevault_invite', urlInvite);
        } else {
            this.inviteCode = localStorage.getItem('chorevault_invite');
        }

        if (adminInvite) {
            this.adminInviteCode = adminInvite;
            localStorage.setItem('chorevault_admin_invite', adminInvite);
        } else {
            this.adminInviteCode = localStorage.getItem('chorevault_admin_invite');
        }

        // Set up the real Firebase auth observer
        onAuthStateChanged(auth, (user) => {
            this.notify(user);
        });

        // Auto-login anonymous users if they hit the invite link
        if (this.inviteCode && !auth.currentUser && !this.adminInviteCode) {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous auth failed:", error);
            }
        }

        return new Promise(resolve => {
            // Give auth a moment to resolve
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(user);
            });
        });
    }

    async loginWithGoogle() {
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            return result.user;
        } catch (error) {
            console.error("Google Auth Error:", error);
            return null;
        }
    }

    async logout() {
        try {
            await signOut(auth);
            this.inviteCode = null;
            this.adminInviteCode = null;
            localStorage.removeItem('chorevault_invite');
            localStorage.removeItem('chorevault_admin_invite');
        } catch (error) {
            console.error("Sign out error:", error);
        }
    }

    getUser() {
        let user = auth.currentUser;
        if (user && user.isAnonymous && this.inviteCode) {
            user.invite = this.inviteCode;
        }
        return user;
    }

    clearAdminInvite() {
        this.adminInviteCode = null;
        localStorage.removeItem('chorevault_admin_invite');
    }
}
