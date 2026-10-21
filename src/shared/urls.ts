/**
 * The URL of the page users are redirected to after uninstalling the app.
 *
 * Fastlane: empty unless a maintainer configures one (upstream used https://uninstall.longhorns.dev/).
 */
export const UNINSTALL_REVIEW_URL: string = (import.meta.env.VITE_FASTLANE_UNINSTALL_URL as string | undefined) ?? '';
