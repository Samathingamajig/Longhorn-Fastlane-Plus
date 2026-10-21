import { OptionsStore } from '@shared/storage/OptionsStore';
import { UserScheduleStore } from '@shared/storage/UserScheduleStore';
import { Suspense, useEffect } from 'react';
import { suspendUntilStoresReady } from 'src/lib/chrome-extension-toolkit/storage/createStore';

import {
    FastlaneAuditStore,
    FastlanePlanStore,
    FastlaneQueueStore,
    FastlaneReminderStore,
    FastlaneSettingsStore,
} from '../storage/stores';
import AuditTab from './AuditTab';
import { useHashRoute, useOnline } from './hooks';
import MapTab from './MapTab';
import PlanTab from './PlanTab';
import RecommendTab from './RecommendTab';
import RegisterTab from './RegisterTab';
import SettingsTab from './SettingsTab';
import WallpaperTab from './WallpaperTab';

const TABS = [
    ['plan', 'Schedule & backups'],
    ['recommend', 'Recommendations'],
    ['audit', 'Degree audit'],
    ['register', 'Registration prep'],
    ['map', 'Campus map'],
    ['wallpaper', 'Phone wallpaper'],
    ['settings', 'Settings & privacy'],
] as const;

export function LogoMark({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M4 20 L10 4 h3 L8.5 14 H13 L9 22 Z' fill='#fff' />
            <path d='M14 20 L20 4' stroke='#fff' strokeWidth='2.2' strokeLinecap='round' opacity='0.55' />
        </svg>
    );
}

function Workspace() {
    suspendUntilStoresReady([
        UserScheduleStore,
        OptionsStore,
        FastlaneSettingsStore,
        FastlanePlanStore,
        FastlaneQueueStore,
        FastlaneAuditStore,
        FastlaneReminderStore,
    ]);
    const [tab, params, go] = useHashRoute();
    const theme = FastlaneSettingsStore.useStore(s => s.themePreference);
    const online = useOnline();

    useEffect(() => {
        if (theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        document.title = `${TABS.find(t => t[0] === tab)?.[1] ?? 'Fastlane'} · Longhorn Fastlane Plus`;
    }, [tab]);

    return (
        <div className='shell'>
            <aside className='side'>
                <div className='logo'>
                    <div className='logo-mark'>
                        <LogoMark />
                    </div>
                    <div>
                        <strong>Longhorn Fastlane</strong>
                        <small>PLUS · UT AUSTIN PLANNER</small>
                    </div>
                </div>
                <nav className='nav' aria-label='Sections'>
                    {TABS.map(([id, label]) => (
                        <button key={id} type='button' aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
                            {label}
                        </button>
                    ))}
                </nav>
                <div className='side-foot'>
                    <span>{online ? '● Online' : '○ Offline — cached data only'}</span>
                    <span>Local-only · no account · no tracking</span>
                    <span>Independent student project. Not affiliated with UT Austin.</span>
                    <span>v{chrome.runtime.getManifest().version}</span>
                </div>
            </aside>
            <main className='main'>
                {tab === 'plan' && <PlanTab onNavigate={go} />}
                {tab === 'recommend' && <RecommendTab initialRequirement={params.get('req')} />}
                {tab === 'audit' && <AuditTab onNavigate={go} />}
                {tab === 'register' && <RegisterTab />}
                {tab === 'map' && <MapTab />}
                {tab === 'wallpaper' && <WallpaperTab />}
                {tab === 'settings' && <SettingsTab />}
                <div className='footer-note'>
                    Planning information comes from UT pages you viewed and bundled public datasets. Always verify unique numbers, availability, restrictions and
                    rooms in UT’s official course schedule. Historical grades are not predictions.
                </div>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <Suspense fallback={<div style={{ padding: 32 }}>Loading your plan…</div>}>
            <Workspace />
        </Suspense>
    );
}
