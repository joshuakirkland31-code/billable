# "Billable" — Gamified Study App · Design

Date: 2026-11-22 · Status: draft for approval

Working name **Billable** (as in billable hours) is my call; easy to change.

## 1. Intent and the why

A Forest-style focus app for one student's iPhone, built to help them "lock in" for the Fall 2026 term (2 Laurier courses + 3 Waterloo courses, finals Dec 10–23).

Their stated struggles: procrastination, skipping classes, getting overwhelmed on heavy-deadline days. What makes them quit things is **losing sight of why**. Their why: **make money, get a good job (consulting/finance internship), be happy with their grades.** The only streak they've ever kept is Snapchat, *because it's easy*.

So the app must:
- Put their reasons front and centre every time it opens.
- Make *showing up* cheap (easy streak) while making *long sessions* rewarding.
- Turn study time into a career game that mirrors the real goal (salary + promotions toward Partner).
- Use the front camera so they feel watched and can't use the phone, and keep short-lived time-lapses.
- Track real marks per course and show what they need on what's left.

## 2. Goals, non-goals, anti-goals

**Goals**
- Camera-watched focus sessions tagged by course; leaving the app fails the session.
- Time-lapses stored on-device, auto-deleted after 7 days unless starred.
- Career-ladder game with enough depth to stay motivating after hundreds of hours.
- Office the user designs and upgrades.
- Marks tracker pre-loaded with all 5 course outlines, honouring each course's real grading rules.
- Works in portrait and landscape.

**Non-goals**
- Friends, leaderboards, accounts, any server/backend (user explicitly said no: "I don't want to constantly compare myself").
- Push notifications/reminders (need a server on iOS).
- Multi-term *course setup UI*. Courses are this term only; user will rework them next term. **But career progress (earnings, rank, office, items, achievements, streak, stats) must outlive the term**: the user wants it motivating "after hundreds of hours", which takes well past December. So store the career save separately from the term's course data, and version the data schema from day one so later updates and next term's rework can migrate it.
- Native App Store app.

**Anti-goals (failure even if it "works")**
- A streak that's hard to keep → they'll quit like everything else.
- Spending in the shop slowing down promotions.
- Time-lapses quietly eating phone storage.
- Making the user feel bad for checking marks.
- Losing their progress with no way back.

## 3. Constraints

- iPhone, Safari, installed via **Add to Home Screen** (PWA). User's computer is Windows (no Xcode).
- Camera requires HTTPS → hosted on **GitHub Pages** in the user's GitHub account (they have one).
- Static files only. All data on-device (IndexedDB for time-lapse frames, IndexedDB or localStorage for the rest).
- iOS can suspend/kill a backgrounded web app and pauses JS; camera stops when the app isn't visible.
- iOS web has no vibration API and no background execution.
- Must work offline after first load (service worker).
- Today is 2026-11-22: most term work is already graded; the user will back-fill marks.

## 4. Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **PWA on GitHub Pages** | Free, home-screen app, camera + wake lock work, data on-device; small risk iOS clears storage | **Chosen** (user picked) |
| React Native / Expo | More "real", but needs Expo Go or $99/yr Apple dev account; much more setup | Rejected |
| Claude artifact | Fast, but lives inside claude.ai, awkward on home screen, camera less reliable | Rejected |

Visual style options shown: A Trading Floor (dark terminal), B Clean Fintech (light), C Cozy Game. **User picked A · Trading Floor.**

## 5. What the user decided

- Camera purpose: keep them off the phone, the feeling of being watched pushes longer sessions, and keep time-lapses for a limited time because storage is tight.
- Theme: **career ladder** (salary earned per minute, promotions Intern → Partner).
- Can **design their office** and unlock more as they level up; must stay motivating after hundreds of hours.
- Home page carries their **why**: money, good job, happy with grades.
- **Solo only**, no friends/leaderboard.
- **Track real marks** per course; liked all proposed game tie-ins for marks.
- This term only. Style A. PWA via GitHub Pages.

## 6. The design

