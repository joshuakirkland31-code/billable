# Billable v2 — Design

Date: 2026-11-25 · Status: draft for approval · Builds on: `2026-11-22-study-app-design.md` (v1, live at joshuakirkland31-code.github.io/billable)

## 1. Intent and the why

After a few days with v1 the user wants the app to fit how they actually study:

- **A countdown makes them avoid starting.** "Sometimes I don't know how long something will take so I don't start a timer, because if I finish early I'm done and I don't want to feel finished without being finished." → a **stopwatch** that counts up, with optional goals.
- **The camera is unnecessary effort.** → remove recording and time-lapses.
- **The office must be worth chasing**: "a poster or a nice rug or a real desk, actual things that would look cool", inspired by Tuber Simulator's room-building. → real illustrated items in a room.
- **Goal-setting was wonky.** They like the marks calculator; they want **short / medium / long-term goals broken into steps**, with steps feeding the daily contracts.
- **Their schedule should live in the app**, planned like **Apple Calendar**, which they already use.
- **Past tests → AI grading, a mistakes bank, practice quizzes and study plans** built from past exams, textbooks and slides. The AI runs **through Claude Code on their PC** (user chose option A), not inside the app.

Still true from v1: motivation is money / good job / grades; the streak must stay easy; solo, no server, data on-device; Trading Floor visual style; iPhone (iOS 27) home-screen PWA on GitHub Pages.

## 2. Goals, non-goals, anti-goals

**Goals:** count-up sessions; tiered goals with steps that become contracts; Apple-Calendar-like planner with class blocks and planned study sessions; an office full of drawn, desirable items; importing AI-made study packs (mistakes, quizzes, plans) and using them in-app.

**Non-goals:** in-app AI or API keys; push notifications from the app (reminders come via Apple Calendar export, §6.4); syncing with Apple Calendar live; friends/leaderboards; Android.

**Anti-goals:** any penalty for stopping when the work is done; the planner feeling unlike Apple Calendar; course materials or mistakes ending up in the **public** GitHub repo; losing v1 progress in the upgrade.

## 3. Constraints

- Same stack as v1: static vanilla-JS PWA, no build step, no Node on the PC, IndexedDB on-device, tests in headless Edge (`tools/run-tests.sh`).
- The repo is **public** (free GitHub Pages). Study materials and generated study packs must never be committed: the study workflow folder is git-ignored.
- PC→phone file transfer for study packs: the app imports a file via the iOS Files picker (iCloud Drive / OneDrive / Google Drive / email attachment saved to Files). PWAs on iOS can't register as a file handler.
- The working copy currently lives in a temporary app folder. Phase 4's "drop files here" workflow needs a **permanent folder on the PC** (proposed `Documents\Billable`, a clone of the repo).

## 4. Approaches considered

