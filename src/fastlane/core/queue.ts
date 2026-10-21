/**
 * Manual registration priority queue.
 *
 * This module only tracks what the STUDENT reports (or confirms). It never registers, submits,
 * refreshes or requests anything. Every add/drop at UT is performed by the student.
 *
 * Semantics:
 *  - Items are tried in list order.
 *  - Items share a `group` (e.g. "UGS"). Once any item in a group succeeds, the rest of that
 *    group is skipped automatically (e.g. a later UGS revisit).
 *  - Items may depend on a condition (e.g. "Did not earn CLEP credit for ECO 304L").
 *  - When every item in a group has failed, the group is "exhausted" and the UI asks the
 *    recommendation engine for more sections that satisfy the group's requirement.
 */

export type Outcome = 'success' | 'full' | 'conflict' | 'restriction' | 'skipped';

export const OUTCOMES: Outcome[] = ['success', 'full', 'conflict', 'restriction', 'skipped'];

export const OUTCOME_LABELS: Record<Outcome, string> = {
    success: 'Success',
    full: 'Full',
    conflict: 'Conflict',
    restriction: 'Restriction',
    skipped: 'Skipped',
};

export interface QueueItem {
    id: string;
    uniqueId: number;
    /** "Western Music" */
    label: string;
    /** "MUS 302L" */
    courseCode?: string;
    /** items in the same group are alternatives for each other */
    group: string;
    /** requirement tag satisfied, e.g. "CORE 050" */
    requirement: string;
    /** key of a QueueCondition that must be enabled for this item to be attempted */
    condition?: string;
    note?: string;
}

export interface QueueCondition {
    key: string;
    label: string;
    enabled: boolean;
}

export interface Attempt {
    at: number;
    itemId: string;
    uniqueId: number;
    action: 'copied' | 'autofilled' | Outcome | 'undo';
    source: 'manual' | 'detected';
}

export interface QueueState {
    version: 1;
    items: QueueItem[];
    outcomes: Record<string, Outcome>;
    conditions: QueueCondition[];
    history: Attempt[];
    undoStack: Array<{ itemId: string; previous: Outcome | null }>;
    /** set when the student copies a unique number; used only to interpret on-page messages */
    pending: { itemId: string; copiedAt: number } | null;
}

export class QueueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QueueError';
    }
}

const HISTORY_LIMIT = 200;
const UNDO_LIMIT = 50;

