import { vi } from 'vitest';

const mockState = {
    chores: [],
    wallet: 0,
    history: []
};
const snapshotListeners = new Set();

export const resetMockState = () => {
    mockState.chores = [];
    mockState.wallet = 0;
    mockState.history = [];
    mockState.inviteCode = 'mock-invite';
    snapshotListeners.clear();
};

const triggerSnapshots = () => {
    console.log(`Triggering snapshots: wallet=${mockState.wallet}, history=${mockState.history.length}, listeners=${snapshotListeners.size}`);
    snapshotListeners.forEach(cb => {
        const familyData = {
            wallet: mockState.wallet,
            history: mockState.history,
            admins: ['admin_1'],
            inviteCode: mockState.inviteCode
        };

        if (cb.isChoreQuery) {
            cb({
                empty: mockState.chores.length === 0,
                docs: mockState.chores.map(c => ({ id: c.id, data: () => c })),
                exists: () => true,
                data: () => ({ wallet: mockState.wallet, history: mockState.history })
            });
        } else {
            cb({
                empty: false,
                docs: [{ id: 'mock-family-id', data: () => familyData }],
                exists: () => true,
                data: () => familyData
            });
        }
    });
};

vi.mock('../firebase-config.js', () => ({
    auth: { currentUser: { uid: 'admin_1' } },
    db: {},
    GoogleAuthProvider: class { },
    signInWithPopup: vi.fn(),
    signInAnonymously: vi.fn(),
    onAuthStateChanged: vi.fn((auth, cb) => {
        cb({ uid: 'admin_1', isAnonymous: false });
        return () => { };
    }),
    signOut: vi.fn(),
    collection: vi.fn((...args) => {
        const path = args.filter(a => typeof a === 'string').join('/');
        return { path, type: 'collection' };
    }),
    addDoc: vi.fn(),
    onSnapshot: vi.fn((q, cb) => {
        const path = q?.path || (typeof q === 'string' ? q : '');
        cb.isChoreQuery = path.includes('chores');
        snapshotListeners.add(cb);
        if (cb.isChoreQuery) {
            cb({
                empty: mockState.chores.length === 0,
                docs: mockState.chores.map(c => ({ id: c.id, data: () => c })),
                exists: () => true,
                data: () => ({ wallet: mockState.wallet, history: mockState.history })
            });
        } else {
            const familyData = {
                wallet: mockState.wallet,
                history: mockState.history,
                admins: ['admin_1'],
                inviteCode: mockState.inviteCode || 'mock-invite'
            };
            cb({
                empty: false,
                docs: [{ id: 'mock-family-id', data: () => familyData }],
                exists: () => true,
                data: () => familyData
            });
        }
        return () => snapshotListeners.delete(cb);
    }),
    query: vi.fn((ref) => ref),
    where: vi.fn(),
    doc: vi.fn((...args) => {
        const segments = args.filter(a => typeof a === 'string' || (a && a.path));
        const pathParts = segments.map(s => typeof s === 'string' ? s : s.path);

        let id;
        const lastPart = pathParts[pathParts.length - 1];
        const isCollectionOnly = args.length === 1 && args[0].type === 'collection';

        if (isCollectionOnly || lastPart === 'families' || lastPart === 'chores') {
            id = crypto.randomUUID();
            pathParts.push(id);
        } else {
            id = lastPart || crypto.randomUUID();
        }

        const path = pathParts.join('/');
        return { id, path, type: 'doc' };
    }),
    updateDoc: vi.fn(async (ref, updates) => {
        const chore = mockState.chores.find(c => c.id === ref.id);

        for (const [key, value] of Object.entries(updates)) {
            if (key.includes('.')) {
                const [parent, child] = key.split('.');
                const target = chore || mockState;
                if (!target[parent]) target[parent] = {};
                target[parent][child] = value;
            } else {
                if (chore) {
                    chore[key] = value;
                } else {
                    // Family level update
                    mockState[key] = value;
                }
            }
        }
        triggerSnapshots();
    }),
    deleteDoc: vi.fn(async (ref) => {
        const idx = mockState.chores.findIndex(c => c.id === ref.id);
        if (idx >= 0) {
            mockState.chores.splice(idx, 1);
            triggerSnapshots();
        }
    }),
    orderBy: vi.fn(),
    setDoc: vi.fn(async (ref, data) => {
        if (data.title) {
            const existingIdx = mockState.chores.findIndex(c => c.id === ref.id);
            if (existingIdx >= 0) {
                mockState.chores[existingIdx] = { id: ref.id, ...data };
            } else {
                mockState.chores.push({ id: ref.id, ...data });
            }
        } else {
            Object.assign(mockState, data);
        }
        triggerSnapshots();
    }),
}));

if (!globalThis.crypto) {
    globalThis.crypto = {
        randomUUID: () => 'mock-uuid-1234-5678'
    };
}
