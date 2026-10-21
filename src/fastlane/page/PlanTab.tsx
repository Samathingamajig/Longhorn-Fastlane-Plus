/**
 * Schedule builder with dedicated backup management.
 * Active sections live in the UT Registration Plus schedule (calendar, credit hours, conflicts);
 * ranked backups live here and never count until activated.
 */
import { background } from '@shared/messages';
import { switchSchedule, useActiveSchedule, useAllSchedules } from '@views/hooks/useSchedules';
import { useEffect, useMemo, useState } from 'react';

import type { PlanKind, PlanMeta, PlanSlot } from '../core/plans';
import {
    activeConflicts,
    activeSections,
    allAlternativesExhausted,
    backupsOf,
    clearFull,
    nextBackup,
    previewActivation,
    promoteToPrimary,
    totalCreditHours,
} from '../core/plans';
import { CORE_COMPONENTS, coreTag, describeRequirement } from '../core/requirements';
import type { SectionRecord } from '../core/sections';
import { activateSection, loadPlan, planOps, setPlanKind, updatePlan } from '../services/planService';
import { FastlanePlanStore, FastlaneSettingsStore } from '../storage/stores';
import { CopyButton, GradeChip, instructorsText, locationsText, ModalityChip, PageHead, UniqueCode } from './common';
import { useGradeStats } from './hooks';
import WeekGrid from './WeekGrid';

const KIND_LABELS: Record<PlanKind, string> = { ideal: 'Ideal schedule', backup: 'Backup schedule', custom: 'Custom schedule' };

function RequirementPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const known = CORE_COMPONENTS.map(c => coreTag(c.code));
    const custom = value && !known.includes(value);
    return (
        <select aria-label='Requirement this class satisfies' value={value} onChange={e => onChange(e.target.value)}>
            <option value=''>No requirement</option>
            {CORE_COMPONENTS.map(c => (
                <option key={c.code} value={coreTag(c.code)}>
                    Core {c.code} · {c.name}
                </option>
            ))}
            {custom && <option value={value}>{describeRequirement(value)}</option>}
        </select>
    );
}

