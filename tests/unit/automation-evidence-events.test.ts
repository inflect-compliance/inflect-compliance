/**
 * PR-C — evidence-expiry trigger events are coherent across all three surfaces
 * (catalog, builder labels, narrowing guard) so a rule can actually subscribe.
 */
import {
    AUTOMATION_EVENTS,
    AUTOMATION_EVENT_NAMES,
    isKnownAutomationEvent,
} from '@/app-layer/automation/events';
import { EVENT_LABELS } from '@/lib/automation/event-labels';

describe('evidence-expiry automation events', () => {
    it.each(['EVIDENCE_EXPIRING', 'EVIDENCE_EXPIRED'])('%s is subscribable + labelled', (name) => {
        expect(AUTOMATION_EVENTS[name as keyof typeof AUTOMATION_EVENTS]).toBe(name);
        expect(AUTOMATION_EVENT_NAMES).toContain(name);
        expect(isKnownAutomationEvent(name)).toBe(true);
        // builder label exists + groups under the Evidence domain
        const label = EVENT_LABELS[name as keyof typeof EVENT_LABELS];
        expect(label).toBeDefined();
        expect(label.domain).toBe('Evidence');
        expect(label.label.length).toBeGreaterThan(0);
    });
});