- **AI location:** A) through Claude Code on the PC → study-pack file imported by the app (**chosen by user**); B) in-app with the user's API key (rejected for now: separate billing, key handling); C) both (deferred).
- **Timetable source:** live Quest/LORIS integration is impossible from a static app. Chosen: the app imports standard **.ics** files, and for Quest (no clean export) the user sends a screenshot/text to Claude Code, which writes an .ics or study-pack-style schedule file. Manual entry always works.
- **Planner UI:** a custom-built calendar in Apple-Calendar style (chosen; matches user's habits) vs. a list-based planner (rejected: user asked for Apple-like).
- **Office art:** hand-drawn inline SVG items in an original cartoon style (chosen) vs. emoji (v1; user finds it not motivating) vs. bitmap images (rejected: size, can't recolor). Exact art direction is decided with mockups before building (§6.3).

## 5. What the user decided

- Stopwatch with goals; no camera.
- Office: real, cool, collectible items (Tuber-Simulator-like room building).
- Keep marks calculator; replace goal-setting with short/medium/long goals + steps → daily contracts.
- Schedule in the app, **similar to Apple Calendar**. Timetable currently in Quest; winter schedule not final (CS 116 not added yet).
- AI via Claude Code on the PC (A).
- Phase order: (1) session loop + goals, (2) office art, (3) schedule, (4) tests & practice — all approved in conversation.

## 6. The design

### 6.0 Navigation (my call)
Five tabs: **Home · Plan · Goals · Office · School**. School = courses (marks calculator, unchanged) + per-course Practice (mistakes, quizzes, study plans). **Stats** moves behind a 📊 button in Home's top bar (next to ⚙). Session screen stays full-screen.

### 6.1 Phase 1a — Stopwatch sessions
- **Setup:** pick course; optional **goal** chips: None · 25 · 50 · 90 · custom (5–300 min); optional **"Working on"** picker listing open goal steps (tags the session; offers to tick the step at the end).
- **Running:** large count-up clock (`1:07:42`), goal progress bar + "Goal 50m — 8m to go" (turns gold "Goal hit ✓" once passed), live $ ticker, **Clock out** button (confirm only if < 5 min: "Under 5 minutes won't be saved — clock out anyway?"). No walk-out, no fine.
- **Leaving the app:** within 10 s continues (time away not credited); longer → session **ends at the moment you left** and is settled as completed with full pay for time before leaving. App killed → settled at last heartbeat/hiddenAt (v1 logic). Receipt explains "Ended when you left the app".
- **Pay:** per minute as v1 (rate × streak multiplier × length bonus × exam-season × prestige). **Goal bonus +10%** when a set goal is reached (replaces nothing; stacks with length bonus). No "unwatched ×0.8" (camera gone).
- **Minimums:** < 5 min → not recorded, no pay. Streak still needs one session ≥ 15 min.
- **Screen:** keep Wake Lock + Auto-Lock tip (locking the phone = leaving).
- **Moving around while clocked in (my call):** the session no longer locks you on its screen. A slim gold **"● 23:14 · MATH 137"** bar sits above the tab bar on every screen (tap → back to the session screen), so you can take a practice quiz, check marks or tick goal steps while the clock runs. Only *leaving the app* triggers the 10 s rule.
- **Forgotten-session guard (my call):** after 2 h with no tap anywhere in the app, a "Still studying?" sheet appears; if unanswered for 10 min the session ends at the last tap (full pay up to then). Any tap resets the 2 h timer.
- **Removed:** camera, time-lapse recording/player/export, storage cap setting, fines, walk-out/failed paths for new sessions. Legacy `failed`/`walkedout` records keep displaying in history.
- **Migration:** on first v2 launch delete the `billable-media` IndexedDB database (frees storage).

### 6.2 Phase 1b — Goals
- **Model:** `goal = { id, title, tier: 'short'|'medium'|'long', courseId|null, due: dayKey|null, steps: [{ id, text, done, doneAt, minutes|null }], createdAt, doneAt|null, archived }`.
- **Tiers:** Short term (days–2 weeks), Medium term (this term), Long term (the big why). Tier is a label, not enforced by date.
- **Migration from v1:** each "Why I grind" line becomes a Long-term goal with no steps (e.g. "Make money"). Course targets stay in the marks calculator.
- **Goals tab:** three sections (Short / Medium / Long), each goal a card with progress `3/5 steps`, due date, course chip; tap → detail with steps (add, edit, reorder, tick, delete), "+ Today" on each open step, "Complete goal". Completed goals collapse into a "Done" list.
- **Home:** the Why card is replaced by a **Goals card**: each long-term goal title as a one-line "why" banner, plus the top short-term goal with its next step and progress.
- **Rewards:** tick a step = 15 min of pay; complete a goal = short 60 / medium 180 / long 600 min of pay (paid once). Unticking a step doesn't refund but can't be re-paid.
- **Rewards are cash only (my call, v1 precedent):** goals, steps, quizzes, collections and planned-session bonuses add to cash, never to rank. Rank stays a measure of hours studied.
- **Anti-farming rules (my call):** a goal pays its completion bonus only if it has ≥ 2 steps and all are done (so the migrated "why" goals pay nothing until you give them steps); step pay is capped at 10 paid steps per day (more can be ticked, unpaid); a step must exist for ≥ 1 h before ticking it pays.

### 6.3 Phase 1c — Daily contracts (reworked)
Each day's contract list (max 5) is assembled in this order:
1. **Planned sessions** scheduled for today in the calendar (Phase 3): "Planned: MATH 137 3:00–4:00 PM". Done when a session for that course overlaps ≥ 80% of the planned time or lasts ≥ 80% of its length that day. Pays 20 min; started within 10 min of start → "On time" +10 min.
2. **Steps marked "+ Today"** by the user.
3. **Auto-picked steps** (up to 2, from short-term goals first, then medium; oldest first; deterministic per day).
4. **Random study contracts** (v1 pool) to reach at least 3.
Step contracts are done by ticking the step. All-done bonus as v1. A contract list is regenerated only at the 4 am day rollover, but adding "+ Today" or planning a session for today appends immediately (if under 5).

### 6.4 Phase 3 — Plan tab (Apple-Calendar style)
Visual and interaction model follows the iPhone Calendar app, in the app's dark theme:
- **Day view (default in portrait):** header with month name; a **week strip** (S M T W T F S, dates, selected day circled gold, today's number gold text, small dots under days with events); the selected date as a title ("Wednesday, November 25"); an **all-day row**; a scrollable 24-hour **timeline** (hour labels left, faint half-hour lines), auto-scrolled to 7 am or to now; a **red current-time line** with the time label. **Swipe left/right** on the timeline or strip to change day/week.
- **Week view (default in landscape; selectable):** 7 columns with the same timeline.
- **Month view (tap the month name, like Apple):** month grid with event dots; tap a day → Day view. Header **Today** button everywhere.
- **Events:** rounded blocks tinted by course colour with a solid left bar, title + time; overlapping events split the column width. Types: **Class** (course colour), **Study** (gold), **Exam** (red, ⚑; setting an Exam for a course's final also sets that course's `finalDate`), **Other** (grey).
- **Create:** "+" top-right, or **tap an empty slot** → New Event sheet prefilled at that half-hour, 1 h long. Sheet fields (Apple-like grouped list): Title · Type · Course · All-day toggle · Starts · Ends · Repeat (Never / Every Day / Every Week / Every 2 Weeks / Custom weekdays) · End Repeat (Never / On date) · Notes. Title defaults from type+course ("MATH 137 study").
- **Edit:** tap an event → detail sheet (Edit, Delete; for repeating events "Delete this event only / all future events", like Apple). **Long-press-and-drag** to move, drag bottom edge to resize, snapping to 15 min; repeating events ask "this event / future events".
- **Study events:** when now is within [start − 10 min, end], the event and the Home screen show **Start** → opens the stopwatch prefilled with course and goal = planned length.
- **Home:** "Up next" card for the next study event today.
- **Import:** **.ics** files (Files picker): VEVENT with DTSTART/DTEND/SUMMARY/LOCATION, RRULE FREQ=WEEKLY/DAILY with INTERVAL, BYDAY, UNTIL/COUNT, EXDATE; TZID times converted to local. Imported events become type Class (course auto-matched by code in SUMMARY, e.g. "MATH 137"), editable afterwards.
- **Export (for reminders):** "Add to Apple Calendar" on a study event, and "Export upcoming study sessions" in Plan's menu → .ics with a 10-minute VALARM, shared via the share sheet so Apple Calendar gives real notifications.
- **Week start:** Sunday (Apple's default in Canada), setting to switch to Monday.
- **Terms:** events are dated, so the winter timetable can be added whenever it's final; nothing assumes Fall-only.

### 6.5 Phase 2 — Office upgrade
- **Art:** each item is an original, hand-drawn **inline SVG** (chunky outlines, warm palette, soft shadows) — no emoji. A side-view room with a back wall, window, floor, and fixed anchor spots; items render at their spot in front-to-back order.
- **Desirability:** items people want for real: framed posters (several designs), neon sign, LED strip, gaming chair, standing desk, walnut desk, dual/ultrawide monitors, mechanical keyboard, bookshelf, plants (monstera, snake plant), shag/Persian/striped rugs, floor lamp, mini fridge, espresso machine, record player, bean bag, couch, aquarium, trophy case, city-view window upgrades.
- **Collections (sets):** e.g. *Gamer setup* (chair + LED strip + monitors + neon), *Cozy corner* (rug + bean bag + lamp + plant), *Wall Street* (ticker + walnut desk + leather chair + skyline). Completing a set gives a one-time bonus and an achievement.
- **Scope:** ~60–70 drawn items (fewer than v1's 105 emoji, but each worth wanting); keep v1 economy (prices/tiers/rank locks), shells, slots and prestige. v1 owned items map to their nearest v2 item; anything unmapped is refunded at its price.
- **Gate:** before building, show **3 mockups of the same room in different art directions** for the user to pick.

### 6.6 Phase 4 — Tests & practice (AI through Claude Code)
**PC side (Claude Code):**
- Permanent folder `Documents\Billable\` (repo clone) with a git-ignored `study\` tree: `study\<COURSE>\inbox\` (drop past tests, answer sheets, slides, textbook PDFs/photos), `study\<COURSE>\packs\` (generated output).
- A project skill `.claude/skills/study-pack/SKILL.md` that tells Claude how to: read the inbox; grade a test (if the user's answers are present) or review it (if only questions); record each mistake with topic and concept; write practice quizzes mixing the user's weak topics with material from slides/textbook; write a study plan dated against the course's final; emit `billable-study-<course>-<date>.json` per the schema below; and never commit `study\`.
**Study pack schema (v1):**
```json
{ "app": "billable-study", "version": 1, "createdAt": "ISO", "courseId": "EC120",
  "tests": [{ "id", "title", "date", "score", "maxScore",
    "mistakes": [{ "id", "topic", "question", "yourAnswer", "correctAnswer", "explanation" }] }],
  "quizzes": [{ "id", "title", "topics": [], "questions": [
    { "id", "type": "mc|numeric|short", "prompt", "choices": [], "answer", "tolerance", "explanation", "topic" }] }],
  "plans": [{ "id", "title", "examDate", "items": [{ "id", "text", "date", "minutes", "topic" }] }] }
```
**App side (School tab → course → Practice):**
- **Import pack** (Files picker); validate; merge by id (re-import updates, never duplicates).
- **Mistakes bank:** grouped by topic with counts; each mistake shows question, your answer, correct answer, explanation; "Got it" retires it (still viewable); "Quiz me on these" makes an in-app quiz from mistakes (their correct answers).
- **Quizzes:** one question at a time; MC and numeric (± tolerance) auto-graded; short answer = reveal + "I got it / I missed it". Results saved (score, date, per-topic); wrong answers add to the mistakes bank. Pay: 2 min of pay per correct answer, first attempt per quiz per day only. Achievements for perfect scores and quiz counts.
- **Study plans:** importing a plan creates a **Medium-term goal** "<plan title>" whose steps are the plan items (with dates). Items with dates can be sent to the calendar as Study events in one tap ("Schedule this plan" → places each item on its date at the first free slot after 9 am that avoids classes, editable after).
- **Topic weakness** per course: topics ranked by mistakes count and recent quiz accuracy, shown on the course page.

### 6.6b Terms and new courses (my call)
- State holds a **list of terms** (`terms: [{ id: 'F26', name: 'Fall 2026', courses, archived }]`, `currentTermId`). Fall 2026 migrates in as the first term.
- **New courses arrive the same way as study packs:** the user sends Claude Code their new outlines (as with Fall); Claude Code writes `billable-term-<id>.json` (`{ app: 'billable-term', version: 1, term: { id, name, courses: [...same course schema as courses-data.js] } }`) which the app imports in School → "Import term". No in-app course editor beyond today's per-course edit mode.
- Archived terms stay viewable in School (marks read-only, practice usable). Course colours are assigned per course id and persist.
- **Exam season** is derived from data instead of hard-coded: the 23 days before the latest scheduled final of the current term (from course `finalDate`s / Exam events), falling back to Dec 1–23 for Fall 2026. Random contracts and course achievements use the current term's course ids instead of the hard-coded five.
- Calendar events imported for a course code not yet in the app stay unlinked (grey) and link automatically once that course is imported.

### 6.7 Data, migration, safety
- `schema: 2`. Migration v1→v2: why → long-term goals; add `goals: []`, `events: []`, `study: { packs: {}, mistakes: [], quizzes: [], attempts: [] }`, `settings.weekStart: 'sun'`; drop `settings.capMB`; keep sessions/marks/career intact; delete `billable-media` DB. Covered by tests.
- Backups include goals, events and study data.
- C1 safeguard from v1 stays (never overwrite an unreadable save).
- Service worker cache version bumped each release; `demo.js` stays localhost-only.

## 7. Left to the builder
- Exact SVG art (after the mockup choice), item list and prices within §6.5's shape.
- Calendar internals (rendering, overlap layout, drag implementation), ICS parser details beyond the listed properties.
- New achievement list (goals, steps, planned sessions on time, quizzes, sets) — 15–25 additions.
- Quiz UI details, topic-weakness formula.

## 8. Calls I made (for the user to check)
- Leaving the app ends the session and keeps pay (no penalty). Under-5-minute sessions aren't saved.
- Goal bonus +10%; step = 15 min pay; goal completion 60/180/600 min by tier.
- Tabs: Home · Plan · Goals · Office · School; Stats behind 📊 on Home.
- "Why" lines become long-term goals.
- Contracts: up to 5/day; planned sessions and "+ Today" steps first.
- Calendar: Sunday week start; Day view in portrait, Week in landscape; reminders via .ics export to Apple Calendar.
- Office: ~60–70 drawn items with collections; three art mockups first; v1 items mapped or refunded.
- Study materials live in a git-ignored folder in a permanent `Documents\Billable` clone; packs reach the phone via the Files picker.
- Build order: Phase 1 (stopwatch + goals + contracts) → 2 (office) → 3 (Plan) → 4 (practice). **Open: the user is asked whether Practice should move up to help with December finals.**
- You can move around the app while clocked in (gold session bar); "Still studying?" check after 2 h without a tap.
- New rewards are cash only; goals need ≥ 2 steps all done to pay; max 10 paid steps/day; a step must be ≥ 1 h old to pay.
- Terms list; new terms/courses imported from a file Claude Code writes from your outlines; exam season derived from final dates.
- Each phase goes live on the site as soon as it's done and tested; every data upgrade is covered by migration tests, and the app nudges a backup before the first v2 launch upgrades your data.