### 6.1 Screens (bottom tab bar)
1. **Home** — "Why I grind" card (user's own words, editable; seeded with "Make money · Land the internship · Grades I'm proud of"), salary + rank + promotion bar, streak + multiplier, today's contracts (x/3), course "portfolio" (each course % with ▲ on track / ▼ behind target), next final countdown, big gold **CLOCK IN** button.
2. **Office** — the user's office scene + shop.
3. **Marks** — course list → course detail (assessments, current %, needed on remaining, study time).
4. **Stats** — history, charts, time-lapses, achievements, weekly review.
Settings (gear on Home): edit why, course targets, sounds on/off, backup/restore, storage used, reset.

Layout responds to orientation: portrait = stacked; landscape = two columns (e.g. session screen: camera left, timer/info right). No orientation lock.

### 6.2 Visual style (A · Trading Floor)
Near-black navy background, card panels with thin borders, **gold** for money/primary actions, **green ▲ / red ▼** for good/bad, monospace numerals, uppercase small labels. Reference mockup: `mockups/styles.html` (option A). Cash-register/ticker sound on payouts (toggleable).

### 6.3 Study session ("Clock In")
1. Pick course (5 courses + "Other"), pick target length: 15 / 25 / 50 / 90 min or custom (15–180).
2. Camera permission (front camera). If denied, session can still run but earns ×0.8 and shows "unwatched" (my call — keeps the app usable).
3. Running screen: live self-preview, ● REC, course tag, countdown, live "$ earned this session" ticker, **Walk out** button (confirm).
4. Screen Wake Lock held for the whole session.
5. **Leaving the app** (visibilitychange/pagehide, phone lock, switching apps): if back within **10 s grace**, continue (time away not credited); otherwise the session **fails**. Because iOS pauses JS, detect on return using timestamps; if the app was killed, an in-progress session record found at next launch is marked failed.
6. On reaching target: payout screen (salary earned, bonuses, multiplier, contracts completed, any promotion/achievement), with option to **keep going in overtime** (continues earning; ends with "Clock out").
7. Failed / walked out: no pay for the session, a **fine** (10% of what the full session would have paid), doesn't count for streak, time-lapse tagged "WALKED OUT". Failed minutes still appear in history, flagged.

### 6.4 Time-lapse
- During a session, capture a frame from the camera every few seconds to a small JPEG (≈360px long edge) and store frames as Blobs in IndexedDB per session. Target **≤ ~8 MB per hour**; builder tunes interval/quality.
- Overlay timestamp + course on frames (or on playback).
- Playback in-app at ~30 fps (1 h ≈ 20 s), scrubbable.
- **Retention: 7 days**, then auto-deleted on app launch. **Star** to keep indefinitely. Storage meter in Stats and Settings.
- **Hard cap: 300 MB total** (adjustable in Settings). Over the cap, delete the oldest unstarred time-lapses first; warn when starring would push starred ones alone past the cap. Heavy exam-season use (5–6 h/day × 7 days at 8 MB/h) would otherwise reach ~300 MB.
- **Save to Photos**: render frames to a video (canvas + MediaRecorder) and hand to the iOS share sheet ("Save Video"). If unsupported, fall back to sharing an animated sequence/zip is *not* required — just disable the button with a note.

### 6.5 Economy and progression
Two separate numbers: **Lifetime earnings** (only goes up; drives rank) and **Cash** (spendable). Spending never affects rank.

**Pay:** `minutes × base rate(rank) × streak multiplier × bonuses`.
- Length bonus: +10% for sessions ≥ 50 min, +25% for ≥ 90 min.
- Course-behind-target bonus via contracts (below).
- Exam season (Dec 1–23): ×1.5 on all study; ×2 on the course whose final is next (once exam dates entered).

**Ranks (thresholds tuned so these are roughly the study hours needed):**
Intern I 0h · Intern II 2h · Intern III 5h · Analyst I 10h · Analyst II 18h · Analyst III 28h · Associate I 40h · Associate II 55h · Associate III 75h · VP 100h · Director 140h · Managing Director 200h · Partner 300h.
Base rate rises with rank (e.g. $10/min Intern → $100/min Partner); exact curve is the builder's call. Promotion = full-screen celebration + unlocks.

**After Partner — "Start your own firm":** optional prestige. Rank resets to Analyst I in a new city (Toronto → New York → London → Hong Kong → Singapore → …, cycling with a counter after), permanent +10% pay per prestige, new office shell and a city-specific item set. Items, trophies, stats, cash kept.

**Streak:** a day counts if ≥ **one completed session of ≥ 15 min**. Day boundary at **4:00 am** local (late nights count for the previous day). Multiplier +0.05 per streak day, capped at ×2.0. **PTO days**: buyable in the shop, hold max 2, auto-used on a missed day to protect the streak.

**Daily client contracts:** 3 per day, deterministic per date, drawn from a pool, e.g. "Study 2 different courses", "Clock in before 10 am", "One 50-min session", "90 total minutes", "Study [behind-target course] 30 min" (always included when any course is behind target, pays 2×). Each pays a cash bonus; all 3 = extra bonus.

**Weekly performance review:** first open each Monday shows last week vs the week before (hours, sessions, per-course split, streak). Beat last week's hours → performance bonus.

**Achievements:** ~50, some secret. Categories: hours milestones, streaks (3/7/14/30/60/100 days), long sessions, early-bird/night-owl, per-course hours, marks (see 6.7), contracts, perfect weeks, comebacks after a broken streak, office/collection milestones, prestige. Some unlock exclusive office items (e.g. gold watch at 100-day streak). Exact list is the builder's call.

### 6.6 Office
- Office **shell** upgrades with rank: Cubicle (Intern) → Shared office (Analyst) → Own office (Associate) → Corner office (VP) → Whole floor (Director/MD) → Penthouse (Partner). Each new city (prestige) has its own shells.
- **Slot-based customization** (my call — works well on a phone): the scene has named slots (desk, chair, computer setup, wall art ×2, window view, floor-left, floor-right, shelf, rug, pet, desk accessory…). Bigger shells add slots. Tap a slot → pick from owned items.
- **Shop**: buy items with cash. Tiers common / rare / legendary; some items rank-locked, some achievement-only. Aim for **~80+ items** at launch spread across slots so there's always something next to buy. Prices scaled so a typical day affords something small and big items need weeks.
- Office drawn in the Trading Floor style (flat 2D SVG/CSS illustration). Builder chooses art approach; emoji acceptable as item art where nothing better is quick.
- Office is shown small on Home? **No** — Home stays focused on the why/money/marks; Office is its own tab.

### 6.7 Marks tracker
Per course: assessment list with weights/dates, user enters scores (as % or as score/out-of), target grade (default 80%).

Shows: current average on graded work, **needed average on remaining work** to hit target (solve numerically with the course's rules applied, so drop-lowest etc. are respected), projected final, study hours (total / this week), and pass-rule warnings.

Display: Waterloo courses in **%**; Laurier courses in **% + 12-point grade** (A+ 90–100 = 12, A 85–89 = 11, A− 80–84 = 10, B+ 77–79 = 9, B 73–76 = 8, B− 70–72 = 7, C+ 67–69 = 6, C 63–66 = 5, C− 60–62 = 4, D+ 57–59 = 3, D 53–56 = 2, D− 50–52 = 1, F < 50 = 0). Overall term average in %.

All assessments are **editable** (rename, change date/weight, add/remove) so the user can fix TBAs and anything that changes.

Game tie-ins: entering a mark pays a small "filing bonus"; beating the target on an assessment pays a performance bonus; marks achievements ("Dean's List": term average ≥ 80%; "Beat the target" ×N; "Comeback": a final mark above the midterm); behind-target courses generate a 2× daily contract.

**Pre-loaded courses (Fall 2026):**

*MATH 137 — Calculus 1 (Waterloo)*
- Quizzes 20% — 10 quizzes, Mondays in tutorial, **best 9 of 10**. Weeks: Q1 Sep 21, Q2 Sep 28, Q3 Oct 5, Q4 Oct 19, Q5 Nov 2, Q6 Nov 9, Q7 Nov 16, Q8 Nov 23, Q9 Nov 30, Q10 Dec 7 (approximate Mondays; editable).
- Midterm 30% — Mon Oct 26, 7:00–8:50 pm.
- Final 50% — TBA (Dec exam period).

*CS 115 — Intro to CS 1 (Waterloo)*
- Course Preparation Quiz 1% — Fri Sep 18.
- Assignments 19% — A1 Sep 25, A2 Oct 9, A3 Nov 6, A4 Nov 20, A5 Dec 4 (5:00 pm); **drop lowest**.
- Lab Quizzes 10% — Oct 2, Oct 23, Nov 13, Nov 27; **drop lowest**.
- Midterm 25% — Mon Nov 2, 7:00–8:50 pm.
- Final 45% — TBA.
- Bonus: weekly edX practice quizzes, up to +2%.
- Pass rule: ≥ 50% overall AND ≥ 50% on lab quizzes + midterm + final (≥ 40 of those 80 marks) → warn if at risk.

*MATH 135 — (Waterloo)*
- Weekly assessments 44% — Assignments W0–W3 (Crowdmark, Wednesdays 4:05 pm) + Quizzes W4–W10 (Wednesdays 4:00–5:20 pm in person) = 11 items, **assumed equal weight 4% each** (outline doesn't say; editable). Dates: Wednesdays of weeks 0–10 (approximate; editable).
- Midterm 25% — Wed Oct 21, 7:00–8:50 pm.
- Final 31% — TBA.
- Bonus: Academic-integrity quizzes, up to +3% (4 × 0.5% + 1%).

*EC120 — Intro to Microeconomics (Laurier)*
- Minor assessments 25% — 5 parts × 5% (each part = best 9 of its PA/iClicker/HW; user enters each part's %).
- Review Quizzes 10% — Quiz 1 Fri Oct 2, Quiz 2 Fri Nov 20; **higher counts 8%, lower 2%**.
- Midterm 25% — Fri Oct 23, 3:00–4:00 pm.
- Final 40% — TBA, Dec 12–23.
- Bonus: Learning Curve, up to +5 points on minor assessments (optional field).

*BU111 — Understanding the Business Environment (Laurier)* — marked out of 100:
- Communication Skills Test 6 — Fri Oct 2.
- CIIP Report slidedoc 12 — Sat Oct 24.
- CIIP Presentation 8 — labs Nov 2–4.
- Live Case individual hand-in 10 — Tue Nov 10.
- Live Case group presentation 8 — labs Nov 30–Dec 2 (+1 bonus if advancing to semis).
- Individual presentation quality 4.
- Lab Preparation 8.
- Midterm 20 — Fri Oct 9, 4:00–5:30 pm.
- Final 24 — TBA.
- Bonus marks: up to +5. Pass rule: must pass at least one exam → warn if at risk.

**Exam countdown:** once final dates are entered, Home shows the next final with days left and "need X% on the final for your target".

### 6.8 Stats
Totals (hours, sessions, completion rate), this week vs last, hours by course (bar), daily hours over the term (chart), session history list (course, length, earned, completed/failed, time-lapse thumbnail), achievements gallery, best streak.

### 6.9 Data & safety
- All state on-device. **Back up** button exports everything except time-lapse frames as one JSON file via the share sheet (save to Files); **Restore** imports it. Home shows a gentle nudge if no backup in 7 days.
- Request persistent storage (`navigator.storage.persist()`) where supported.

### 6.10 Deployment
Static site in a new repo in the user's GitHub account, served by GitHub Pages over HTTPS. Service worker for offline use; web app manifest with icon, dark theme colour, standalone display. Install instructions shown on first open in Safari when not installed ("Share → Add to Home Screen").

## 6.11 Delivery & device risk
- **User chose: build it all in one release** (no phased launch).
- iOS version unknown → build defensively: use Screen Wake Lock, and if unavailable or released unexpectedly, fall back to a muted looping inline video to keep the screen awake; if the screen still locks, it's treated as leaving the app (same rules) but the session screen shows a one-time tip to set Auto-Lock to "Never" while studying.
- Things only testable on the real iPhone (leave/return, camera restart, wake lock, Save to Photos) get a short on-device checklist for the user at the end.

## 7. Left to the builder
- Framework/tooling (must output static files deployable to GitHub Pages).
- Exact pay curve, prices, item list and art, achievement list, contract pool (within the shapes above).
- Frame interval/quality to hit the storage target.
- Animations, sounds, chart library.
- How deploy happens (via `gh` if the user's CLI is authenticated, else guided steps for the user).

## 8. Calls I made (for the user to check)
- Name "Billable".
- Camera-denied sessions still allowed at ×0.8 pay.
- 10-second grace; time away not credited.
- Fine = 10% of the full session's value.
- 4 am day boundary; streak multiplier +0.05/day capped ×2.0; max 2 PTO days.
- Slot-based office editing rather than free drag-and-drop.
- MATH 135 weekly items assumed equal weight.
- Default target 80% per course.
- Exam-season bonus Dec 1–23.
- Career save kept separate from term courses so progress carries past December.
- Time-lapse hard cap 300 MB, oldest unstarred deleted first.
- Service-worker updates must never touch on-device data; schema versioned with migrations.
