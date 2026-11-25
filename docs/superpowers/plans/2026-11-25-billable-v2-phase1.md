# Billable v2 · Phase 1 (Stopwatch + Goals + Contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the camera countdown with a count-up stopwatch you can leave running while using the app, add short/medium/long goals with steps that feed daily contracts, and upgrade saved data to schema 2 without losing anything.

**Architecture:** Same no-build vanilla-JS PWA. Pure logic in `js/session.js`, `js/goals.js`, `js/contracts.js`, `js/store.js` (unit-tested in headless Edge); views in `js/views/*`. The session no longer owns the screen: a gold session bar shows on every route while `state.active` is set.

**Tech Stack:** Vanilla JS ES modules, IndexedDB, Screen Wake Lock, Service Worker. Tests: `bash tools/run-tests.sh` → `ALL PASS (N tests)`.

**Spec:** `docs/superpowers/specs/2026-11-25-billable-v2-design.md` (§6.0–6.3, 6.6b exam season/course ids, 6.7). v1 spec for unchanged behaviour: `docs/superpowers/specs/2026-11-22-study-app-design.md`.

## Global Constraints

- Leaving the app ≤ 10 s continues (away time not credited); > 10 s ends the session at the moment you left, **completed, full pay**. No fines, no walk-out for new sessions.
- Sessions under **5 min** are not saved and not paid. Streak still needs one session ≥ **15 min**.
- Goal chips: None · 25 · 50 · 90 · custom **5–300** min. Goal bonus **+10%**, additive with length bonus (+10% ≥ 50 min, +25% ≥ 90 min).
- Idle guard: **2 h** without a tap → "Still studying?"; unanswered **10 min** → session ends at last tap.
- Step pay **15 min**; goal completion **60 / 180 / 600 min** (short/medium/long); goal pays only with **≥ 2 steps, all done**; **max 10 paid steps per day**; step must be **≥ 1 h old** to pay; every reward paid once. All goal/step/contract rewards go to **cash only**, never `xp`.
- Contracts per day: **max 5**, min 3; order = "+ Today" steps, then ≤ 2 auto-picked open steps (short before medium, oldest first), then random to reach 3.
- Tabs: **Home · Plan · Goals · Office · School**; Stats behind 📊 in Home's top bar. Plan is a placeholder until Phase 3.
- No camera/time-lapse code or storage remains; on first v2 launch delete IndexedDB `billable-media`.
- `schema: 2`; v1 data migrates losslessly; a raw copy of the v1 record is saved under key `state-v1-backup` before the first v2 save.
- Never overwrite an unreadable save (v1 C1 guard stays). Service worker cache name bumps to `billable-v3`.

## Review Focus

1. **A real v1 save (sessions, marks, owned items, why lines, legacy failed/walkedout records)** → upgrades with nothing lost, why lines become long-term goals, safety copy written. Test: Task 1 `migrates a full v1 save`.
2. **A v1 save with a session still active in v1 shape** (`targetMin`, status `overtime`/`running`) → recovered as a completed v2 session at `hiddenAt ?? lastSeenAt`. Test: Task 2 `recovers a legacy v1 active session`.
3. **Ticking/unticking the same step repeatedly, ticking a step < 1 h old, the 11th step of the day** → pays at most once, cap respected, never touches xp. Tests: Task 3.
4. **A session that starts 3:30 am and ends 4:30 am** → credited to the start day's streak; contracts evaluated against the day it ended. Test: Task 2 `credits a session crossing 4 am to its start day`.
5. **Navigating to Goals/School and ticking steps while clocked in** → session keeps running, bar time correct, contracts update, nothing ends the session except clock-out/leaving/idle. Browser verification in Task 6.

---

## File Structure

