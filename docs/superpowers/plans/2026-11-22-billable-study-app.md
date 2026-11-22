# Billable Study App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home-screen iPhone web app (PWA) for camera-watched study sessions with a career-ladder game, office, marks tracker for 5 Fall 2026 courses, hosted on GitHub Pages.

**Architecture:** Static site, no build step: plain ES modules in `js/`, pure logic modules (economy, grades, session state machine, purge planning, contracts) separated from DOM/browser-API modules so the logic is unit-tested in a browser test page. One app state object persisted in IndexedDB (`billable` DB), time-lapse frames in a separate IndexedDB store. Hash router renders one view at a time.

**Tech Stack:** Vanilla JS (ES2022 modules), CSS, IndexedDB, getUserMedia, Screen Wake Lock, MediaRecorder, Web Share, Service Worker. Tests: a tiny in-repo harness run in the built-in browser (this PC has **no Node**, no `gh`, no PIL; it has Python 3.13 and git).

**Spec:** `docs/superpowers/specs/2026-11-22-study-app-design.md`

## Global Constraints

- No build step, no npm, no external runtime dependencies; every file is served as-is by GitHub Pages. No CDN scripts (must work offline).
- iPhone Safari home-screen app; works portrait and landscape; no orientation lock.
- All data on device; no network calls except loading the app itself.
- Visual style A · Trading Floor: background `#0b0f17`, card `#121a26`, border `#1f2a3a`, gold `#f5c451`, green `#33d17a`, red `#ff6b6b`, dim text `#7d8a9c`, monospace numerals. Reference: `mockups/styles.html` option A.
- Day boundary 04:00 local. Streak needs one **completed** session ≥ 15 min.
- Leaving the app: 10 s grace; time away not credited; beyond grace the session fails.
- Time-lapse retention 7 days unless starred; total cap 300 MB default (Settings), oldest unstarred deleted first.
- Spending never reduces rank. Career save separate from term course data. State has `schema` version; migrations never drop data.
- Service-worker updates never touch IndexedDB.
- Laurier courses show % + 12-point; Waterloo courses show %.

## Review Focus

1. **App killed mid-session** (iOS evicts it, user swipes it away) → on next launch the session is marked failed with a fine, never left "running" forever or double-paid. Test in Task 7 (`recoverActive`).
2. **Phone auto-locks or a phone call arrives mid-session** → treated exactly like leaving the app (grace then fail); camera and wake lock re-acquired on return within grace. Test in Task 7 (hide/show sequences) + device checklist Task 19.
3. **Marks entered out of order / partial components with drop rules** (e.g. 3 of 10 MATH 137 quizzes graded) → current % and "needed" never NaN, never > 100% shown as reachable, "out of reach"/"locked in" states shown. Tests in Task 5.
4. **Storage full / IndexedDB write fails while saving frames** → session continues without time-lapse, no crash, user sees "time-lapse paused (storage full)". Test in Task 8 (`planPurge` + error path).
5. **Restoring a backup from an older schema or a junk file** → rejected with a message, current data untouched. Test in Task 12.

---

## File Structure

```
index.html                 app shell, tab bar, <main id="view">
manifest.webmanifest       standalone, theme #0b0f17, icons
sw.js                      cache-first app shell, versioned cache name
icons/icon-180.png, icon-192.png, icon-512.png   (generated)
tools/make_icons.py        pure-Python PNG writer (no PIL)
css/app.css                tokens + layout + portrait/landscape rules
js/app.js                  boot, router, recovery, purge on launch
js/dom.js                  h(tag, props, ...children), money(), fmtMin()
js/time.js                 dayKey, weekKey, addDays, isExamSeason
js/store.js                state shape, load/save (IndexedDB), migrations
js/economy.js              RANKS, rankFor, payFor, fines, bonuses, prestige
js/streak.js               applySessionToStreak, rolloverStreak, PTO
js/contracts.js            seeded daily contracts + evaluation
js/courses-data.js         the 5 pre-loaded courses
js/grades.js               computeCourse, neededOnRemaining, twelvePoint, passWarnings
js/session.js              pure session state machine + finalize/payout
js/camera.js               camera start/stop, frame grab, wake lock
js/timelapse.js            frame storage, planPurge, purge, playback, export
js/achievements.js         ACHIEVEMENTS + evaluate
js/items.js                ITEMS catalog, SHELLS, slotsFor
js/office.js               buy, equip, renderOffice(svg)
js/review.js               weekly review computation
js/backup.js               exportBackup, parseBackup
js/sound.js                WebAudio blips (cash, promo, fail)
js/views/home.js session.js marks.js office.js stats.js settings.js
tests/index.html, tests/harness.js, tests/*.test.js
.claude/launch.json        python http.server on repo root, port 8765
```

