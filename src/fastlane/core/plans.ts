/**
 * Plan slots with ranked backups.
 *
 * A plan is layered on top of a UT Registration Plus schedule: each slot has exactly one ACTIVE
 * section (which lives in the UTRP schedule and therefore in the calendar, credit hours and
 * conflict checks) plus any number of ranked alternatives that live only here. Alternatives
 * never count toward the active schedule until the student activates one.
 *
 * All functions are pure: they return new objects and never mutate their inputs.
 */
import type { SectionTimes } from './meetings';
import { detectConflicts, scheduleConflicts } from './meetings';
import type { SectionRecord } from './sections';
import { toSectionTimes } from './sections';

export type PlanKind = 'ideal' | 'backup' | 'custom';

export interface PlanSlot {
    id: string;
    /** requirement tag this slot is meant to satisfy, e.g. "CORE 050" (may be empty) */
    requirement: string;
    /** candidates[0] is the primary, candidates[1..] are ranked backups */
    candidates: SectionRecord[];
    activeUniqueId: number;
    /** sections the student marked as full, with when */
    full: Record<number, number>;
    notes?: string;
}

export interface PlanMeta {
    /** UTRP schedule id this plan decorates */
    scheduleId: string;
    kind: PlanKind;
    slots: PlanSlot[];
    updatedAt: number;
}

export class DuplicateSectionError extends Error {
    constructor(
        public readonly uniqueId: number,
        public readonly where: string
    ) {
        super(`Unique ${String(uniqueId).padStart(5, '0')} is already in this plan (${where}).`);
        this.name = 'DuplicateSectionError';
    }
}

export class PlanError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PlanError';
    }
}

let idCounter = 0;
export function newSlotId(): string {
    idCounter += 1;
    return `slot-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function emptyPlan(scheduleId: string, kind: PlanKind = 'custom', now = Date.now()): PlanMeta {
    return { scheduleId, kind, slots: [], updatedAt: now };
}

export function primaryOf(slot: PlanSlot): SectionRecord {
    const primary = slot.candidates[0];
    if (!primary) throw new PlanError('Slot has no sections');
    return primary;
}

export function backupsOf(slot: PlanSlot): SectionRecord[] {
    return slot.candidates.slice(1);
}

export function activeOf(slot: PlanSlot): SectionRecord {
    const active = slot.candidates.find(c => c.uniqueId === slot.activeUniqueId);
    if (!active) throw new PlanError('Active section missing from slot');
    return active;
}

/** Where (if anywhere) a unique number already appears in the plan */
export function findSection(plan: PlanMeta, uniqueId: number): { slot: PlanSlot; index: number } | null {
    for (const slot of plan.slots) {
        const index = slot.candidates.findIndex(c => c.uniqueId === uniqueId);
        if (index >= 0) return { slot, index };
    }
    return null;
}

function assertNotDuplicate(plan: PlanMeta, uniqueId: number): void {
    const found = findSection(plan, uniqueId);
    if (found) {
        const role = found.index === 0 ? 'primary' : `backup #${found.index}`;
        throw new DuplicateSectionError(uniqueId, `${role} in ${found.slot.requirement || 'a slot'}`);
    }
}

function touch(plan: PlanMeta, slots: PlanSlot[], now: number): PlanMeta {
    return { ...plan, slots, updatedAt: now };
}

function replaceSlot(plan: PlanMeta, slot: PlanSlot, now: number): PlanMeta {
    return touch(
        plan,
        plan.slots.map(s => (s.id === slot.id ? slot : s)),
        now
    );
}

function getSlot(plan: PlanMeta, slotId: string): PlanSlot {
    const slot = plan.slots.find(s => s.id === slotId);
    if (!slot) throw new PlanError(`No slot ${slotId}`);
    return slot;
}

/** Adds a new slot whose primary (and initially active) section is `primary`. */
export function addSlot(
    plan: PlanMeta,
    primary: SectionRecord,
    requirement = '',
    now = Date.now(),
    id = newSlotId()
): PlanMeta {
    assertNotDuplicate(plan, primary.uniqueId);
    const slot: PlanSlot = { id, requirement, candidates: [primary], activeUniqueId: primary.uniqueId, full: {} };
    return touch(plan, [...plan.slots, slot], now);
}

export function removeSlot(plan: PlanMeta, slotId: string, now = Date.now()): PlanMeta {
    return touch(
        plan,
        plan.slots.filter(s => s.id !== slotId),
        now
    );
}

export function setRequirement(plan: PlanMeta, slotId: string, requirement: string, now = Date.now()): PlanMeta {
    return replaceSlot(plan, { ...getSlot(plan, slotId), requirement }, now);
}

/** Appends a ranked backup. Rejects any unique number already used anywhere in the plan. */
export function addBackup(plan: PlanMeta, slotId: string, backup: SectionRecord, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    assertNotDuplicate(plan, backup.uniqueId);
    return replaceSlot(plan, { ...slot, candidates: [...slot.candidates, backup] }, now);
}

/** Removes a backup. The active section cannot be removed this way (activate another first). */
export function removeCandidate(plan: PlanMeta, slotId: string, uniqueId: number, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    if (slot.activeUniqueId === uniqueId) throw new PlanError('Activate a different section before removing this one');
    const candidates = slot.candidates.filter(c => c.uniqueId !== uniqueId);
    if (candidates.length === slot.candidates.length) return plan;
    const full = { ...slot.full };
    delete full[uniqueId];
    return replaceSlot(plan, { ...slot, candidates, full }, now);
}

