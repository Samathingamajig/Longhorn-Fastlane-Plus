import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const SHOTS = resolve(process.cwd(), 'store-assets/screenshots');
mkdirSync(SHOTS, { recursive: true });

async function openDemo(page: Page, extensionId: string) {
    await page.goto(`chrome-extension://${extensionId}/demo.html`);
    await page.getByRole('button', { name: 'Create demo schedule' }).click();
    await expect(page.locator('#setupStatus')).toContainText('Created');
}

/** text content of the shadow-rooted injected cell for a unique number */
function rowFor(page: Page, unique: string) {
    return page.locator('table.results tbody tr', { has: page.locator(`td[data-th="Unique"] a`, { hasText: unique }) });
}

test.describe('Chrome extension permissions & security', () => {
    test('manifest requests only the minimal permissions and UT hosts', async ({ sw }) => {
        const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.name).toBe('Longhorn Fastlane Plus');
        expect([...(manifest.permissions ?? [])].sort()).toEqual(['alarms', 'notifications', 'scripting', 'storage', 'unlimitedStorage']);
        for (const host of manifest.host_permissions ?? []) {
            expect(host).toMatch(/utexas\.edu|collegescheduler\.com|bluera\.com/);
        }
        expect(manifest.host_permissions).not.toContain('<all_urls>');
        expect(JSON.stringify(manifest.host_permissions)).not.toContain('login.utexas.edu');
        expect(manifest.content_security_policy?.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
    });
});

test.describe('course listing integration (demo fixtures, real code)', () => {
    test('inline grade percentages, threshold changes, async and conflict indicators', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await openDemo(page, extensionId);

        // A- or better percentage with professor attribution next to the graph button
        const music = rowFor(page, '23095');
        await expect(music.locator('[data-fastlane="grade"]')).toContainText(/\d+\.\d%\s*≥A-\s*·\s*Prof/);
        const before = await music.locator('[data-fastlane="grade"]').innerText();

        // changing the threshold globally recalculates from counts
        await page.locator('#ut-registration-plus-table-head select').selectOption('B');
        await expect(music.locator('[data-fastlane="grade"]')).toContainText('≥B');
        const after = await music.locator('[data-fastlane="grade"]').innerText();
        expect(Number.parseFloat(after)).toBeGreaterThanOrEqual(Number.parseFloat(before));
        await page.locator('#ut-registration-plus-table-head select').selectOption('A-');

        // tooltip carries sample size, semesters, source and dataset date
        const tip = await music.locator('[data-fastlane="grade"]').getAttribute('title');
        expect(tip).toMatch(/letter grades/);
        expect(tip).toMatch(/semester/);
        expect(tip).toMatch(/Source:/);
        expect(tip).toMatch(/Dataset/);

        // blue async row only for verified async; WB with times is live online, not async
        await expect(music.locator('[data-fastlane="async"]')).toBeVisible();
        expect(await music.getAttribute('class')).toMatch(/isAsync/);
        const live = rowFor(page, '27425');
        await expect(live.locator('[data-fastlane="live-online"]')).toBeVisible();
        expect(await live.getAttribute('class')).not.toMatch(/isAsync/);
        expect(await rowFor(page, '33505').getAttribute('class')).not.toMatch(/isAsync/);

        // confirmed conflict names the planned class and strikes the row
        const art = rowFor(page, '20001');
        await expect(art.locator('[data-fastlane="conflict"]')).toContainText('M 408C (53780)');
        expect(await art.getAttribute('class')).toMatch(/isConflict/);
        // incomplete meeting info → unknown, not struck through
        const tba = rowFor(page, '20004');
        await expect(tba.locator('[data-fastlane="conflict-unknown"]')).toBeVisible();
        expect(await tba.getAttribute('class')).not.toMatch(/isConflict/);
        // async section never conflicts by modality alone
        await expect(music.locator('[data-fastlane="conflict"]')).toHaveCount(0);

        await page.locator('section').nth(1).screenshot({ path: `${SHOTS}/1-listing-grades-async-conflicts.png` });
    });

    test('backups do not join the active schedule, prevent duplicates, and persist after reload', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await openDemo(page, extensionId);
        const theatre = rowFor(page, '27425');
        await theatre.getByRole('button', { name: '+ Backup' }).click();
        await theatre.getByRole('button', { name: /MUS 302L · 23100/ }).click();
        await expect(theatre.locator('[data-fastlane="backup-badge"]')).toContainText('Backup #3 for MUS 302L');

        const state = await page.evaluate(async () => {
            const all = await chrome.storage.local.get(null);
            const schedules = all.schedules as Array<{ name: string; courses: Array<{ uniqueId: number }> }>;
            const demo = schedules.find(s => s.name === 'Fastlane demo (Ideal)')!;
            return { active: demo.courses.map(c => c.uniqueId).sort() };
        });
        expect(state.active).toEqual([23100, 53780, 65555]);

        // reload = browser restart for storage purposes
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#plan`);
        await expect(page.getByText('ranked backups (not counted)')).toBeVisible();
        await expect(page.locator('.metric').nth(2)).toContainText('3');
        await expect(page.locator('.metric').nth(0)).toContainText('10');
        await page.screenshot({ path: `${SHOTS}/2-schedule-builder-backups.png`, fullPage: true });

        // activate a backup: it swaps into the calendar schedule
        const slot = page.locator('.slot', { hasText: 'MUS 302L' }).first();
        await slot.locator('.cand', { hasText: '33505' }).getByRole('button', { name: 'Activate' }).click();
        await expect(slot.locator('.cand.active')).toContainText('33505');
        const swapped = await page.evaluate(async () => {
            const all = await chrome.storage.local.get(null);
            const demo = (all.schedules as Array<{ name: string; courses: Array<{ uniqueId: number }> }>).find(s => s.name === 'Fastlane demo (Ideal)')!;
            return demo.courses.map(c => c.uniqueId).sort();
        });
        expect(swapped).toEqual([33505, 53780, 65555]);
        await page.reload();
        await expect(page.locator('.slot', { hasText: 'C C 302' }).locator('.cand.active')).toContainText('33505');
    });
});

