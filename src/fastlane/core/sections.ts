/**
 * The plain-data description of one course section that the planner, recommendations and
 * registration queue share. It is built from what UT's public course schedule page displayed.
 */
import type { Meeting, SectionTimes } from './meetings';
import type { Modality } from './modality';

export type AvailabilityStatus = 'OPEN' | 'CLOSED' | 'WAITLISTED' | 'CANCELLED';

/** A seat status that was actually displayed by an authorized source, with when it was seen. */
export interface ObservedStatus {
    value: AvailabilityStatus;
    /** epoch ms */
    observedAt: number;
    /** e.g. "UT course schedule page you viewed" */
    source: string;
}

export interface SemesterRef {
    year: number;
    season: 'Fall' | 'Spring' | 'Summer';
    code?: string;
}

export interface SectionRecord {
    uniqueId: number;
    /** "MUS 302L" */
    courseCode: string;
    /** "INTRODUCTION TO WESTERN MUSIC" */
    title: string;
    semester?: SemesterRef;
    /** full names as listed */
    instructors: string[];
    creditHours: number;
    meetings: Meeting[];
    scheduleComplete: boolean;
    modality: Modality;
    core: string[];
    flags: string[];
    isReserved: boolean;
    status?: ObservedStatus;
    url?: string;
    /** Requirement tags (see requirements.ts) */
    requirementTags: string[];
    /** Serialized UT Registration Plus course, used to place the section on a UTRP schedule */
    course?: unknown;
    /** when this record was captured, epoch ms */
    capturedAt: number;
}

export function semesterKey(s?: SemesterRef): string {
    if (!s) return 'unknown';
    return `${s.season} ${s.year}`;
}

export function sectionLabel(s: Pick<SectionRecord, 'courseCode' | 'uniqueId'>): string {
    return `${s.courseCode} (${String(s.uniqueId).padStart(5, '0')})`;
}

export function formatUnique(uniqueId: number): string {
    return String(uniqueId).padStart(5, '0');
}

export function toSectionTimes(s: SectionRecord): SectionTimes {
    return {
        uniqueId: s.uniqueId,
        label: sectionLabel(s),
        meetings: s.meetings,
        complete: s.scheduleComplete || s.modality === 'async-online',
        asynchronous: s.modality === 'async-online',
    };
}

/** How long an observed OPEN status is shown as current before we tell the student to re-check. */
export const STATUS_FRESH_MS = 30 * 60 * 1000;

export interface AvailabilityDisplay {
    /** "open" only when an observed status says so and it is fresh */
    tone: 'open' | 'closed' | 'waitlist' | 'cancelled' | 'check';
    text: string;
}

export function formatObservedTime(epochMs: number): string {
    return new Date(epochMs).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Honest availability wording. Without an observed status this always says "Check availability".
 * Cached statuses are never described as live.
 */
export function availabilityDisplay(status: ObservedStatus | undefined, now: number = Date.now()): AvailabilityDisplay {
    if (!status) return { tone: 'check', text: 'Check availability' };
    const when = formatObservedTime(status.observedAt);
    const fresh = now - status.observedAt <= STATUS_FRESH_MS && status.observedAt <= now;
    switch (status.value) {
        case 'OPEN':
            return fresh
                ? { tone: 'open', text: `Open as of ${when} (${status.source})` }
                : { tone: 'check', text: `Check availability — last seen open ${when}` };
        case 'CLOSED':
            return { tone: 'closed', text: `Closed as of ${when}` };
        case 'WAITLISTED':
            return { tone: 'waitlist', text: `Waitlisted as of ${when}` };
        case 'CANCELLED':
            return { tone: 'cancelled', text: `Cancelled as of ${when}` };
        default:
            return { tone: 'check', text: 'Check availability' };
    }
}
