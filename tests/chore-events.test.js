// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChoreEvents } from '../chore-events.js';

describe('ChoreEvents Profanity Filter', () => {
    let events;

    beforeEach(() => {
        events = new ChoreEvents({}, {}, {}, {});
    });

    it('should block bad language', () => {
        expect(events.containsProfanity('bad word shit')).toBe(true);
        expect(events.containsProfanity('Hello world')).toBe(false);
    });

    it('should be case insensitive', () => {
        expect(events.containsProfanity('SHIT happens')).toBe(true);
    });
});
