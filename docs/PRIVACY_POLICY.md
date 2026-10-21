# Longhorn Fastlane Plus — Privacy Policy

_Last updated: October 21, 2026_

Longhorn Fastlane Plus ("Fastlane") is an independent, student-developed Chrome extension. It is not affiliated with The University of Texas at Austin or the UT Registration Plus team.

## Summary

- Fastlane has **no server, no account and no analytics**. It does not sell, share, or transfer user data.
- Everything you enter or import stays **in your browser profile** (Chrome storage and IndexedDB).
- Fastlane never sends your EID, grades, degree audit, schedules, or registration activity to the developers or to any third party.
- Fastlane does not collect browsing history or credentials, and it does not run on UT's sign-in page.

## What is stored, where, and why

| Data | Where | Purpose |
| --- | --- | --- |
| Schedules, planned classes and ranked backups | `chrome.storage.local` | Planning, calendar, conflicts |
| Registration priority queue and attempt history | `chrome.storage.local` | The manual registration assistant |
| Imported degree audit (requirements, course history, transfer credit) | `chrome.storage.local` | Requirement-aware recommendations. The file is parsed in your browser; it is never uploaded. |
| Reminder date/time/time zone | `chrome.storage.local` + `chrome.alarms` | Local notifications |
| Course sections shown on UT course-schedule pages you open (public catalog data such as unique number, course, times, room, instructor, seat status and when you saw it) | IndexedDB (extension) | Offline recommendations |
| Preferences (grade threshold, toggles) | `chrome.storage.sync` | Settings follow you if Chrome Sync is on. No academic data is stored here. |
| Downloaded public datasets (optional) | IndexedDB (extension) | Newer historical grade data |

## Network activity

Fastlane itself makes network requests only in these cases:

1. **Optional dataset updates** — if the build is configured with a dataset source and the setting is on, at most once a day Fastlane downloads a public manifest and data files (for example from GitHub Pages). No user data is sent; the host sees an ordinary file request.
2. **Links you click** — e.g. "Open walking directions" (Google Maps), Rate My Professors, UT pages, or the feedback link (opens a GitHub issue form that *you* submit; it is public).

Features inherited from UT Registration Plus make these requests: loading UT course-schedule pages you navigate to (including the next results page when you scroll, and a course's description when you open its grade popup), checking whether you are signed in to UT when you add a course from your schedule list, and fetching public contributor statistics from the GitHub API when you open the Settings page. None of these include Fastlane data. Features that contact UT systems run only when you ask (for example adding a course from a UT page, or the optional "refresh course data", which is off by default). The upstream UT Registration Plus error-reporting service is disabled in Fastlane.

## Reading UT pages

On UT course-schedule pages, Fastlane reads the visible listing to show grades, delivery mode and conflicts. On UT's registration screen, the assistant reads nothing by default. Two optional settings, both off by default:

- **Registration autofill** places the next unique number in UT's add field. It never submits.
- **Suggest outcomes from on-screen messages** reads result messages that are already visible after *you* submit, in memory only, and asks you to confirm. Messages are never stored or sent.

## Your controls

- **Settings & privacy → Export** downloads your schedules/plans (and optionally your audit) as JSON.
- **Delete Fastlane data** removes plans, backups, queue, audit, reminders, cached sections and downloaded datasets.
- **Delete all saved information** removes everything the extension stored, including schedules.
- Uninstalling the extension removes all of its storage.

## Children

Fastlane is intended for university students and is not directed at children under 13.

## Changes

Changes to this policy will be published with the extension's source code and noted in release notes.

## Contact

Open an issue on the project's GitHub repository.