test.describe('registration assistant', () => {
    test('queue transitions, undo, history, and persistence', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/demo.html`);
        const panel = page.locator('#fastlane-registration-assistant');
        await expect(panel.locator('.code')).toHaveText('65555');
        await panel.getByRole('button', { name: 'Full' }).click();
        await expect(panel.locator('.code')).toHaveText('65705');
        await panel.getByRole('button', { name: 'Restriction' }).click();
        await panel.getByRole('button', { name: 'Conflict' }).click();
        await expect(panel.locator('.code')).toHaveText('23095'); // Western Music after three UGS failures
        await panel.getByRole('button', { name: '↶ Undo' }).click();
        await expect(panel.locator('.code')).toHaveText('65605');
        await page.reload();
        await expect(panel.locator('.code')).toHaveText('65605');
        await expect(panel.locator('.hist li')).toHaveCount(4);
        await panel.screenshot({ path: `${SHOTS}/3-registration-assistant.png` });
    });

    test('optional autofill fills the ADD field only and never submits', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/demo.html`);
        const panel = page.locator('#fastlane-registration-assistant');
        // off by default: nothing is filled
        await expect(panel.locator('.code')).toHaveText('65555');
        await expect(page.locator('#s_unique_add')).toHaveValue('');
        // manual "Fill next code" works even with autofill off
        await panel.getByRole('button', { name: 'Fill next code' }).click();
        await expect(page.locator('#s_unique_add')).toHaveValue('65555');
        await expect(page.locator('#s_unique_drop')).toHaveValue('');
        await expect(page.locator('#result')).toHaveText('');

        // enable autofill: marking Full moves to the next fallback and fills it
        await page.evaluate(async () => {
            const key = 'FastlaneSettings:autofill';
            await chrome.storage.sync.set({ [key]: { enabled: true, paused: false, preserveNonEmpty: true } });
        });
        await panel.getByRole('button', { name: 'Full' }).click();
        await expect(page.locator('#s_unique_add')).toHaveValue('65705');
        await expect(page.locator('#result')).toHaveText(''); // no submission happened

        // a value the student typed is never overwritten
        await page.locator('#s_unique_add').fill('11111');
        await panel.getByRole('button', { name: 'Full' }).click();
        await expect(page.locator('#s_unique_add')).toHaveValue('11111');
        await expect(panel.getByText('left alone')).toBeVisible();

        // history logs autofill events
        const actions = await page.evaluate(async () => {
            const q = (await chrome.storage.local.get('FastlaneQueue:queue'))['FastlaneQueue:queue'] as { history: Array<{ action: string }> };
            return q.history.map(h => h.action);
        });
        expect(actions).toContain('autofilled');
    });
});