**Test run command (every task):** start server `mockups`→ replace config with name `app` (`python -m http.server 8765` at repo root), open `http://localhost:8765/tests/` in the built-in browser, read page text. Passing output: a line `ALL PASS (N tests)`; failures list `FAIL <suite> › <name>: <message>`.

---

### Task 1: Repo scaffold, test harness, time utilities

**Files:**
- Create: `.gitignore` (`.superpowers/`), `.claude/launch.json` (config `app`: `python -m http.server 8765`, port 8765), `tests/harness.js`, `tests/index.html`, `js/time.js`, `tests/time.test.js`
- Move: `mockups/styles.html` stays as reference.

**Interfaces:**
- Produces: `describe(name, fn)`, `it(name, fn)`, `expect(v).toBe(x) / .toEqual(x) / .toBeCloseTo(x, digits) / .toBeNull() / .toThrow()`; `run()` renders results.
- Produces (`js/time.js`): `dayKey(date: Date): string` ("YYYY-MM-DD", 4 am boundary), `weekKey(dayKey: string): string` (dayKey of that week's Monday), `addDays(dayKey, n): string`, `isExamSeason(date: Date): boolean` (Dec 1–23 2026 inclusive, local).

- [ ] **Step 1:** `git init`, first commit of spec, plan, mockups. Ask user for branch via `propose_branch` before first code edit.
- [ ] **Step 2: Write failing tests** `tests/time.test.js`:
```js
expect(dayKey(new Date(2026,10,22,3,59))).toBe('2026-11-21');
expect(dayKey(new Date(2026,10,22,4,0))).toBe('2026-11-22');
expect(weekKey('2026-11-22')).toBe('2026-11-16');   // Sunday → previous Monday
expect(weekKey('2026-11-23')).toBe('2026-11-23');
expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
expect(isExamSeason(new Date(2026,11,1,12))).toBe(true);
expect(isExamSeason(new Date(2026,11,24,12))).toBe(false);
```
- [ ] **Step 3:** Run test page → expect FAIL (module missing).
- [ ] **Step 4:** Implement harness (`tests/index.html` imports every `*.test.js` listed in an array, then `run()`), and `js/time.js`. Use local-time arithmetic, never `toISOString()` (UTC shift bug).
- [ ] **Step 5:** Run → `ALL PASS`.
- [ ] **Step 6:** Commit `feat: scaffold, test harness, time utils`.

### Task 2: State store and persistence

**Files:** Create `js/store.js`, `tests/store.test.js`

**Interfaces:**
- Produces:
```js
// State shape (schema 1)
{
  schema: 1,
  career: { xp, lifetime, cash, prestige, why: string[3],
            streak: { count, best, lastDay: string|null, pto },
            owned: {[itemId]: true}, equipped: {[slot]: itemId},
            achievements: {[id]: ts}, contracts: { day, ids: string[3], done: string[], allPaid: bool },
            lastReviewWeek: string|null, lastBackup: number|null, filedMarks: {[itemKey]: true} },
  settings: { sound: true, capMB: 300 },
  term: { id: 'F26', courses: Course[] },        // from courses-data.js
  sessions: SessionRecord[],
  active: ActiveSession|null
}
```
`defaultState(): State`, `migrate(raw: object): State` (throws `Error('bad-backup')` if no numeric `schema` or schema > 1), `loadState(): Promise<State>`, `saveState(s): Promise<void>` (IndexedDB db `billable`, store `kv`, key `state`), `requestPersist(): Promise<boolean>`.
- `why` default: `['Make money', 'Land the internship', "Grades I'm proud of"]`.

- [ ] **Step 1: Failing tests:** `defaultState().schema === 1`; `defaultState().term.courses.length === 5`; `migrate({schema:1, ...defaultState()})` round-trips deep-equal; `migrate({})` throws `bad-backup`; `migrate({schema:99})` throws; `migrate` of a state missing `settings` fills defaults (forward-compat fill).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (`courses-data.js` stub exporting `COURSES = []` acceptable until Task 6; then test expects 5 — mark that assertion to pass after Task 6 by placing it in `courses.test.js` instead). **Step 4:** Run → PASS. **Step 5:** Commit `feat: state store`.

### Task 3: Economy — ranks, pay, fines, bonuses, prestige

**Files:** Create `js/economy.js`, `tests/economy.test.js`

**Interfaces:**
- Produces: `RANKS: {name, hours, rate}[]` (13 entries), `RANK_THRESHOLDS: number[]` (xp $ per rank), `rankIndex(xp): number`, `progressToNext(xp): {rank, next, pct, minutesLeftAtRate}`, `rateFor(rankIdx, prestige): number`, `payFor(minutes, ctx): number`, `fineFor(targetMin, ctx): number`, `streakMultiplier(count): number`, `canPrestige(career): boolean`, `doPrestige(career): career` (pure), `CITIES`.
- `ctx = { rankIdx, prestige, streakCount, unwatched: bool, examMult: 1|1.5|2 }`

Values (spec 6.5 + my rates):

| Rank | hours | $/min |
|---|---|---|
| Intern I/II/III | 0/2/5 | 10/12/14 |
| Analyst I/II/III | 10/18/28 | 18/21/24 |
| Associate I/II/III | 40/55/75 | 30/34/38 |
| VP | 100 | 50 |
| Director | 140 | 65 |
| Managing Director | 200 | 80 |
| Partner | 300 | 100 |

Threshold[i] = threshold[i−1] + (hours[i] − hours[i−1]) × 60 × rate[i−1].

Pay = `round(minutes × rate × streakMultiplier × (1 + lengthBonus) × examMult × (unwatched ? 0.8 : 1))`, `rate = RANKS[i].rate × (1 + 0.1 × prestige)`, lengthBonus 0.25 if minutes ≥ 90, 0.10 if ≥ 50, else 0 (based on the session's completed minutes incl. overtime). `streakMultiplier(c) = min(2, 1 + 0.05c)`. Fine = `round(0.1 × payFor(targetMin, ctx))`; cash clamps at 0. Prestige: requires rank Partner; sets `xp = RANK_THRESHOLDS[3]` (Analyst I), `prestige += 1`. `CITIES = ['Waterloo','Toronto','New York','London','Hong Kong','Singapore']`; city = `CITIES[min(prestige, 5)]`, prestige ≥ 6 shows `Singapore ×N`.

- [ ] **Step 1: Failing tests:**
```js
expect(RANK_THRESHOLDS[1]).toBe(1200);
expect(RANK_THRESHOLDS[3]).toBe(7560);
expect(RANK_THRESHOLDS[12]).toBe(1004880);
expect(rankIndex(7559)).toBe(2); expect(rankIndex(7560)).toBe(3);
expect(payFor(25,{rankIdx:0,prestige:0,streakCount:0,unwatched:false,examMult:1})).toBe(250);
expect(payFor(50,{rankIdx:0,prestige:0,streakCount:0,unwatched:false,examMult:1})).toBe(550);
expect(payFor(90,{rankIdx:0,prestige:0,streakCount:10,unwatched:true,examMult:1.5})).toBe(Math.round(90*10*1.5*1.25*1.5*0.8));
expect(streakMultiplier(40)).toBe(2);
expect(fineFor(50,{rankIdx:0,prestige:0,streakCount:0,unwatched:false,examMult:1})).toBe(55);
expect(doPrestige({xp:RANK_THRESHOLDS[12],prestige:0}).xp).toBe(7560);
expect(canPrestige({xp:RANK_THRESHOLDS[11]})).toBe(false);
```
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: economy`.

### Task 4: Streak, PTO, daily contracts

**Files:** Create `js/streak.js`, `js/contracts.js`, `tests/streak.test.js`, `tests/contracts.test.js`

**Interfaces:**
- `rolloverStreak(streak, todayKey): streak` — called on launch and before applying a session. If `lastDay` is before yesterday: consume 1 PTO per missed day (max held 2); if not enough PTO, `count = 0`.
- `applySessionToStreak(streak, dayKey, minutes, completed): {streak, extended: bool}` — extends only if completed && minutes ≥ 15 && `lastDay !== dayKey`.
- `PTO_PRICE_MIN = 120` (price = 120 × current rate), `PTO_MAX = 2`.
- `dailyContracts(dayKey, ctx): Contract[3]` — deterministic (mulberry32 seeded by string hash of dayKey); if `ctx.behindCourseIds.length`, slot 0 is always `study_behind` for `behindCourseIds[0]` with pay ×2.
- `Contract = {id, label, check(todaySessions, ctx): boolean, rewardMin}`; reward cash = `rewardMin × rate`. Pool (min 10): `two_courses` (15), `early_bird` start before 10:00 (15), `deep_work` one session ≥ 50 (20), `marathon` 90 total min (20), `triple` 3 completed sessions (20), `night_shift` session started after 21:00 (10), `math_day` ≥ 30 min MATH 135 or MATH 137 (15), `econ_day` ≥ 30 min EC120 (15), `no_walkouts` 2 completed sessions and 0 failed (15), `study_behind` 30 min on the behind course (30 ×2). All-3 bonus = 30 × rate.

- [ ] **Step 1: Failing tests:** streak: consecutive days increment; same day twice doesn't; 14-min session doesn't; failed doesn't; 1 missed day with 1 PTO keeps count and pto→0; 2 missed days with 1 PTO resets to 0; `best` tracks max. Contracts: same dayKey → same ids; different days differ for at least one of 7 consecutive days; behind course forces `study_behind` at index 0; no duplicate ids in a day; `check` of `two_courses` true for sessions in MATH137+CS115.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: streak and contracts`.

### Task 5: Grades engine

**Files:** Create `js/grades.js`, `tests/grades.test.js`

**Interfaces:**
```js
// Course
{ id, code, name, school:'laurier'|'waterloo', target:80, finalDate: string|null,
  components: [{ id, name, weight, rule: Rule, items: [{ id, name, date: string|null, score: number|null }] }],
  bonus: { label, max, value: number|null } | null,
  passRule: 'cs115' | 'bu111' | null }
// Rule: {type:'avg'} | {type:'dropLowest', n} | {type:'bestOf', keep} | {type:'ranked', weights:number[]}
```
`score` is a percent 0–100+ (UI converts score/outOf to %).
- `componentScore(component, fill: number|null): number|null` — fill = value for ungraded items (null → use graded only, apply drop/best only if all items graded; with partial grading use plain mean of graded).
- `finalGrade(course, fill): number` — Σ weight × componentScore / Σ weight(=100) + bonus value; components with no graded items and fill null are excluded and the denominator shrinks.
- `computeCourse(course): { current: number|null, gradedWeight: number, needed: number|null, status: 'on-track'|'behind'|'locked'|'out-of-reach'|'no-data', projected: number|null }` — `current = finalGrade(course, null)`; `needed` = bisection on fill ∈ [0, 150] to 0.01 so `finalGrade(course, fill) ≥ target`; `locked` if fill 0 already meets target, `out-of-reach` if needed > 100; `behind` if current < target; `projected = finalGrade(course, current)`.
- `twelvePoint(pct): {letter, points}` — round pct to integer first; table from spec 6.7.
- `passWarnings(course): string[]` — cs115: projected weighted (lab quizzes + midterm + final) < 40 of 80 → `"At risk: need 50% on exams + lab quizzes to pass"`; bu111: both exams graded and both < 50 → `"Must pass one exam"`, or midterm < 50 and final ungraded → `"Midterm under 50%: you must pass the final"`.
- `overallAverage(courses): number|null` — mean of `current` over courses with data.

- [ ] **Step 1: Failing tests:**
```js
// MATH137-like: quizzes best 9 of 10
const q = {weight:20, rule:{type:'bestOf',keep:9}, items: Array.from({length:10},(_,i)=>({score: i===0?0:80}))};
expect(componentScore(q, null)).toBe(80);
// EC120 ranked 8/2
expect(componentScore({weight:10, rule:{type:'ranked',weights:[8,2]}, items:[{score:50},{score:90}]}, null)).toBe(82);
// needed: quizzes all 90 (20%), midterm 70 (30%), final 50% ungraded, target 80 → 82
expect(computeCourse(c137).needed).toBeCloseTo(82, 1);
expect(computeCourse(c137).current).toBeCloseTo((18+21)/50*100, 1); // 78
// out of reach
expect(computeCourse(hopeless).status).toBe('out-of-reach');
// nothing graded
expect(computeCourse(empty).status).toBe('no-data');
expect(Number.isNaN(computeCourse(empty).needed)).toBe(false);
// partial dropLowest: 2 of 5 graded (60, 100) → 80, no drop yet
expect(componentScore({weight:19,rule:{type:'dropLowest',n:1},items:[{score:60},{score:100},{score:null},{score:null},{score:null}]}, null)).toBe(80);
expect(twelvePoint(84.6)).toEqual({letter:'A',points:11});
expect(twelvePoint(49.4)).toEqual({letter:'F',points:0});
expect(passWarnings(cs115Risky).length).toBe(1);
```
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: grades engine`.

### Task 6: Pre-loaded course data

**Files:** Create `js/courses-data.js`, `tests/courses.test.js`

**Interfaces:** Produces `COURSES: Course[]` (deep-cloned into state by `defaultState`). Ids: `MATH137`, `CS115`, `MATH135`, `EC120`, `BU111`. Data exactly per spec 6.7 (weights, rules, dates; MATH 135 weekly = 11 items in one component weight 44 rule avg; MATH 137 quiz dates Sep 21, 28, Oct 5, 19, Nov 2, 9, 16, 23, 30, Dec 7; MATH 135 W0–W10 Wednesdays Sep 9 → Nov 18 skipping reading week Oct 14; EC120 minor = 5 items "Part 1..5" in a weight-25 avg component; BU111 each item its own component with weight = marks; bonuses: CS115 max 2, MATH135 max 3, EC120 `Learning Curve` max 5 as raw points on minor (store as overall bonus ×0.25), BU111 max 5). `finalDate: null` everywhere. School: EC120/BU111 laurier, others waterloo.

- [ ] **Step 1: Failing tests:** each course's component weights sum to 100; 5 courses; MATH137 quiz component has 10 items and rule bestOf 9; CS115 assignments 5 items dropLowest 1; BU111 `passRule === 'bu111'`; CS115 `passRule === 'cs115'`; every date is null or valid `YYYY-MM-DD`.
- [ ] **Step 2–4:** fail → implement → pass (also re-enable store test expecting 5 courses). **Step 5:** Commit `feat: fall 2026 course data`.

### Task 7: Session state machine and payout

**Files:** Create `js/session.js`, `tests/session.test.js`

**Interfaces:**
- `GRACE_MS = 10000`
- `startSession({courseId, targetMin, watched, now}): Active` → `{id, courseId, targetMin, watched, startedAt, awayMs:0, hiddenAt:null, status:'running'}`
- `onHide(a, now): Active` (sets hiddenAt if running/overtime)
- `onShow(a, now): Active` — if hiddenAt and `now − hiddenAt > GRACE_MS` → `status:'failed'`, `endedAt: hiddenAt`; else `awayMs += now − hiddenAt`, hiddenAt null.
- `elapsedMs(a, now): number` — excludes awayMs and current hidden time.
- `tick(a, now): Active` — running → `'overtime'` once elapsed ≥ target (caller shows target-reached payout banner but session continues until clock-out).
- `walkOut(a, now)` → `'walkedout'` if before target; if in overtime → `clockOut`.
- `clockOut(a, now)` → `'completed'` (only valid from overtime).
- `recoverActive(a, now): Active` — any non-final status → `'failed'` (`endedAt` = hiddenAt ?? now).
- `finalizeSession(state, a, now): {state, receipt}` — pure. Completed: minutes = floor(elapsed/60000); pay via `payFor` with ctx from state (`examMult`: 2 if course is the next upcoming final among courses with `finalDate` and in exam season, 1.5 if exam season, else 1); `xp += pay`, `lifetime += pay`, `cash += pay`; streak via `applySessionToStreak`; contracts re-evaluated and newly completed paid; achievements evaluated (Task 10, injected as function param `evaluateAchievements` defaulting to identity until then). Failed/walkedout: fine via `fineFor(targetMin)`, cash clamped ≥ 0, record kept with status, no streak. Appends `SessionRecord {id, courseId, startedAt, endedAt, targetMin, minutes, status, earned, fine, watched, hasTimelapse:false, starred:false}`; sets `state.active = null`. Receipt: `{earned, fine, bonuses: string[], promotedTo: string|null, newAchievements: string[], contractsDone: string[], streakExtended}`.

- [ ] **Step 1: Failing tests:** hide 5 s then show → still running, awayMs 5000, elapsed excludes it; hide 11 s → failed; hide then never show then `recoverActive` → failed; reaching target → overtime; walkOut before target → walkedout; finalize completed 25 min at Intern I, streak 0 → earned 250, cash 250, streak count 1; finalize walkedout target 50 → fine 55, cash clamps to 0 from 20; finalize promotion crossing 1200 → `promotedTo 'Intern II'`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: session state machine`.

### Task 8: Camera, wake lock, time-lapse storage

**Files:** Create `js/camera.js`, `js/timelapse.js`, `tests/timelapse.test.js`

**Interfaces:**
- `camera.js`: `startCamera(videoEl): Promise<boolean>` (front camera `facingMode:'user'`, `playsinline muted autoplay`; false on denial), `stopCamera()`, `grabFrame(videoEl, maxEdge=360, quality=0.6): Promise<Blob>` (canvas, draws course+time overlay text bottom-left), `acquireWakeLock(): Promise<boolean>`, `releaseWakeLock()`; re-acquire on `visibilitychange` visible.
- `timelapse.js`: `FRAME_INTERVAL_MS = 6000`, `startRecorder(sessionId, videoEl, overlayText): {stop(): Promise<{frames, bytes}>}` (stops silently on write error and sets `onError` flag shown as "time-lapse paused (storage full)"), IndexedDB db `billable-media` stores `frames` (key `[sessionId, idx]`) and `meta` (key sessionId: `{sessionId, createdAt, bytes, frames, starred}`); `planPurge(metas, now, capBytes): string[]` (pure: unstarred older than 7×24 h, then oldest unstarred until total ≤ cap), `purge(now, capBytes)`, `setStarred(id, bool)`, `wouldExceedCap(metas, capBytes): boolean` (starred-only total > cap), `usage(): Promise<{bytes, count}>`, `loadFrames(sessionId): Promise<Blob[]>`, `playTimelapse(canvasEl, frames, fps=30)`, `exportVideo(sessionId): Promise<File|null>` (MediaRecorder on `canvas.captureStream(30)`; mime `video/mp4` if `isTypeSupported`, else `video/webm`; null if unsupported), `shareVideo(file)` via `navigator.share({files:[file]})`.

- [ ] **Step 1: Failing tests (pure):** `planPurge` deletes 8-day-old unstarred, keeps 8-day-old starred, keeps 6-day-old; with cap 100 and metas 60(old),60(new) unstarred → deletes the older only; starred never deleted even if over cap; `wouldExceedCap` true when starred sum > cap.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: Manual browser check:** temporary `tests/camera.html` page: start camera (built-in browser may lack a camera → confirm `startCamera` resolves false without throwing), grab a frame from a canvas-fed video, save + load round-trip of 3 frames, play them. Delete the page after.
- [ ] **Step 6:** Commit `feat: camera and time-lapse`.

### Task 9: Items catalog, office logic, office rendering

**Files:** Create `js/items.js`, `js/office.js`, `tests/office.test.js`

**Interfaces:**
- `SHELLS: {id, name, minRank, slots: string[]}[]`: cubicle (0: desk, chair, computer, wall1, deskAcc), shared (3: + window, floorL), own (6: + wall2, shelf, rug), corner (9: + floorR, pet), floor (10: + lounge, bar), penthouse (12: + art, view). City variants are the same slots with city name in the title and a city skyline in the window.
- `ITEMS: {id, name, slot, tier:'common'|'rare'|'legendary', price, minRank, achievement?: string, city?: string, art: string}[]` — **≥ 80 items**, every slot ≥ 4 items; prices: common 2–8k, rare 15–60k, legendary 100k–1M; ≥ 8 achievement-only items (price 0; e.g. `gold_watch` ← `streak_100`), ≥ 2 city items per non-Waterloo city. `art` is an emoji or small inline SVG string.
- `shellFor(rankIdx): Shell`, `slotsFor(rankIdx)`, `canBuy(career, item, rankIdx): {ok, reason}`, `buy(career, itemId, rankIdx): career`, `equip(career, slot, itemId): career`, `renderOffice(career, rankIdx): SVGElement` (viewBox 0 0 360 220, background by shell, items at fixed slot coordinates, empty slots as dashed outlines with "+").
- PTO is a shop item `pto` (slot `none`, consumable, price `PTO_PRICE_MIN × rate`, blocked at 2 held).

- [ ] **Step 1: Failing tests:** ITEMS ≥ 80, unique ids, each `slot` exists in some shell or is `none`; `buy` deducts cash and doesn't change xp; can't buy rank-locked, can't afford, achievement-only, already owned; `equip` fails for unowned or for slot not in current shell; `shellFor(9).id === 'corner'`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: office and items`.

### Task 10: Achievements, weekly review, mark bonuses

**Files:** Create `js/achievements.js`, `js/review.js`, `tests/achievements.test.js`, `tests/review.test.js`

**Interfaces:**
- `ACHIEVEMENTS: {id, name, desc, secret: bool, check(state): bool, rewardItem?: string}[]` — **≥ 50**, covering the spec 6.5 categories. Required ids: `first_shift` (first completed), `streak_3/7/14/30/60/100`, `hours_10/50/100/300`, `deep_90` (one session ≥ 90 min), `early_bird` (5 sessions started before 8:00), `night_owl` (5 after 22:00), `course_<ID>_10h` for each course, `deans_list` (overall average ≥ 80 with ≥ 3 courses having data), `beat_target_5`, `comeback` (final graded > midterm in any course), `contracts_50`, `perfect_week` (7-day streak within one weekKey), `phoenix` (rebuild a broken ≥ 7 streak back to 7), `prestige_1`, `collector_25` (own 25 items).
- `evaluateAchievements(state, now): {state, newly: string[]}` (grants reward items).
- `weeklyReview(state, todayKey): null | {weekKey, hours, prevHours, sessions, byCourse: {[id]: minutes}, beat: bool, bonus}` — null if `career.lastReviewWeek === weekKey(todayKey)`; reviews the previous week; bonus = `beat ? 30 × rate : 0`; `markReviewed(state, review)` pays and sets lastReviewWeek.
- `fileMark(state, courseId, itemId, score): {state, receipt}` — sets score; first time per item pays filing bonus `2 × rate`; if score ≥ course.target pays `10 × rate` once; re-runs achievements.

- [ ] **Step 1: Failing tests:** ≥ 50 unique ids; `first_shift` granted once; `streak_100` grants `gold_watch`; review null twice in same week; review beat → bonus `30 × rate`; `fileMark` pays filing once, beat bonus once, editing score again pays nothing.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat: achievements, review, mark bonuses`.

### Task 11: App shell, router, Home view, sounds

**Files:** Create `index.html`, `css/app.css`, `js/app.js`, `js/dom.js`, `js/sound.js`, `js/views/home.js`

**Interfaces:**
- `dom.js`: `h(tag, props?, ...children): Element`, `money(n): string` (`$41,200`), `fmtMin(min): string` (`3h 10m`).
- `app.js`: on boot — `loadState` → `recoverActive` if `state.active` (finalize as failed, show receipt toast) → `rolloverStreak` → regenerate contracts if day changed → `purge` → `requestPersist` → route. `getState()`, `commit(newState)` (save + re-render), routes `#home #session #office #marks #marks/<id> #stats #settings`; tab bar (Home, Office, Marks, Stats) hidden on `#session`.
- `sound.js`: `playCash()`, `playPromo()`, `playFail()` — WebAudio oscillators; no-op if `settings.sound` false.
- Home (spec 6.1/1): WHY I GRIND card (tap → settings), rank + gold salary (cash) + "lifetime" small, progress bar + "Xh Ym to <next>", streak 🔥 + multiplier, contracts x/3 (expandable list), portfolio rows per course (`computeCourse` current, ▲ green on-track/locked, ▼ red behind/out-of-reach, `—` no-data), next final countdown + needed % (when any `finalDate`), "Back up" nudge if `lastBackup` older than 7 days, weekly review modal when available, gold **CLOCK IN**. Install hint banner when `!navigator.standalone` on iOS.
- CSS: tokens from Global Constraints; `@media (orientation: landscape)` two-column grid for Home and Session; safe-area insets (`env(safe-area-inset-*)`); min tap target 44 px; no horizontal scroll at 320 px width.

- [ ] **Step 1:** Implement shell + Home. **Step 2: Verify** in built-in browser at `http://localhost:8765/` with `resize_window` mobile (375×812) and landscape (812×375): screenshot both; checks: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), CLOCK IN visible without scrolling in portrait, portfolio shows 5 courses. **Step 3:** Tests still `ALL PASS`. **Step 4:** Commit `feat: app shell and home`.

### Task 12: Backup / restore and Settings view

**Files:** Create `js/backup.js`, `js/views/settings.js`, `tests/backup.test.js`

**Interfaces:** `exportBackup(state): File` (`billable-backup-YYYY-MM-DD.json`, `{app:'billable', exportedAt, state}`), `parseBackup(text): State` (throws `Error('bad-backup')` for invalid JSON, wrong `app`, or `migrate` failure). Settings: edit 3 why lines, per-course target (0–100), sound toggle, time-lapse cap (100/300/500/1000 MB), storage used (`usage()`), Back up (share sheet; fallback download link), Restore (file input → confirm → replace state; on error show message, keep current state), Reset all (double confirm).

- [ ] **Step 1: Failing tests:** round trip `parseBackup(await exportBackup(s).text())` deep-equals `s`; junk text throws `bad-backup`; `{app:'other'}` throws; schema 99 throws.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Verify settings view renders and restore error message appears for a junk file (use `form_input`/JS to feed a File). **Step 6:** Commit `feat: backup and settings`.

### Task 13: Session view (Clock In flow)

**Files:** Create `js/views/session.js`

**Interfaces:** consumes Tasks 7, 8, 3, 11. Flow: setup screen (course chips: 5 + `OTHER`; length chips 15/25/50/90 + custom 15–180; preview of pay "≈ $X at current rate") → START → camera permission (on false: banner "Unwatched: pay ×0.8") → running screen: live preview (mirrored), `● REC`, course tag, big countdown (then `+mm:ss OVERTIME` in gold), live earned ticker (`payFor(elapsedMin)`), **Walk out** (confirm sheet "Walk out? You'll be fined $X"). Persist `state.active` on start and every 15 s and on `visibilitychange` hidden (so a kill is recoverable). Hook `visibilitychange`/`pagehide` → `onHide`, visible → `onShow`; on fail show "You left the office — session failed" receipt. On target reached: play cash sound, show banner "Target hit — keep going or clock out". On clock-out/walk-out: stop recorder & camera, release wake lock, `finalizeSession`, attach timelapse meta (`hasTimelapse`), show receipt screen (earned, bonuses, streak, contracts, promotion → full-screen gold promotion card with `playPromo`, achievements) → Home. Landscape: camera left 55%, info right. If wake lock fails show one-time tip "Set Auto-Lock to Never while studying (Settings → Display & Brightness)".

- [ ] **Step 1:** Implement. **Step 2: Verify** in built-in browser (no camera → unwatched path): start 15-min session; use `javascript_tool` to dispatch hidden/visible with fake clock override (`window.__now` hook in session view used instead of `Date.now()` when set) to confirm: 5 s away continues, 11 s away fails with fine; fast-forward past target → overtime → clock out → receipt shows earnings and streak 1. **Step 3:** Commit `feat: session view`.

### Task 14: Marks views

**Files:** Create `js/views/marks.js`

**Interfaces:** consumes Task 5, 10. List: term average, each course card (code, name, current %, 12-point for Laurier, status chip, target, needed). Detail `#marks/<id>`: header (current, target editable, needed on remaining with status text: "Need 76% on the rest for 80%" / "Locked in 🎉" / "Out of reach — max possible X%"), pass warnings in red, components with items (name, date, weight share, score input accepting `81`, `81%`, or `17/20`), final exam date input, edit mode (rename/date/weight/add/remove item; weights must still sum to 100 — show running total and block save otherwise), study time total + this week for the course. Entering a score calls `fileMark` and shows "+$X filing bonus" toast.

- [ ] **Step 1:** Implement. **Step 2: Verify:** enter MATH 137 midterm 70 and 10 quizzes 90 → current 78.0%, needed 82.0% shown; enter `17/20` → stored as 85; EC120 shows 12-point grade; tests `ALL PASS`. **Step 3:** Commit `feat: marks views`.

### Task 15: Office view and shop

**Files:** Create `js/views/office.js`

**Interfaces:** consumes Task 9. Office tab: shell title (`<City> · <Shell name>`), `renderOffice` SVG full-width, tap slot → sheet of owned items for that slot + "Shop for this slot". Shop: filter chips by slot and tier, cards with art, name, price, lock reason (rank / achievement / owned), Buy → confirm → `playCash`. Prestige card when `canPrestige`: explains reset and +10%, double confirm, celebration. PTO purchase here.

- [ ] **Step 1:** Implement. **Step 2: Verify:** with a test state (cash 1e6, xp at VP) shown via `?demo=rich` query flag (dev only, guarded by `location.hostname === 'localhost'`), buy and equip an item, it appears in SVG; locked item shows reason. **Step 3:** Commit `feat: office view`.

### Task 16: Stats view and time-lapse gallery

**Files:** Create `js/views/stats.js`

**Interfaces:** consumes Tasks 7, 8, 10. Totals (hours, sessions, completion rate, best streak), this week vs last, hours by course (horizontal bars, inline SVG), daily hours for the term (SVG bar chart Sep 10 → Dec 23), session history (course, date, length, earned/fine, status chip, timelapse thumb), time-lapse player (canvas, play/pause, scrub, star toggle with cap warning, Save to Photos → `exportVideo` + `shareVideo`, hidden if unsupported), storage meter `X MB of cap`, achievements grid (secret ones show `???` until earned).

- [ ] **Step 1:** Implement. **Step 2: Verify** with `?demo=history` (localhost only) seeded sessions: charts render, no NaN text on the page (`document.body.innerText.includes('NaN') === false`). **Step 3:** Commit `feat: stats view`.

### Task 17: PWA — manifest, icons, service worker

**Files:** Create `manifest.webmanifest`, `sw.js`, `tools/make_icons.py`, `icons/*.png`; modify `index.html` (link manifest, `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `theme-color #0b0f17`, viewport `viewport-fit=cover`).

**Interfaces:** `make_icons.py` writes PNGs with `zlib`+`struct` only: dark `#0b0f17` square, gold `$` glyph drawn from a hard-coded 7×9 bitmap scaled up, sizes 180/192/512. `sw.js`: `CACHE = 'billable-v1'`; precache every app file (explicit list); cache-first for same-origin GET; on activate delete other `billable-*` caches; never touches IndexedDB. App registers SW and shows "Update ready — reopen app" toast when a new SW installs.

- [ ] **Step 1:** Implement. **Step 2: Verify:** `python tools/make_icons.py` creates 3 valid PNGs (open one in the browser pane); in the browser, SW registers (`navigator.serviceWorker.controller` after reload); stop the server and reload → app still loads offline. **Step 3:** Commit `feat: pwa`.

### Task 18: Whole-app pass

- [ ] **Step 1:** Run tests → `ALL PASS`.
- [ ] **Step 2:** Walk every route at 375×812 and 812×375 in the built-in browser; screenshot each; fix overflow, contrast, tap targets.
- [ ] **Step 3:** Fresh-state walkthrough: first open → Home with 0 data shows no NaN/undefined anywhere (`innerText` check on each route).
- [ ] **Step 4:** Commit `chore: polish pass`.

### Task 19: Deploy to GitHub Pages + iPhone checklist

- [ ] **Step 1:** User creates an empty **public** repo `billable` on github.com (free Pages needs public; repo contains no personal data — course names/dates only; confirm with user). Claude does not create accounts or repos.
- [ ] **Step 2:** `git remote add origin https://github.com/<user>/billable.git`; `git push -u origin main` (Git Credential Manager opens the user's own GitHub sign-in; the user signs in).
- [ ] **Step 3:** User (or Claude in the built-in browser, with the user's OK) enables Settings → Pages → Deploy from branch `main` / root. Verify `https://<user>.github.io/billable/` loads and `/tests/` shows `ALL PASS`.
- [ ] **Step 4:** Give the user the iPhone checklist: open in Safari → Share → Add to Home Screen → open from icon; allow camera; 2-min test session with target 15 → leave app 5 s and return (continues) → leave 15 s (fails, fine shown); lock screen test; landscape rotate mid-session; finish a session and play its time-lapse; Save to Photos; Back up to Files. Report iOS version and any failures.