```
js/store.js          schema 2 defaults, migrate v1→v2, safety copy, pastTerms, settings.weekStart
js/time.js           examSeasonRange(state), isExamSeason(date, state)
js/economy.js        payFor ctx.goalHit; remove unwatched/fine
js/session.js        v2 state machine, idle guard, finalize (no fines), ensureDay → contracts v2
js/goals.js          NEW: goals/steps CRUD, tickStep, completeGoal, openSteps, migrateWhy
js/contracts.js      v2: buildDailyContracts, addStepToToday, evaluateDailyContracts, dynamic course pool
js/achievements.js   achievementsFor(state) with dynamic course ids + goal achievements
js/wakelock.js       NEW (from camera.js): acquireWakeLock/releaseWakeLock only
js/camera.js, js/timelapse.js   DELETE
js/views/session.js  stopwatch setup/running, idle sheet
js/views/goals.js    NEW: Goals tab + goal detail
js/views/plan.js     NEW: placeholder
js/views/home.js     Goals card, contracts card v2, 📊 button, session "resume" state
js/views/stats.js    remove time-lapse player/storage
js/views/settings.js remove why inputs + cap; keep targets/sound/backup/reset
js/views/receipt.js  v2 receipt (no fines), "Mark step done" button
js/app.js            session bar, touch tracking, routes (#school alias #marks), media DB delete, recovery
index.html, css/app.css   5 tabs, #sessionbar, stopwatch styles
sw.js, js/demo.js    file list / demo data
tests/*.test.js      update + new goals/contracts/migration tests; delete timelapse.test.js
```

---

### Task 1: Schema 2 store, migration, exam season from data

**Files:** Modify `js/store.js`, `js/time.js`, `js/economy.js`; Test `tests/store.test.js`, `tests/time.test.js`, `tests/economy.test.js`

**Interfaces:**
- Produces (`store.js`): `SCHEMA = 2`; `defaultState()` adds `goals: []`, `events: []`, `pastTerms: []`, `study: { mistakes: [], quizzes: [], attempts: [], plans: [] }`, `settings: { sound: true, weekStart: 'sun' }`, `career.stepPay: { day: null, count: 0 }`, `career.todaySteps: {}` (removes `career.why`, `settings.capMB`); `migrate(raw)` accepts schema 1 or 2 (throws `bad-backup` otherwise) and returns schema 2 — schema 1: `why` → `goals` via `migrateWhy(why, now)` (Task 3 produces it; until then inline equivalent), drop `capMB`, sessions untouched; `needsSafetyCopy(raw): boolean` (true when `raw.schema === 1`); `loadState()` writes `raw` to key `state-v1-backup` when `needsSafetyCopy(raw)` before returning.
- Produces (`time.js`): `examSeasonRange(state): { start: dayKey, end: dayKey }` — latest non-null `finalDate` among `state.term.courses` → `[end − 22 days, end]`; none → `{ start: '2026-12-01', end: '2026-12-23' }`. `isExamSeason(date, state)`.
- Produces (`economy.js`): `payFor(minutes, ctx)` with `ctx = { rankIdx, prestige, streakCount, examMult, goalHit }` → `round(minutes × rate × streakMult × (1 + lengthBonus + (goalHit ? 0.10 : 0)) × examMult)`; `payCtx(career, { examMult, goalHit })`. Remove `fineFor` and `unwatched`.

- [ ] **Step 1: Failing tests** — `store.test.js`: `SCHEMA === 2`; default has `goals/events/pastTerms/study`, no `career.why`; `migrates a full v1 save`: fixture schema 1 with `why:['Make money','Get a good job','Happy with grades']`, 2 sessions (one `walkedout`), a MATH137 mid score 70, `owned:{desk_basic:true}`, `capMB:300` → result schema 2, 3 goals tier `long` with those titles and `steps:[]`, sessions/owned/score preserved, no `capMB`; `needsSafetyCopy({schema:1})` true, `({schema:2})` false; `migrate({schema:3})` throws `bad-backup`. `time.test.js`: no final dates → Dec 1–23 range, `isExamSeason(new Date(2026,11,5,12), s)` true; with CS115 `finalDate:'2026-12-18'` and MATH137 `'2026-12-12'` → `{start:'2026-11-26', end:'2026-12-18'}`. `economy.test.js`: `payFor(50, {...base, goalHit:true}) === 600`; `payFor(90, {...base, goalHit:true}) === Math.round(90*10*1.35)`; existing unwatched/fine tests removed.
- [ ] **Step 2:** Run tests → FAIL.
- [ ] **Step 3:** Implement. Update callers of `isExamSeason(date)` to pass state (`session.js examMultFor`, `views/home.js`).
- [ ] **Step 4:** Run → `ALL PASS`. **Step 5:** Commit `feat(v2): schema 2 store, migration, data-driven exam season`.

