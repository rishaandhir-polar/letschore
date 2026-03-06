import { vi } from 'vitest';

vi.mock('../firebase-config.js', () => ({
    auth: {
        currentUser: null,
    },
    db: {},
    GoogleAuthProvider: class { },
    signInWithPopup: vi.fn(),
    signInAnonymously: vi.fn(),
    onAuthStateChanged: vi.fn((auth, cb) => {
        // We can trigger this manually in tests if needed
        return () => { };
    }),
    signOut: vi.fn(),
    collection: vi.fn(),
    addDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => { }),
    query: vi.fn(),
    where: vi.fn(),
    doc: vi.fn(() => ({ id: 'mock-id' })),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    orderBy: vi.fn(),
    setDoc: vi.fn(),
}));

// Mock crypto.randomUUID
if (!globalThis.crypto) {
    globalThis.crypto = {
        randomUUID: () => 'mock-uuid-1234-5678'
    };
}
