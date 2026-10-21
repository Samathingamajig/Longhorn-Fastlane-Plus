# Automated test results

_Run on 2026-10-21 (macOS, Node 24.13, Chromium “Chrome for Testing” build 1234). Reproduce with `pnpm vitest run` and `pnpm e2e`._

## Unit tests (Vitest, jsdom): 204/204 passed in 18 files

80 of these are UT Registration Plus's own tests (unchanged and passing); the rest are Fastlane's.

| File | Passed |
| --- | --- |
| `src/fastlane/__tests__/audit.test.ts` | 14/14 |
| `src/fastlane/__tests__/datasets.test.ts` | 11/11 |
| `src/fastlane/__tests__/grades.test.ts` | 15/15 |
| `src/fastlane/__tests__/integration.test.ts` | 19/19 |
| `src/fastlane/__tests__/meetings-modality.test.ts` | 18/18 |
| `src/fastlane/__tests__/plans.test.ts` | 12/12 |
| `src/fastlane/__tests__/queue-detect.test.ts` | 12/12 |
| `src/fastlane/__tests__/recommend.test.ts` | 10/10 |
| `src/fastlane/__tests__/reminders-autofill.test.ts` | 13/13 |
| `src/shared/types/tests/Course.test.ts` | 2/2 |
| `src/shared/util/tests/colors.test.ts` | 19/19 |
| `src/shared/util/tests/random.test.ts` | 2/2 |
| `src/shared/util/tests/string.test.ts` | 9/9 |
| `src/shared/util/tests/themeColors.test.ts` | 2/2 |
| `src/shared/util/tests/time.test.ts` | 1/1 |
| `src/views/components/calendar/utils.test.ts` | 37/37 |
| `src/views/hooks/tests/useFlattenedCourseSchedule.test.ts` | 4/4 |
| `src/views/lib/CourseCatalogScraper.test.ts` | 4/4 |

## End-to-end tests (Playwright, built extension loaded unpacked): 11/11 passed

| Scenario | Result |
| --- | --- |
| Chrome extension permissions & security › manifest requests only the minimal permissions and UT hosts | pass |
| course listing integration (demo fixtures, real code) › inline grade percentages, threshold changes, async and conflict indicators | pass |
| course listing integration (demo fixtures, real code) › backups do not join the active schedule, prevent duplicates, and persist after reload | pass |
| registration assistant › queue transitions, undo, history, and persistence | pass |
| registration assistant › optional autofill fills the ADD field only and never submits | pass |
| degree audit, recommendations, reminders, map, wallpaper › imports an IDA HTML file locally and shows review items | pass |
| degree audit, recommendations, reminders, map, wallpaper › recommends only cached, requirement-matching sections with honest availability | pass |
| degree audit, recommendations, reminders, map, wallpaper › reminders create chrome.alarms and can be cleared | pass |
| degree audit, recommendations, reminders, map, wallpaper › campus map and wallpaper render locally | pass |
| degree audit, recommendations, reminders, map, wallpaper › works offline: grades, conflicts, plans and cached recommendations | pass |
| degree audit, recommendations, reminders, map, wallpaper › delete all Fastlane data removes plans, queue and audit | pass |

## Other checks

| Check | Result |
| --- | --- |
| Type check (`tsgo --noEmit`) | no errors |
| `scripts/fastlane/security-check.mjs dist` (MV3, CSP, permissions, hosts, no remote code, no telemetry endpoints) | passed |
| `scripts/fastlane/dataset-manifest.mjs --check` (bundled grade DB hash/size) | up to date |
| Package | `package/longhorn-fastlane-plus-1.0.0.zip` (8.2 MB, 121 files; SHA-256 in `package/RELEASE.json`) |

## Coverage of the requested test areas

| Requirement | Where |
| --- | --- |
| Grade calculations & thresholds, boundaries, excluded categories | `grades.test.ts`, e2e listing test |
| Asynchronous identification | `meetings-modality.test.ts`, e2e listing test |
| Conflict detection (multiple meetings, unknown, async) | `meetings-modality.test.ts`, `recommend.test.ts`, e2e listing test |
| Backups not affecting the active schedule | `plans.test.ts`, e2e backups test |
| Requirement-aware backup generation | `recommend.test.ts`, `queue-detect.test.ts` (exhausted groups), e2e recommendations |
| Degree audit parsing & uncertain results | `audit.test.ts` (Degree Audit Plus real IDA fixture, pending transfer, PDF text), e2e audit import |
| Registration queue state transitions | `queue-detect.test.ts`, e2e assistant |
| Duplicate-section prevention | `plans.test.ts`, `queue-detect.test.ts` |
| Persistence after browser reload | `datasets.test.ts` (IndexedDB reconnect), e2e reload tests |
| Upstream integration & data-source failures | `integration.test.ts`, `datasets.test.ts` |
| Extension permissions & security | e2e manifest test, `integration.test.ts`, security-check script |
| Autofill never submits; reminders; offline | `reminders-autofill.test.ts`, e2e autofill / reminders / offline |

Not covered by automation: live, signed-in UT pages (see `LIMITATIONS.md`).