### Task 2: Stopwatch session machine

**Files:** Modify `js/session.js`; Test `tests/session.test.js` (rewrite), `tests/fixes.test.js` (drop C2 overtime cases, keep C1/I1/I2/I3 minus timelapse)

**Interfaces:**
- Consumes: Task 1 `payFor/payCtx`, `isExamSeason(date, state)`; Task 4 `ensureDay` contract hook (until Task 4, `ensureDay` keeps v1 contracts).
- Produces: `GRACE_MS = 10000`, `MIN_SAVE_MIN = 5`, `IDLE_MS = 7200000`, `IDLE_GRACE_MS = 600000`;
  `startSession({ courseId, goalMin = null, stepId = null, now }): Active` → `{ id, courseId, goalMin, stepId, startedAt: now, awayMs: 0, hiddenAt: null, lastSeenAt: now, lastTapAt: now, status: 'running', endedAt: null, endReason: null }`;
  `onHide(a, now)`, `onShow(a, now)` (> grace → `status:'completed', endedAt: hiddenAt, endReason:'left'`), `heartbeat(a, now)`, `touch(a, now)` (sets `lastTapAt`), `elapsedMs(a, now)`, `goalReached(a, now): boolean`,
  `idleState(a, now): 'ok'|'ask'|'expired'`, `endIdle(a): Active` (`completed` at `lastTapAt`, `endReason:'idle'`), `clockOut(a, now)` (`endReason:'clockout'`),
  `recoverActive(a, now)`: any live status (`running`, legacy `overtime`) → `completed` at `hiddenAt ?? lastSeenAt ?? now`, `endReason:'recovered'`; legacy fields (`targetMin`, `watched`) ignored;
  `finalizeSession(state, a, now, evaluate)` → `{ state, receipt }`; receipt `{ discarded, minutes, earned, bonuses: string[], goalHit, promotedTo, streakExtended, contractsDone: string[], contractCash, newAchievements, endReason, stepId }`. `minutes < MIN_SAVE_MIN` → `discarded: true`, state only clears `active`. Record adds `goalMin, stepId, endReason`. Streak credited to `dayKey(startedAt)`.