/**
 * Reorders backups only (indices are 0-based positions in the backup list, not including the primary).
 * This is what drag-and-drop calls.
 */
export function reorderBackups(plan: PlanMeta, slotId: string, from: number, to: number, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    const backups = backupsOf(slot);
    if (from < 0 || from >= backups.length || to < 0 || to >= backups.length) {
        throw new PlanError('Backup index out of range');
    }
    if (from === to) return plan;
    const next = [...backups];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    return replaceSlot(plan, { ...slot, candidates: [primaryOf(slot), ...next] }, now);
}

/** Makes a backup the new primary; the old primary becomes backup #1. Does not change which is active. */
export function promoteToPrimary(plan: PlanMeta, slotId: string, uniqueId: number, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    const index = slot.candidates.findIndex(c => c.uniqueId === uniqueId);
    if (index <= 0) return plan;
    const target = slot.candidates[index]!;
    const rest = slot.candidates.filter(c => c.uniqueId !== uniqueId);
    return replaceSlot(plan, { ...slot, candidates: [target, ...rest] }, now);
}

export interface Swap {
    slotId: string;
    remove: SectionRecord;
    add: SectionRecord;
}

/**
 * Switches which candidate is active (class swapping). Returns the new plan and the swap the
 * caller must apply to the UTRP schedule so the calendar matches.
 */
export function activateCandidate(
    plan: PlanMeta,
    slotId: string,
    uniqueId: number,
    now = Date.now()
): { plan: PlanMeta; swap: Swap | null } {
    const slot = getSlot(plan, slotId);
    if (slot.activeUniqueId === uniqueId) return { plan, swap: null };
    const add = slot.candidates.find(c => c.uniqueId === uniqueId);
    if (!add) throw new PlanError('That section is not a candidate in this slot');
    const remove = activeOf(slot);
    return {
        plan: replaceSlot(plan, { ...slot, activeUniqueId: uniqueId }, now),
        swap: { slotId, remove, add },
    };
}

/** Only the active section of every slot: this is the schedule that counts. */
export function activeSections(plan: PlanMeta): SectionRecord[] {
    return plan.slots.map(activeOf);
}

export function totalCreditHours(plan: PlanMeta): number {
    return activeSections(plan).reduce((sum, s) => sum + (s.creditHours || 0), 0);
}

/** Confirmed conflicts among ACTIVE sections only. Backups never create conflicts. */
export function activeConflicts(plan: PlanMeta): Array<[SectionTimes, SectionTimes]> {
    return scheduleConflicts(activeSections(plan).map(toSectionTimes));
}

/**
 * What would happen if this backup were activated: conflicts against the other slots' active
 * sections (the slot's own active section is replaced, so it is excluded). Informational only.
 */
export function previewActivation(plan: PlanMeta, slotId: string, uniqueId: number) {
    const slot = getSlot(plan, slotId);
    const candidate = slot.candidates.find(c => c.uniqueId === uniqueId);
    if (!candidate) throw new PlanError('Not a candidate');
    const others = plan.slots.filter(s => s.id !== slotId).map(s => toSectionTimes(activeOf(s)));
    return detectConflicts(toSectionTimes(candidate), others);
}

export function markFull(plan: PlanMeta, slotId: string, uniqueId: number, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    if (!slot.candidates.some(c => c.uniqueId === uniqueId)) throw new PlanError('Not a candidate');
    return replaceSlot(plan, { ...slot, full: { ...slot.full, [uniqueId]: now } }, now);
}

export function clearFull(plan: PlanMeta, slotId: string, uniqueId: number, now = Date.now()): PlanMeta {
    const slot = getSlot(plan, slotId);
    const full = { ...slot.full };
    delete full[uniqueId];
    return replaceSlot(plan, { ...slot, full }, now);
}

function satisfies(section: SectionRecord, requirement: string): boolean {
    return !requirement || section.requirementTags.includes(requirement);
}

/**
 * The next backup to try when the active/primary section is full: the highest-ranked backup that
 * is not marked full and not active, preferring ones in the slot's requirement category.
 * Returns null when every alternative is exhausted (callers then ask for recommendations).
 */
export function nextBackup(slot: PlanSlot): SectionRecord | null {
    // rank order: primary first, then backups
    const available = slot.candidates.filter(c => c.uniqueId !== slot.activeUniqueId && !(c.uniqueId in slot.full));
    return available.find(c => satisfies(c, slot.requirement)) ?? available[0] ?? null;
}

export function allAlternativesExhausted(slot: PlanSlot): boolean {
    return slot.candidates.every(c => c.uniqueId in slot.full);
}

/** Every unique number used anywhere in the plan (for duplicate prevention in other UIs) */
export function usedUniqueIds(plan: PlanMeta): Set<number> {
    return new Set(plan.slots.flatMap(s => s.candidates.map(c => c.uniqueId)));
}

/** Keeps plan slots in sync with the UTRP schedule: drops slots whose active course was removed there. */
export function reconcileWithSchedule(plan: PlanMeta, scheduleUniqueIds: number[], now = Date.now()): PlanMeta {
    const present = new Set(scheduleUniqueIds);
    const slots = plan.slots.filter(s => present.has(s.activeUniqueId));
    if (slots.length === plan.slots.length) return plan;
    return touch(plan, slots, now);
}
