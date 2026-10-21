import type { DayCode } from '../core/meetings';
import { formatMinutes, scheduleConflicts } from '../core/meetings';
import type { SectionRecord } from '../core/sections';
import { toSectionTimes } from '../core/sections';
import { COURSE_PALETTE } from '../core/wallpaper';

const DAYS: Array<[DayCode, string]> = [
    ['M', 'Mon'],
    ['T', 'Tue'],
    ['W', 'Wed'],
    ['TH', 'Thu'],
    ['F', 'Fri'],
];

/** Compact weekly calendar of ACTIVE sections only. */
export default function WeekGrid({ sections }: { sections: SectionRecord[] }) {
    const timed = sections.filter(s => s.meetings.length);
    const starts = timed.flatMap(s => s.meetings.map(m => m.start));
    const ends = timed.flatMap(s => s.meetings.map(m => m.end));
    const first = Math.min(8 * 60, ...starts.map(t => Math.floor(t / 60) * 60));
    const last = Math.max(17 * 60, ...ends.map(t => Math.ceil(t / 60) * 60));
    const pxPerMin = 0.8;
    const height = (last - first) * pxPerMin;
    const conflicted = new Set(scheduleConflicts(sections.map(toSectionTimes)).flatMap(([a, b]) => [a.uniqueId, b.uniqueId]));
    const hours: number[] = [];
    for (let t = first; t < last; t += 60) hours.push(t);

    return (
        <div className='week' role='img' aria-label='Weekly calendar of active classes'>
            <div>
                <div className='dayhead'>&nbsp;</div>
                <div style={{ position: 'relative', height }}>
                    {hours.map(h => (
                        <div key={h} className='hour' style={{ position: 'absolute', top: (h - first) * pxPerMin - 6, right: 0 }}>
                            {formatMinutes(h).replace(':00', '')}
                        </div>
                    ))}
                </div>
            </div>
            {DAYS.map(([day, label]) => (
                <div key={day} className='col'>
                    <div className='dayhead'>{label}</div>
                    <div style={{ position: 'relative', height }}>
                        {hours.map(h => (
                            <div
                                key={h}
                                style={{ position: 'absolute', left: 0, right: 0, top: (h - first) * pxPerMin, borderTop: '1px dashed var(--border)' }}
                            />
                        ))}
                        {sections.flatMap((s, i) =>
                            s.meetings
                                .filter(m => m.days.includes(day))
                                .map((m, j) => (
                                    <div
                                        key={`${s.uniqueId}-${j}`}
                                        className={`block ${conflicted.has(s.uniqueId) ? 'conflict' : ''}`}
                                        style={{
                                            top: (m.start - first) * pxPerMin,
                                            height: Math.max(18, (m.end - m.start) * pxPerMin),
                                            background: COURSE_PALETTE[i % COURSE_PALETTE.length],
                                        }}
                                        title={`${s.courseCode} (${s.uniqueId}) ${formatMinutes(m.start)}–${formatMinutes(m.end)} ${m.location ?? ''}`}
                                    >
                                        <b>{s.courseCode}</b>
                                        <div>{m.location}</div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