- [ ] **Step 1: Failing tests** (`session.test.js`):
```js
// short absence continues; long absence completes at hiddenAt
let a = startSession({ courseId:'MATH137', goalMin:null, now:T0 });
a = onShow(onHide(a, T0+MIN), T0+MIN+5000); expect(a.status).toBe('running'); expect(a.awayMs).toBe(5000);
a = onShow(onHide(a, T0+20*MIN), T0+40*MIN); expect(a.status).toBe('completed'); expect(a.endedAt).toBe(T0+20*MIN); expect(a.endReason).toBe('left');
// idle
const b = startSession({ courseId:'X', now:T0 });
expect(idleState(b, T0+IDLE_MS-1)).toBe('ok'); expect(idleState(b, T0+IDLE_MS)).toBe('ask'); expect(idleState(b, T0+IDLE_MS+IDLE_GRACE_MS)).toBe('expired');
expect(endIdle(touch(b, T0+30*MIN)).endedAt).toBe(T0+30*MIN);
// recovers a legacy v1 active session
const r = recoverActive({ id:'v1', courseId:'X', targetMin:15, watched:true, startedAt:T0, awayMs:0, hiddenAt:T0+20*MIN, status:'overtime', endedAt:null }, T0+600*MIN);
expect(r.status).toBe('completed'); expect(r.endedAt).toBe(T0+20*MIN); expect(r.endReason).toBe('recovered');
// finalize: 25 min no goal → 250; 50 min goal 50 → 600 + 'Goal hit +10%'; 4 min → discarded, sessions unchanged
// credits a session crossing 4 am to its start day: start Nov 21 03:30, end 04:30 → streak.lastDay '2026-11-20'
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; delete `walkOut`, `tick`, fine paths. **Step 4:** Run → `ALL PASS`. **Step 5:** Commit `feat(v2): stopwatch session machine`.

### Task 3: Goals

**Files:** Create `js/goals.js`; Test `tests/goals.test.js` (add to `tests/index.html`)

**Interfaces:**
- Produces: `TIERS = ['short','medium','long']`, `GOAL_REWARD_MIN = { short:60, medium:180, long:600 }`, `STEP_REWARD_MIN = 15`, `STEP_DAILY_PAY_CAP = 10`, `STEP_MIN_AGE_MS = 3600000`;
  `createGoal(state, { title, tier, courseId=null, due=null }, now) → { state, goal }`; `updateGoal(state, goalId, patch) → state`; `deleteGoal(state, goalId) → state`;
  `addStep(state, goalId, text, now) → { state, step }` (step `{ id, text, done:false, doneAt:null, createdAt, paid:false }`); `editStep(state, goalId, stepId, text)`; `deleteStep(state, goalId, stepId)`; `moveStep(state, goalId, stepId, dir: -1|1)`;
  `tickStep(state, goalId, stepId, done, now) → { state, receipt: { paid, reason: 'ok'|'already'|'too-new'|'cap'|'undone', newAchievements } }` — pay `round(15 × rate)` to cash when `done && !paid && age ≥ 1h && stepPay.count < 10 for dayKey(now)`;
  `completeGoal(state, goalId, now) → { state, receipt: { paid, reason: 'ok'|'needs-steps'|'already' } }`;
  `openSteps(state) → [{ goal, step }]` (not done, goal not done/archived; order short→medium→long, then step `createdAt`);
  `migrateWhy(why: string[], now) → Goal[]` (long tier, no steps; skips blanks).
- All state functions are pure (deep copy), run `evaluateAchievements` (Task 5) after paying — until Task 5 lands, accept an injected evaluator defaulting to identity.

- [ ] **Step 1: Failing tests:** create/add/edit/move/delete round trips; tick < 1 h → `too-new`, cash unchanged; tick ≥ 1 h → cash `+150` at Intern I, `xp` unchanged; untick then retick → `already`, no pay; 11th paid tick same day → `cap`; next day pays again; `completeGoal` with 1 step → `needs-steps`; with 2 done steps short tier → `+600` cash, second call `already`; long tier `+6000`; `openSteps` order short before medium regardless of creation time; `migrateWhy(['Make money','',' Grades '])` → 2 long goals titled `Make money`, `Grades`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(v2): goals and steps`.

### Task 4: Daily contracts v2

**Files:** Modify `js/contracts.js`, `js/session.js` (`ensureDay`, finalize contract block); Test `tests/contracts.test.js` (rewrite)

**Interfaces:**
- Consumes: Task 3 `openSteps`, step `today` flag via `career.todaySteps[day]: string[]` of `"goalId:stepId"`.
- Produces: contract item `{ key, kind: 'step'|'random', ref, done: false, paid: false }` (`key` = `step:<goalId>:<stepId>` or `rand:<id>`); `career.contracts = { day, items, allPaid }`;
  `buildDailyContracts(state, day) → items` (order and caps per Global Constraints; random pool deterministic per day via existing mulberry32; pool = generic contracts `two_courses, early_bird, deep_work, marathon, triple, night_shift, goal_hit` + one `course:<id>` ("30 min on <code>") per current-term course + `course_behind:<id>` (30 min, reward ×2) when a course is behind, taken first among randoms);
  `addStepToToday(state, goalId, stepId, day) → { state, added: boolean }` (false if already there or 5 items);
  `evaluateDailyContracts(state, day) → { state, newly: string[], cash }` — step items done when the step is done (no extra pay; the step paid itself), random items checked against that day's completed sessions and pay `rewardMin × rate` once; all-done bonus 30 min once;
  `contractText(item, state) → string`.
