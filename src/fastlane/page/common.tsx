import type { Course } from '@shared/types/Course';
import type { ReactNode } from 'react';

import type { GradeStat } from '../core/grades';
import { describeGradeStat, formatPercent, thresholdLabel } from '../core/grades';
import type { Modality } from '../core/modality';
import { MODALITY_LABELS } from '../core/modality';
import type { SectionRecord } from '../core/sections';
import { formatUnique } from '../core/sections';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div className='page-head'>
            <div>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className='row'>{actions}</div>}
        </div>
    );
}

export function ModalityChip({ modality }: { modality: Modality }) {
    if (modality === 'async-online') return <span className='chip async'>Async online</span>;
    if (modality === 'live-online') return <span className='chip live'>Live online</span>;
    if (modality === 'hybrid') return <span className='chip'>Hybrid</span>;
    if (modality === 'unknown') return <span className='chip'>{MODALITY_LABELS.unknown}</span>;
    return null;
}

export function GradeChip({ stat }: { stat: GradeStat | null | undefined }) {
    if (stat === undefined) return <span className='chip'>…</span>;
    if (!stat) return <span className='chip' title='No verified historical grade data'>No grade data</span>;
    return (
        <span className={`chip ${stat.scope === 'instructor' ? 'accent' : ''}`} title={describeGradeStat(stat)}>
            {formatPercent(stat.result.percent)} {thresholdLabel(stat.result.threshold)} · {stat.scope === 'instructor' ? 'Prof' : 'All profs'} · n=
            {stat.result.graded}
        </span>
    );
}

export function UniqueCode({ id }: { id: number }) {
    return <span className='mono'>{formatUnique(id)}</span>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    return (
        <button
            type='button'
            className='btn sm'
            onClick={async e => {
                const btn = e.currentTarget;
                try {
                    await navigator.clipboard.writeText(text);
                    btn.textContent = 'Copied';
                } catch {
                    btn.textContent = 'Copy failed';
                }
                setTimeout(() => {
                    btn.textContent = label;
                }, 1200);
            }}
        >
            {label}
        </button>
    );
}

export function downloadText(text: string | Blob, fileName: string, type = 'application/json') {
    const blob = text instanceof Blob ? text : new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function instructorsText(section: Pick<SectionRecord, 'instructors'>): string {
    return section.instructors.length ? section.instructors.join(', ') : 'Instructor not listed';
}

export function locationsText(section: Pick<SectionRecord, 'meetings'>): string {
    const rooms = [...new Set(section.meetings.map(m => m.location).filter(Boolean))];
    return rooms.length ? rooms.join(', ') : 'No room listed';
}

export function courseLabel(c: Course): string {
    return `${c.department} ${c.number}`;
}
