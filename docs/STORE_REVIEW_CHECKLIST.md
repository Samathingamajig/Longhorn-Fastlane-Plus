# Chrome Web Store review checklist

Run before every submission. Items marked **(auto)** are enforced by `pnpm package:fastlane` / CI.

## Build & policy
- [ ] **(auto)** Manifest V3; CSP `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`
- [ ] **(auto)** No remotely hosted code: no remote `<script>`, `importScripts` or `import()` from the network
- [ ] **(auto)** Only these permissions: storage, unlimitedStorage, scripting, alarms, notifications
- [ ] **(auto)** Host access limited to UT domains (+ inherited collegescheduler.com, bluera.com); no `<all_urls>`
- [ ] **(auto)** No analytics/telemetry endpoints in the bundle (Sentry DSN removed)
- [ ] **(auto)** Description ≤ 132 characters
- [ ] **(auto)** Unit tests, type check, dataset manifest check and Chromium e2e tests pass
- [ ] Source maps and dev-only files excluded from the ZIP (package script does this)
- [ ] Version in `package.json` bumped and matches the git tag

## Listing
- [ ] Description matches actual features (no claims of UT approval or live seat availability)
- [ ] "Independent, not affiliated with UT Austin or UT Registration Plus" disclaimer present
- [ ] Permission justifications copied from `docs/STORE_LISTING.md`
- [ ] Privacy policy published at a public URL and linked
- [ ] Privacy-practices form: no data collected/transmitted; local handling disclosed
- [ ] Screenshots regenerated from the current build (`pnpm e2e`)
- [ ] Icons 16/32/48/128 present (original artwork, no UT marks)

## Legal / trademark
- [ ] UT Trademark Licensing consulted about "Longhorn" in the name, or the product renamed
- [ ] No UT seal, longhorn silhouette or "Hook 'em" marks in icons/screenshots
- [ ] `THIRD_PARTY_NOTICES.txt` regenerated (`pnpm notices`) and shipped
- [ ] Highcharts non-commercial terms still satisfied (product is free / non-commercial)
- [ ] Grade-data redistribution reviewed (see `docs/DATA_SOURCES.md`)

## Registration policy
- [ ] Autofill and on-screen result reading default **off**
- [ ] No code path submits forms, clicks UT buttons, or sends registration requests (enforced by `integration.test.ts`)
- [ ] Registrar guidance requested about the optional autofill/result-reading features; if UT objects, remove them before release

## Manual smoke test (unpacked build)
- [ ] Course schedule page: grade chips, threshold selector, blue async rows, conflicts with the right class named
- [ ] Add a backup, activate it, confirm the calendar swapped
- [ ] Import an IDA HTML file; review screen appears
- [ ] Registration page: assistant visible, copy works, outcomes advance, undo works
- [ ] Reminder test notification appears
- [ ] Turn off Wi-Fi: Fastlane page, schedules, conflicts, grades and cached recommendations still work
- [ ] Delete Fastlane data removes plans/queue/audit