- `ensureDay(state, now)` builds `items` when `contracts.day !== day` (v1 `ids/done` shape on a migrated save is replaced at next rollover or immediately if missing `items`).

- [ ] **Step 1: Failing tests:** day with 2 "+ Today" steps + 3 open short steps → items = 2 today steps, then 2 auto (no duplicates), then 0 random (already ≥ 3), length 4; no steps → 3 randoms deterministic per day; behind course → first random `course_behind:<id>`; cap 5 with 6 today steps; `addStepToToday` returns `added:false` at 5; ticking a step marks its contract done in `evaluateDailyContracts` with `cash` 0 for it; a 50-min completed session satisfies `deep_work` and pays once; all items done → all-done bonus once; `goal_hit` satisfied by a session record with `goalMin` reached.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(v2): contracts from goal steps`.

### Task 5: Achievements v2

**Files:** Modify `js/achievements.js`; Test `tests/achievements.test.js`

**Interfaces:**
- Produces: `achievementsFor(state) → Achievement[]` = base list (v1 minus hard-coded course entries) + `course_<id>_10h` / `course_<id>_25h` for every course in `term` and `pastTerms` + new: `first_step` (tick 1 step), `steps_25`, `steps_100`, `first_goal` (complete any goal), `goal_long` (complete a long-term goal), `goal_hit_10` (10 sessions reaching their goal), `contracts_perfect_7` (7 days with all contracts done). `evaluateAchievements(state, now)` iterates `achievementsFor(state)`. `ACHIEVEMENTS` stays exported as the base list for counts.
- Counters needed: `career.stepsTicked`, `career.goalsDone: { short, medium, long }`, `career.perfectContractDays` — incremented by Tasks 3/4 (add there if not already).

- [ ] **Step 1: Failing tests:** `achievementsFor(state)` contains `course_MATH137_10h`; adding a past term with course `CS116` adds `course_CS116_10h`; `first_step` granted after one paid tick; `goal_long` after completing a long goal; existing tests still pass (`first_shift`, `streak_100` gold watch, `perfect_week`, `deans_list`).
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(v2): goal achievements, dynamic courses`.

### Task 6: Views — stopwatch, session bar, Goals tab, Home, cleanup

**Files:** Rewrite `js/views/session.js`; create `js/views/goals.js`, `js/views/plan.js`, `js/wakelock.js`; modify `js/app.js`, `js/views/home.js`, `js/views/receipt.js`, `js/views/stats.js`, `js/views/settings.js`, `js/views/marks.js` (route name only), `index.html`, `css/app.css`, `js/demo.js`, `sw.js`; delete `js/camera.js`, `js/timelapse.js`, `tests/timelapse.test.js` (remove from `tests/index.html`).