function SlotCard({
    plan,
    slot,
    onNavigate,
    grades,
    onError,
}: {
    plan: PlanMeta;
    slot: PlanSlot;
    onNavigate: (tab: string, params?: Record<string, string>) => void;
    grades: ReturnType<typeof useGradeStats>;
    onError: (m: string) => void;
}) {
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dropAt, setDropAt] = useState<number | null>(null);
    const suggestion = slot.activeUniqueId in slot.full ? nextBackup(slot) : null;
    const exhausted = allAlternativesExhausted(slot);
    const sid = plan.scheduleId;
    const run = (p: Promise<unknown>) => p.catch((e: Error) => onError(e.message));

    const candidateRow = (c: SectionRecord, index: number) => {
        const isActive = c.uniqueId === slot.activeUniqueId;
        const isFull = c.uniqueId in slot.full;
        const backupIndex = index - 1;
        const preview = !isActive ? previewActivation(plan, slot.id, c.uniqueId) : null;
        return (
            <div
                key={c.uniqueId}
                className={`cand ${isActive ? 'active' : ''} ${isFull ? 'is-full' : ''} ${dragFrom === backupIndex ? 'dragging' : ''} ${dropAt === backupIndex && dragFrom !== null ? 'drop-target' : ''}`}
                draggable={index > 0}
                onDragStart={e => {
                    setDragFrom(backupIndex);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => {
                    if (index > 0 && dragFrom !== null) {
                        e.preventDefault();
                        setDropAt(backupIndex);
                    }
                }}
                onDragEnd={() => {
                    setDragFrom(null);
                    setDropAt(null);
                }}
                onDrop={e => {
                    e.preventDefault();
                    if (dragFrom !== null && index > 0 && dragFrom !== backupIndex) {
                        void run(planOps.reorder(sid, slot.id, dragFrom, backupIndex));
                    }
                    setDragFrom(null);
                    setDropAt(null);
                }}
            >
                <div className='handle' aria-hidden={index === 0} title={index > 0 ? 'Drag to reorder backups' : 'Primary'}>
                    {index === 0 ? <span className='rank'>1°</span> : '⋮⋮'}
                </div>
                <div className='cand-main stack' style={{ gap: 2 }}>
                    <div className='row'>
                        <span className='rank'>{index === 0 ? 'PRIMARY' : `BACKUP ${index}`}</span>
                        <UniqueCode id={c.uniqueId} />
                        <b>{c.courseCode}</b>
                        <span>{c.title}</span>
                        {isActive && <span className='chip accent'>Active</span>}
                        {isFull && <span className='chip bad'>Full</span>}
                        <ModalityChip modality={c.modality} />
                        <GradeChip stat={grades.get(c.uniqueId)} />
                    </div>
                    <div className='small muted'>
                        {instructorsText(c)} · {locationsText(c)} · {c.creditHours} hrs
                        {!c.scheduleComplete && c.modality !== 'async-online' ? ' · meeting times incomplete' : ''}
                    </div>
                    {preview?.status === 'conflict' && (
                        <div className='small' style={{ color: 'var(--bad)' }}>
                            If activated, conflicts with {preview.conflicts.map(x => x.with.label).join(', ')}
                        </div>
                    )}
                    {preview?.status === 'unknown' && <div className='small' style={{ color: 'var(--warn)' }}>If activated, conflict status unknown</div>}
                </div>
                <div className='row' style={{ justifyContent: 'flex-end' }}>
                    <CopyButton text={String(c.uniqueId).padStart(5, '0')} />
                    {!isActive && (
                        <button type='button' className='btn sm' onClick={() => void run(activateSection(sid, slot.id, c.uniqueId))}>
                            Activate
                        </button>
                    )}
                    {isFull ? (
                        <button type='button' className='btn sm' onClick={() => void run(updatePlan(sid, p => clearFull(p, slot.id, c.uniqueId)))}>
                            Not full
                        </button>
                    ) : (
                        <button type='button' className='btn sm' onClick={() => void run(planOps.markFull(sid, slot.id, c.uniqueId))}>
                            Mark full
                        </button>
                    )}
                    {index > 1 && (
                        <button
                            type='button'
                            className='btn sm'
                            aria-label={`Move ${c.courseCode} up`}
                            onClick={() => void run(planOps.reorder(sid, slot.id, backupIndex, backupIndex - 1))}
                        >
                            ↑
                        </button>
                    )}
                    {index > 0 && index < slot.candidates.length - 1 && (
                        <button
                            type='button'
                            className='btn sm'
                            aria-label={`Move ${c.courseCode} down`}
                            onClick={() => void run(planOps.reorder(sid, slot.id, backupIndex, backupIndex + 1))}
                        >
                            ↓
                        </button>
                    )}
                    {index > 0 && (
                        <button type='button' className='btn sm' onClick={() => void run(updatePlan(sid, p => promoteToPrimary(p, slot.id, c.uniqueId)))}>
                            Make primary
                        </button>
                    )}
                    {!isActive && (
                        <button type='button' className='btn sm danger' onClick={() => void run(planOps.remove(sid, slot.id, c.uniqueId))}>
                            Remove
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className='slot'>
            <div className='slot-head'>
                <div className='row'>
                    <b>{slot.candidates.find(c => c.uniqueId === slot.activeUniqueId)?.courseCode}</b>
                    <RequirementPicker value={slot.requirement} onChange={v => void run(planOps.setRequirement(sid, slot.id, v))} />
                    <span className='small muted'>{backupsOf(slot).length} backup(s)</span>
                </div>
                <div className='row'>
                    {suggestion && (
                        <button type='button' className='btn sm primary' onClick={() => void run(activateSection(sid, slot.id, suggestion.uniqueId))}>
                            Primary full → activate {suggestion.courseCode} ({String(suggestion.uniqueId).padStart(5, '0')})
                        </button>
                    )}
                    {(exhausted || backupsOf(slot).length === 0) && slot.requirement && (
                        <button type='button' className='btn sm' onClick={() => onNavigate('recommend', { req: slot.requirement })}>
                            Find {describeRequirement(slot.requirement)} options
                        </button>
                    )}
                </div>
            </div>
            {slot.candidates.map(candidateRow)}
            {backupsOf(slot).length === 0 && (
                <div className='cand'>
                    <span />
                    <span className='small muted'>
                        No backups yet. On UT’s course schedule, click <b>+ Backup</b> on any section, or add one from Recommendations.
                    </span>
                    <span />
                </div>
            )}
        </div>
    );
}

export default function PlanTab({ onNavigate }: { onNavigate: (tab: string, params?: Record<string, string>) => void }) {
    const schedule = useActiveSchedule();
    const schedules = useAllSchedules();
    const plans = FastlanePlanStore.useStore(s => s.plans) as unknown as Record<string, PlanMeta>;
    const threshold = FastlaneSettingsStore.useStore(s => s.gradeThreshold);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (schedule) void loadPlan(schedule);
    }, [schedule]);

    const plan = schedule ? plans[schedule.id] : undefined;
    const allSections = useMemo(() => plan?.slots.flatMap(s => s.candidates) ?? [], [plan]);
    const grades = useGradeStats(allSections, threshold);
    const active = plan ? activeSections(plan) : [];
    const conflicts = plan ? activeConflicts(plan) : [];
    const untimed = active.filter(s => !s.meetings.length);
    const backupCount = plan?.slots.reduce((n, s) => n + s.candidates.length - 1, 0) ?? 0;

    return (
        <div className='stack'>
            <PageHead
                title='Schedule builder'
                subtitle='Your active schedule is what counts. Backups are ranked per class and never create conflicts until you activate one.'
                actions={
                    <>
                        <select aria-label='Schedule' value={schedule?.id} onChange={e => void switchSchedule(e.target.value)}>
                            {schedules.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                    {plans[s.id] ? ` — ${KIND_LABELS[plans[s.id]!.kind]}` : ''}
                                </option>
                            ))}
                        </select>
                        {plan && (
                            <select aria-label='Schedule type' value={plan.kind} onChange={e => void setPlanKind(plan.scheduleId, e.target.value as PlanKind)}>
                                <option value='ideal'>Ideal</option>
                                <option value='backup'>Backup</option>
                                <option value='custom'>Custom</option>
                            </select>
                        )}
                        <button
                            type='button'
                            className='btn'
                            onClick={async () => {
                                const name = prompt('Name for the new schedule', 'Backup schedule');
                                if (name) {
                                    const err = await background.createSchedule({ scheduleName: name });
                                    if (err) setError(err);
                                }
                            }}
                        >
                            New schedule
                        </button>
                        <a className='btn' href={chrome.runtime.getURL('calendar.html')} target='_blank' rel='noopener'>
                            Full calendar ↗
                        </a>
                    </>
                }
            />
            {error && (
                <div className='notice bad' role='alert'>
                    {error}{' '}
                    <button type='button' className='btn sm ghost' onClick={() => setError(null)}>
                        Dismiss
                    </button>
                </div>
            )}
            <div className='metrics'>
                <div className='metric'>
                    <b>{plan ? totalCreditHours(plan) : 0}</b>
                    <span>active credit hours</span>
                </div>
                <div className='metric'>
                    <b>{active.length}</b>
                    <span>active classes</span>
                </div>
                <div className='metric'>
                    <b>{backupCount}</b>
                    <span>ranked backups (not counted)</span>
                </div>
                <div className='metric'>
                    <b style={{ color: conflicts.length ? 'var(--bad)' : undefined }}>{conflicts.length}</b>
                    <span>known conflicts</span>
                </div>
            </div>
            {conflicts.length > 0 && (
                <div className='notice bad'>
                    Conflicts in the active schedule: {conflicts.map(([a, b]) => `${a.label} ↔ ${b.label}`).join('; ')}
                </div>
            )}
            {active.length === 0 ? (
                <div className='card'>
                    <h2>Start by adding classes</h2>
                    <p className='muted'>
                        Open <a href='https://utdirect.utexas.edu/apps/registrar/course_schedule/' target='_blank' rel='noopener'>UT’s course schedule</a>,
                        add sections with UT Registration Plus, then return here to rank backups for each one.
                    </p>
                </div>
            ) : (
                <>
                    <WeekGrid sections={active} />
                    {untimed.length > 0 && (
                        <div className='small muted'>
                            Not on the grid: {untimed.map(s => `${s.courseCode} (${s.modality === 'async-online' ? 'asynchronous' : 'times not listed'})`).join(', ')}
                        </div>
                    )}
                    <div className='stack'>
                        {plan?.slots.map(slot => (
                            <SlotCard key={slot.id} plan={plan} slot={slot} grades={grades} onNavigate={onNavigate} onError={setError} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
