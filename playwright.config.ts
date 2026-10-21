import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests load the built, unpacked extension (dist/) into Chromium.
 * Branded Google Chrome ignores --load-extension, so use Chromium / Chrome for Testing:
 *   pnpm exec playwright install chromium        (CI)
 *   PW_CHROMIUM_PATH=/path/to/chrome pnpm e2e     (local override)
 */
export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    fullyParallel: false,
    workers: 1,
    reporter: [['list'], ['json', { outputFile: 'reports/e2e-results.json' }]],
});
