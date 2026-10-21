import type { ErrorEvent } from '@sentry/react';
import { ExtensionStore } from '@shared/storage/ExtensionStore';

let anonymousId: string | undefined;
ExtensionStore.get('anonymousId').then(id => {
    anonymousId = id;
});

/**
 * Fastlane: error telemetry is OFF. Upstream UT Registration Plus reports errors to its own Sentry
 * project; this fork sends nothing unless a maintainer deliberately builds with VITE_SENTRY_DSN set
 * (which would also require updating the privacy policy and store disclosures first).
 */
const FASTLANE_SENTRY_DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || undefined;

export const SENTRY_OPTIONS = {
    dsn: FASTLANE_SENTRY_DSN,
    enabled: !!FASTLANE_SENTRY_DSN,
    sendDefaultPii: false,
    skipBrowserExtensionCheck: true,
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
    debug: false,
    release: import.meta.env.VITE_PACKAGE_VERSION,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    beforeSend(event: ErrorEvent) {
        if (anonymousId) {
            event.user = { ...event.user, id: anonymousId };
        }
        return event;
    },
};