let counter = 0;
export function newItemId(): string {
    counter += 1;
    return `q-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** The priority list from the original Fastlane prototype. Fully editable by the student. */
export function defaultQueue(): QueueState {
    const item = (
        uniqueId: number,
        label: string,
        courseCode: string,
        group: string,
        requirement: string,
        extra: Partial<QueueItem> = {}
    ): QueueItem => ({ id: `default-${uniqueId}`, uniqueId, label, courseCode, group, requirement, ...extra });
    return {
        version: 1,
        items: [
            item(65555, 'UGS — choice 1', 'UGS 302', 'UGS', 'CORE 090'),
            item(65705, 'UGS — choice 2', 'UGS 302', 'UGS', 'CORE 090'),
            item(65605, 'UGS — choice 3', 'UGS 302', 'UGS', 'CORE 090', {
                note: 'After three failed UGS attempts, move on to Western Music',
            }),
            item(34240, 'Intro to Macroeconomics', 'ECO 304L', 'MACRO', 'COURSE ECO 304L', {
                condition: 'no-clep-eco',
            }),
            item(23095, 'Introduction to Western Music', 'MUS 302L', 'ARTS', 'CORE 050'),
            item(33515, 'Classical Mythology', 'C C 303', 'ARTS', 'CORE 050'),
            item(33505, 'Ancient Rome', 'C C 302', 'ARTS', 'CORE 050'),
            item(55675, 'Fundamentals of Nutrition', 'NTR 306', 'SCI-1', 'CORE 030'),
            item(31830, 'Biological Anthropology', 'ANT 301', 'SCI-1', 'CORE 030'),
            item(31925, 'Archaeology (online)', 'ANT 304', 'SCI-2', 'CORE 030'),
            item(31875, 'Archaeology (campus)', 'ANT 304', 'SCI-2', 'CORE 030'),
            item(65600, 'UGS — choice 4 (revisit)', 'UGS 302', 'UGS', 'CORE 090', {
                note: 'Return here after securing the other priority classes',
            }),
        ],
        outcomes: {},
        conditions: [{ key: 'no-clep-eco', label: 'I did NOT earn CLEP credit for ECO 304L', enabled: false }],
        history: [],
        undoStack: [],
        pending: null,
    };
}

export function emptyQueue(): QueueState {
    return { version: 1, items: [], outcomes: {}, conditions: [], history: [], undoStack: [], pending: null };
}

function conditionEnabled(state: QueueState, item: QueueItem): boolean {
    if (!item.condition) return true;
    return state.conditions.find(c => c.key === item.condition)?.enabled ?? false;
}

export function succeededGroups(state: QueueState): Set<string> {
    return new Set(state.items.filter(i => state.outcomes[i.id] === 'success').map(i => i.group));
}

/** Whether an item is still waiting to be attempted */
export function isActionable(state: QueueState, item: QueueItem, succeeded = succeededGroups(state)): boolean {
    return !state.outcomes[item.id] && conditionEnabled(state, item) && !succeeded.has(item.group);
}

/** The unique number the student should try now, or null when the queue is done */
export function currentItem(state: QueueState): QueueItem | null {
    const succeeded = succeededGroups(state);
    return state.items.find(i => isActionable(state, i, succeeded)) ?? null;
}

/** The fallback after the current item: the next alternative in the same group, if any */
export function nextFallback(state: QueueState): { item: QueueItem; sameGroup: boolean } | null {
    const current = currentItem(state);
    if (!current) return null;
    const succeeded = succeededGroups(state);
    const after = state.items.slice(state.items.indexOf(current) + 1).filter(i => isActionable(state, i, succeeded));
    const sameGroup = after.find(i => i.group === current.group);
    if (sameGroup) return { item: sameGroup, sameGroup: true };
    return after[0] ? { item: after[0], sameGroup: false } : null;
}

/** Groups in which every attempted item failed and nothing remains to try → need recommendations */
export function exhaustedGroups(state: QueueState): Array<{ group: string; requirement: string }> {
    const succeeded = succeededGroups(state);
    const groups = new Map<string, QueueItem[]>();
    for (const item of state.items) {
        if (!conditionEnabled(state, item)) continue;
        groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    }
    const out: Array<{ group: string; requirement: string }> = [];
    for (const [group, items] of groups) {
        if (succeeded.has(group)) continue;
        const allFailed = items.every(i => state.outcomes[i.id] && state.outcomes[i.id] !== 'success');
        if (allFailed && items.length) out.push({ group, requirement: items[0]!.requirement });
    }
    return out;
}

function getItem(state: QueueState, itemId: string): QueueItem {
    const item = state.items.find(i => i.id === itemId);
    if (!item) throw new QueueError(`No queue item ${itemId}`);
    return item;
}

function log(state: QueueState, attempt: Attempt): Attempt[] {
    return [...state.history, attempt].slice(-HISTORY_LIMIT);
}

/** Records that the student copied a unique number (arms optional message reading). */
export function recordCopy(state: QueueState, itemId: string, now = Date.now()): QueueState {
    const item = getItem(state, itemId);
    return {
        ...state,
        pending: { itemId, copiedAt: now },
        history: log(state, { at: now, itemId, uniqueId: item.uniqueId, action: 'copied', source: 'manual' }),
    };
}

/** Logs that Fastlane placed this unique number in UT's add field (it never submits). */
export function recordAutofill(state: QueueState, itemId: string, now = Date.now()): QueueState {
    const item = getItem(state, itemId);
    return {
        ...state,
        pending: { itemId, copiedAt: now },
        history: log(state, { at: now, itemId, uniqueId: item.uniqueId, action: 'autofilled', source: 'manual' }),
    };
}

/** Records the result of an attempt the student made at UT. */
export function recordOutcome(
    state: QueueState,
    itemId: string,
    outcome: Outcome,
    now = Date.now(),
    source: Attempt['source'] = 'manual'
): QueueState {
    if (!OUTCOMES.includes(outcome)) throw new QueueError(`Unknown outcome ${outcome}`);
    const item = getItem(state, itemId);
    const previous = state.outcomes[itemId] ?? null;
    if (previous === outcome) return state;
    return {
        ...state,
        outcomes: { ...state.outcomes, [itemId]: outcome },
        undoStack: [...state.undoStack, { itemId, previous }].slice(-UNDO_LIMIT),
        history: log(state, { at: now, itemId, uniqueId: item.uniqueId, action: outcome, source }),
        pending: state.pending?.itemId === itemId ? null : state.pending,
    };
}

export function undo(state: QueueState, now = Date.now()): QueueState {
    const last = state.undoStack[state.undoStack.length - 1];
    if (!last) return state;
    const outcomes = { ...state.outcomes };
    if (last.previous) outcomes[last.itemId] = last.previous;
    else delete outcomes[last.itemId];
    const item = state.items.find(i => i.id === last.itemId);
    return {
        ...state,
        outcomes,
        undoStack: state.undoStack.slice(0, -1),
        pending: null,
        history: item
            ? log(state, { at: now, itemId: item.id, uniqueId: item.uniqueId, action: 'undo', source: 'manual' })
            : state.history,
    };
}

export function resetProgress(state: QueueState): QueueState {
    return { ...state, outcomes: {}, history: [], undoStack: [], pending: null };
}

/** Adds an item. Rejects a unique number that is already in the queue. */
export function addItem(state: QueueState, item: Omit<QueueItem, 'id'> & { id?: string }, index?: number): QueueState {
    if (!Number.isInteger(item.uniqueId) || item.uniqueId <= 0 || item.uniqueId > 99999) {
        throw new QueueError('Unique numbers are 5 digits');
    }
    if (state.items.some(i => i.uniqueId === item.uniqueId)) {
        throw new QueueError(`Unique ${String(item.uniqueId).padStart(5, '0')} is already in the queue`);
    }
    const full: QueueItem = { ...item, id: item.id ?? newItemId(), group: item.group.trim() || 'OTHER' };
    const items = [...state.items];
    items.splice(index ?? items.length, 0, full);
    return { ...state, items };
}

export function updateItem(state: QueueState, itemId: string, patch: Partial<Omit<QueueItem, 'id'>>): QueueState {
    getItem(state, itemId);
    if (patch.uniqueId !== undefined && state.items.some(i => i.uniqueId === patch.uniqueId && i.id !== itemId)) {
        throw new QueueError(`Unique ${String(patch.uniqueId).padStart(5, '0')} is already in the queue`);
    }
    return { ...state, items: state.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)) };
}

export function removeItem(state: QueueState, itemId: string): QueueState {
    const outcomes = { ...state.outcomes };
    delete outcomes[itemId];
    return {
        ...state,
        items: state.items.filter(i => i.id !== itemId),
        outcomes,
        undoStack: state.undoStack.filter(u => u.itemId !== itemId),
        pending: state.pending?.itemId === itemId ? null : state.pending,
    };
}

export function moveItem(state: QueueState, from: number, to: number): QueueState {
    if (from < 0 || from >= state.items.length || to < 0 || to >= state.items.length) {
        throw new QueueError('Index out of range');
    }
    const items = [...state.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved!);
    return { ...state, items };
}

export function setCondition(state: QueueState, key: string, enabled: boolean, label?: string): QueueState {
    const exists = state.conditions.some(c => c.key === key);
    const conditions = exists
        ? state.conditions.map(c => (c.key === key ? { ...c, enabled, label: label ?? c.label } : c))
        : [...state.conditions, { key, enabled, label: label ?? key }];
    return { ...state, conditions };
}

export function progress(state: QueueState): { success: number; failed: number; remaining: number } {
    const succeeded = succeededGroups(state);
    let success = 0;
    let failed = 0;
    let remaining = 0;
    for (const item of state.items) {
        const o = state.outcomes[item.id];
        if (o === 'success') success++;
        else if (o) failed++;
        else if (isActionable(state, item, succeeded)) remaining++;
    }
    return { success, failed, remaining };
}

/** Light structural validation for imported/persisted queues */
export function isQueueState(value: unknown): value is QueueState {
    if (!value || typeof value !== 'object') return false;
    const v = value as QueueState;
    return (
        v.version === 1 &&
        Array.isArray(v.items) &&
        v.items.every(i => typeof i.id === 'string' && Number.isInteger(i.uniqueId) && typeof i.group === 'string') &&
        typeof v.outcomes === 'object' &&
        Array.isArray(v.conditions) &&
        Array.isArray(v.history) &&
        Array.isArray(v.undoStack)
    );
}
