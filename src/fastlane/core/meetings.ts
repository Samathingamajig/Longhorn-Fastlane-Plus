/**
 * Meeting-time parsing and schedule conflict detection.
 *
 * Works on plain data so it can be used from content scripts, extension pages and tests.
 * A section's schedule is "complete" only when every listed meeting has parseable days and times.
 */

export type DayCode = 'M' | 'T' | 'W' | 'TH' | 'F' | 'S' | 'SU';

export const DAY_ORDER: DayCode[] = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'];

export const DAY_NAMES: Record<DayCode, string> = {
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    TH: 'Thursday',
    F: 'Friday',
    S: 'Saturday',
    SU: 'Sunday',
};

export interface Meeting {
    days: DayCode[];
    /** minutes after midnight */
    start: number;
    /** minutes after midnight */
    end: number;
    /** e.g. "GDC 2.216" or "WB" */
    location?: string;
}

/** One line of a UT course listing, as text */
export interface RawMeeting {
    daysText: string;
    hoursText: string;
    roomText: string;
}

export interface SectionTimes {
    uniqueId: number;
    /** Human readable, e.g. "MUS 302L (23095)" */
    label: string;
    meetings: Meeting[];
    /** false when at least one listed meeting could not be fully parsed or the times are not listed */
    complete: boolean;
    /** true when the section is a verified asynchronous online section with no scheduled meetings */
    asynchronous?: boolean;
}

const DAY_NAME_TO_CODE: Record<string, DayCode> = {
    monday: 'M',
    tuesday: 'T',
    wednesday: 'W',
    thursday: 'TH',
    friday: 'F',
    saturday: 'S',
    sunday: 'SU',
};

/**
 * Parses UT day strings: "MWF", "TTH", "TH", "MTWTHF", "SU", also "Tu"/"R" variants.
 * @returns null when the string contains anything that is not a day.
 */
