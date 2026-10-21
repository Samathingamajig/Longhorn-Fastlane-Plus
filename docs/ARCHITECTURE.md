# Architecture

Local-first, serverless Chrome MV3 extension built with TypeScript, React 19, Vite (rolldown) and the CRX plugin — the UT Registration Plus toolchain.

```
UT course schedule page ──content script──► TableRow (UTRP) ─► RowInsights (Fastlane)
                                              │                  grade chip · async/live badge · conflict chip · + Backup
                                              └─ CatalogHeader: threshold select; caches visible sections ─► background
UT add/drop page ───────content script──► RegistrationAssistant (shadow DOM)
                                              queue state machine · copy · optional autofill (never submits)
Extension pages: fastlane.html (workspace) · calendar.html (UTRP) · demo.html (offline demo)
Background service worker: UTRP handlers + Fastlane (section cache in IndexedDB, dataset updates,
                           chrome.alarms reminders → chrome.notifications)
```

## Layers
- **Pure core** (`src/fastlane/core`, `src/fastlane/audit/parseAudit.ts`, `src/fastlane/data/datasets.ts`): no Chrome APIs, fully unit-tested. All grade math, conflict detection, modality classification, plan/backup operations, recommendation ranking, queue transitions, reminder scheduling and dataset validation live here.
- **Adapters** (`src/fastlane/adapters/utrp.ts`): convert UTRP `Course`/`UserSchedule` and the UTRP SQLite grade database into Fastlane's plain `SectionRecord`s. Grade lookups are cached per (course, instructor) for the page's lifetime and run at idle time.
- **Services**: storage-backed operations (`planService`, `recommendationService`, `privacy`) and messaging (`runtime`).
- **UI**: injected components (UnoCSS inside UTRP's shadow roots; the assistant uses its own shadow root and CSS) and the workspace page (plain CSS with light/dark tokens).

## Storage
| Store | Area | Contents |
| --- | --- | --- |
| UTRP `UserScheduleStore` | local | Schedules (active sections live here) |
| `FastlanePlans` | local | Per-schedule slots: ranked candidates, active unique, full marks, requirement |
| `FastlaneQueue` | local | Registration queue, outcomes, history, undo stack |
| `FastlaneAudit` | local | Parsed + reviewed degree audit |
| `FastlaneReminders` | local | Registration window and reminder offsets |
| `FastlaneSettings` | sync | Small preferences only |
| IndexedDB `fastlane` | extension origin | Cached sections, downloaded datasets, update metadata |

## Why backups never affect the active schedule
The active section of each slot is the course in the UTRP schedule; alternates exist only in `FastlanePlans`. Calendar, credit hours and conflict highlighting all read the UTRP schedule, so a backup can only influence them after **Activate**, which atomically swaps the course in the schedule.

## Performance
- Content script runs only on supported UT pages; Fastlane adds no page-wide polling.
- Each row is analyzed once (`useMemo` on the row element); grade lookups are deduplicated by course+instructor and deferred to idle time; the SQLite database is loaded once per page.
- Section caching is debounced (1.5 s) and batched.
- The registration assistant's optional message reader observes DOM mutations only while an attempt is pending and the setting is on.
- PDF.js loads only when a PDF is imported.

## Offline behavior
Schedules, backups, conflicts, grade percentages (bundled data), audit review, cached recommendations, the queue, map, wallpaper and exports all work offline. The workspace shows an offline indicator; dataset checks are skipped offline; cached availability is never presented as live.

## Future backend features
Account sync or cloud AI would be separate optional modules talking to their own services, never required by the core. The core remains fully functional without network access.