**Interfaces / behaviour:**
- `app.js`: routes `home, session, plan, goals, goal/<id>, office, school, school/<id>, marks→school alias, stats, settings`; **no redirect** to `#session` while active; `#sessionbar` (above tab bar, hidden on `#session`) shows `● h:mm:ss · CODE` and goal state, updates every 1 s, tap → `#session`; document `pointerdown` → `touch(active)` + throttled (15 s) persist with `heartbeat`; 1 s ticker checks `idleState`: `'ask'` → sheet "Still studying?" [Yes, still here] (→ `touch`) / [Clock out]; `'expired'` → `endIdle` → finalize → receipt; visibility handling moves from the session view into `app.js` (works on any route); boot: `indexedDB.deleteDatabase('billable-media')` once (flag `settings.mediaCleared`), recovery via `recoverActive` → finalize → receipt; remove `purge`/`sweepOrphans`.
- `views/session.js`: no active → setup (course chips incl. Other, goal chips None/25/50/90 + custom 5–300, "Working on" select listing `openSteps` with course filter first, START); active → running screen (big count-up `h:mm:ss`, goal bar + "Goal 50m — 8m to go" / "Goal hit ✓" gold, live `$` from `payFor(floor(min), ctx with goalHit)`, **Clock out** (confirm sheet only if < 5 min), "Keep the clock running and browse →" link to `#home`). Wake lock via `wakelock.js` while active (acquired in `app.js` when active, released on finalize).
- `receipt.js`: v2 receipt (no fine lines); `endReason` copy: left → "Ended when you left the app", idle → "Ended at your last tap", recovered → "The app closed — saved up to when it was last open"; discarded → "Under 5 minutes — not saved"; if `stepId` and step open → button "Mark '<step>' done" (→ `tickStep`).
- `views/goals.js`: three sections Short/Medium/Long with "+ New goal" (sheet: title, tier, course optional, due optional); card shows title, progress `x/y`, due, course chip, progress bar; `#goal/<id>` detail: steps list (checkbox tick → `tickStep` with toast reason: too-new "Steps pay after they've been on your list for an hour", cap "Daily step pay limit reached (10)"), add step input, edit/delete/move, "+ Today" per open step (→ `addStepToToday`), "Complete goal" (→ `completeGoal`, disabled with hint until ≥ 2 steps all done), delete goal.
- `views/home.js`: Goals card replaces Why (long-term goal titles as one-line "why" banner; top short-term goal with next step + progress; tap → `#goals`); contracts card renders v2 items (step items have a tick box that calls `tickStep`); top bar adds 📊 → `#stats`; CLOCK IN becomes **RESUME** (shows live time) when active.
- `views/plan.js`: placeholder card "Your Apple-style planner arrives in the next update."
- `index.html`/CSS: 5 tabs (Home ◆, Plan ▦, Goals ◎, Office ▣, School ▤); `#sessionbar` style (gold, mono, 40px, sticky above tab bar, safe-area aware).
- Stats: remove time-lapse buttons/player/storage line. Settings: remove why inputs and cap chips. Demo: v2 shape with sample goals.
- `sw.js`: `CACHE = 'billable-v3'`, file list updated (no camera/timelapse; add goals.js, wakelock.js, views/goals.js, views/plan.js).

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify in browser pane** (`http://localhost:8765/?demo=history`, mobile 375×812 and 812×375): start a session with goal 25 → bar visible on Home/Goals/School; tick a step from Home contracts while running (session keeps running); `__now` +26 min → "Goal hit ✓"; hide 5 s continues, hide 15 s → receipt "Ended when you left the app" with goal bonus; 4-min session → "not saved"; idle: `__now` +2 h → sheet; +2 h10 → ended at last tap. No `NaN`/`undefined`/overflow on any route.
- [ ] **Step 3:** `bash tools/run-tests.sh` → `ALL PASS`. **Step 4:** Commit `feat(v2): stopwatch UI, session bar, goals tab`.

### Task 7: Release

- [ ] **Step 1:** Final whole-branch review (fresh reviewer) → fix pass.
- [ ] **Step 2:** Merge `feat/billable-v2` into `main` (fast-forward), `git push origin main`.
- [ ] **Step 3:** Wait for Pages; verify `https://joshuakirkland31-code.github.io/billable/tests/` → `ALL PASS` and the home page loads with tabs Home · Plan · Goals · Office · School.
- [ ] **Step 4:** Tell the user: reopen the app twice (service worker update), check their data upgraded (goals from their why lines), and the phone checks (leave 5 s / 15 s, lock screen, browse while clocked in).