export function parseDays(text: string): DayCode[] | null {
    const cleaned = text.replace(/[\s,]/g, '').toUpperCase();
    if (!cleaned) return null;
    const lower = text.trim().toLowerCase();
    if (DAY_NAME_TO_CODE[lower]) return [DAY_NAME_TO_CODE[lower]];
    const days: DayCode[] = [];
    let i = 0;
    while (i < cleaned.length) {
        const two = cleaned.slice(i, i + 2);
        if (two === 'TH') {
            days.push('TH');
            i += 2;
        } else if (two === 'TU') {
            days.push('T');
            i += 2;
        } else if (two === 'SU') {
            days.push('SU');
            i += 2;
        } else {
            const c = cleaned[i];
            if (c === 'M') days.push('M');
            else if (c === 'T') days.push('T');
            else if (c === 'W') days.push('W');
            else if (c === 'R') days.push('TH');
            else if (c === 'F') days.push('F');
            else if (c === 'S') days.push('S');
            else return null;
            i += 1;
        }
    }
    return [...new Set(days)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

function parseClock(text: string, fallbackMeridiem?: 'am' | 'pm'): { minutes: number; meridiem?: 'am' | 'pm' } | null {
    const match = text
        .trim()
        .toLowerCase()
        .replace(/\./g, '')
        .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const suffix = match[3] === 'noon' ? 'pm' : (match[3] as 'am' | 'pm' | undefined);
    const meridiem = suffix ?? fallbackMeridiem;
    if (hour > 23 || minute > 59) return null;
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        if (hour === 12) hour = 0;
        if (meridiem === 'pm') hour += 12;
    }
    return { minutes: hour * 60 + minute, meridiem };
}

/**
 * Parses "10:00 a.m.-11:00 a.m.", "3:30 pm - 5:00 pm", "11:00-12:30 p.m." and 24h "14:00-15:30".
 * @returns null for TBA/blank/unparseable or zero/negative-length ranges.
 */
export function parseTimeRange(text: string): { start: number; end: number } | null {
    const cleaned = text.replace(/[–—]/g, '-').trim();
    if (!cleaned || /\b(tba|tbd|arr|arranged)\b/i.test(cleaned)) return null;
    const parts = cleaned.split('-');
    if (parts.length !== 2) return null;
    const endRaw = parseClock(parts[1]!);
    if (!endRaw) return null;
    let start = parseClock(parts[0]!, endRaw.meridiem);
    if (!start) return null;
    // "11:00-12:30 pm": start inherited pm and became 23:00 → it must have been am
    if (start.minutes >= endRaw.minutes && endRaw.meridiem === 'pm' && !/[ap]\.?m/i.test(parts[0]!)) {
        start = parseClock(parts[0]!, 'am');
        if (!start) return null;
    }
    if (start.minutes >= endRaw.minutes) return null;
    return { start: start.minutes, end: endRaw.minutes };
}

/** Rooms that indicate no physical location */
export function isVirtualRoom(room: string): boolean {
    return /^\s*(WB|WEB|INTERNET|ONLINE|ZOOM|REMOTE)\b/i.test(room);
}

/**
 * Converts the visible lines of a listing into meetings.
 * Lines that are entirely blank are ignored. Any partially filled or TBA line marks the schedule incomplete.
 */
export function meetingsFromRaw(lines: RawMeeting[]): { meetings: Meeting[]; complete: boolean } {
    const meetings: Meeting[] = [];
    let complete = true;
    for (const line of lines) {
        const daysText = line.daysText.trim();
        const hoursText = line.hoursText.trim();
        if (!daysText && !hoursText) {
            // a room with no days/hours (e.g. "WB") is not a meeting time
            continue;
        }
        const days = parseDays(daysText);
        const time = parseTimeRange(hoursText);
        if (!days || days.length === 0 || !time) {
            complete = false;
            continue;
        }
        meetings.push({ days, start: time.start, end: time.end, location: line.roomText.trim() || undefined });
    }
    return { meetings, complete };
}

export function meetingsOverlap(a: Meeting, b: Meeting): DayCode[] {
    if (!(a.start < b.end && b.start < a.end)) return [];
    return a.days.filter(day => b.days.includes(day));
}

export interface ConflictDetail {
    with: SectionTimes;
    days: DayCode[];
    candidateMeeting: Meeting;
    otherMeeting: Meeting;
}

export type ConflictStatus = 'conflict' | 'clear' | 'unknown';

export interface ConflictResult {
    status: ConflictStatus;
    conflicts: ConflictDetail[];
    /** sections whose times are incomplete, so a conflict cannot be ruled out */
    unknownWith: SectionTimes[];
    /** true when the candidate's own times are incomplete */
    candidateIncomplete: boolean;
}

/**
 * Compares one section against the sections in the active schedule.
 *
 * - "conflict": at least one confirmed overlap (lecture, lab, discussion — every listed meeting is checked)
 * - "unknown": no confirmed overlap, but missing/TBA times on either side mean one cannot be ruled out
 * - "clear": every meeting is known and nothing overlaps
 *
 * Asynchronous sections have no meeting times, so they only conflict if a listed meeting overlaps.
 */
export function detectConflicts(candidate: SectionTimes, schedule: SectionTimes[]): ConflictResult {
    const conflicts: ConflictDetail[] = [];
    const unknownWith: SectionTimes[] = [];
    for (const other of schedule) {
        if (other.uniqueId === candidate.uniqueId) continue;
        for (const mine of candidate.meetings) {
            for (const theirs of other.meetings) {
                const days = meetingsOverlap(mine, theirs);
                if (days.length) conflicts.push({ with: other, days, candidateMeeting: mine, otherMeeting: theirs });
            }
        }
        if (!other.complete) unknownWith.push(other);
    }
    const candidateIncomplete = !candidate.complete;
    let status: ConflictStatus = 'clear';
    if (conflicts.length) status = 'conflict';
    else if (candidateIncomplete || unknownWith.length) status = 'unknown';
    return { status, conflicts, unknownWith, candidateIncomplete };
}

/** Unique list of the sections a candidate conflicts with */
export function conflictingSections(result: ConflictResult): SectionTimes[] {
    const seen = new Map<number, SectionTimes>();
    for (const c of result.conflicts) seen.set(c.with.uniqueId, c.with);
    return [...seen.values()];
}

/** All pairwise confirmed conflicts within one schedule */
export function scheduleConflicts(sections: SectionTimes[]): Array<[SectionTimes, SectionTimes]> {
    const pairs: Array<[SectionTimes, SectionTimes]> = [];
    for (let i = 0; i < sections.length; i++) {
        for (let j = i + 1; j < sections.length; j++) {
            const a = sections[i]!;
            const b = sections[j]!;
            if (a.uniqueId === b.uniqueId) continue;
            if (a.meetings.some(m => b.meetings.some(n => meetingsOverlap(m, n).length > 0))) pairs.push([a, b]);
        }
    }
    return pairs;
}

export function formatMinutes(minutes: number): string {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const meridiem = h24 >= 12 ? 'pm' : 'am';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')}${meridiem}`;
}

export function formatMeeting(m: Meeting): string {
    return `${m.days.join('')} ${formatMinutes(m.start)}–${formatMinutes(m.end)}${m.location ? ` · ${m.location}` : ''}`;
}

export function meetsOn(section: { meetings: Meeting[] }, day: DayCode): boolean {
    return section.meetings.some(m => m.days.includes(day));
}