test.describe('degree audit, recommendations, reminders, map, wallpaper', () => {
    test('imports an IDA HTML file locally and shows review items', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#audit`);
        await page.locator('input[type=file]').setInputFiles(resolve(process.cwd(), 'src/fastlane/__tests__/fixtures/dap-audit-results-real.html'));
        await expect(page.getByText('core requirements complete')).toBeVisible();
        await expect(page.getByRole('button', { name: /Needs review/ })).toBeVisible();
        await page.getByRole('button', { name: /^All \(/ }).click();
        await expect(page.getByText('CORE (090)').first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/4-degree-audit-review.png`, fullPage: false });
        await page.reload();
        await expect(page.getByText('core requirements complete')).toBeVisible(); // persisted
    });

    test('recommends only cached, requirement-matching sections with honest availability', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await openDemo(page, extensionId);
        await page.waitForTimeout(2500); // listing is cached in the background (debounced)
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#recommend?req=CORE%20050`);
        const recs = page.locator('.rec');
        await expect(recs.first()).toBeVisible();
        const text = await page.locator('main').innerText();
        expect(text).not.toContain('GOV 310L');
        expect(text).toMatch(/Open as of|Check availability|Closed as of/);
        expect(text).toContain('Satisfies Core 050');
        await page.screenshot({ path: `${SHOTS}/5-recommendations.png`, fullPage: false });
    });

    test('reminders create chrome.alarms and can be cleared', async ({ context, extensionId, sw }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#register`);
        const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        await page.evaluate(async date => {
            const key = 'FastlaneReminders:reminders';
            const cur = (await chrome.storage.local.get(key))[key] as Record<string, unknown>;
            await chrome.storage.local.set({ [key]: { ...cur, enabled: true, window: { date, time: '08:00', timeZone: 'America/Chicago' } } });
        }, future);
        await expect
            .poll(async () => (await sw.evaluate(async () => (await chrome.alarms.getAll()).map(a => a.name))).filter(n => n.startsWith('fastlane-reminder:')).length)
            .toBeGreaterThanOrEqual(4);
        await page.screenshot({ path: `${SHOTS}/6-registration-prep-reminders.png`, fullPage: false });
    });

    test('campus map and wallpaper render locally', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await openDemo(page, extensionId);
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#map`);
        await expect(page.locator('.map-wrap circle').first()).toBeVisible();
        await expect(page.getByText(/estimates, not verified routes/)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/7-campus-map.png`, fullPage: false });
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#wallpaper`);
        const dataUrlLength = await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).toDataURL('image/png').length);
        expect(dataUrlLength).toBeGreaterThan(20_000);
        await page.screenshot({ path: `${SHOTS}/8-wallpaper.png`, fullPage: false });
    });

    test('delete all Fastlane data removes plans, queue and audit', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await openDemo(page, extensionId);
        await page.goto(`chrome-extension://${extensionId}/fastlane.html#settings`);
        page.on('dialog', d => void d.accept());
        await page.getByRole('button', { name: 'Delete Fastlane data' }).click();
        await expect(page.getByText('Fastlane data deleted.')).toBeVisible();
        const keys = await page.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
        expect(keys.some(k => k.startsWith('Fastlane'))).toBe(false);
        expect(keys).toContain('schedules'); // UTRP schedules kept unless "delete everything"
    });
});
