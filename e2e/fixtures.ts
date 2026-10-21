import { chromium, type BrowserContext, test as base, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXTENSION = resolve(process.cwd(), 'dist');

export const test = base.extend<{ context: BrowserContext; extensionId: string; sw: Worker; userDataDir: string }>({
    // biome-ignore lint/correctness/noEmptyPattern: playwright fixture signature
    userDataDir: async ({}, use) => {
        await use(mkdtempSync(join(tmpdir(), 'fastlane-e2e-')));
    },
    context: async ({ userDataDir }, use) => {
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: true,
            executablePath: process.env.PW_CHROMIUM_PATH || undefined,
            args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
            viewport: { width: 1440, height: 1000 },
        });
        await use(context);
        await context.close();
    },
    sw: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker');
        await use(worker);
    },
    extensionId: async ({ sw }, use) => {
        await use(new URL(sw.url()).host);
    },
});

export const expect = test.expect;
