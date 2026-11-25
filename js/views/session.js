// Clock In: a stopwatch with an optional goal. The clock keeps running while you use the rest of the app.
import { h, money, fmtClock, fmtMin, toast } from '../dom.js';
import { elapsedMs, goalReached, examMultFor, GRACE_MS, MIN_SAVE_MIN } from '../session.js';
import { payFor, payCtx } from '../economy.js';
import { openSteps } from '../goals.js';

const GOALS = [null, 25, 50, 90];
const setup = { courseId: null, goalMin: 50, stepId: '' };

const courseCode = (s, id) => id === 'OTHER' ? 'Other' : ((s.term.courses.find(c => c.id === id) || {}).code || id);

export function render(root, app) {
  if (app.state.active) return renderRunning(root, app);
  return renderSetup(root, app);
}

function renderSetup(root, app) {
  const s = app.state;
  if (!setup.courseId) setup.courseId = s.term.courses[0] ? s.term.courses[0].id : 'OTHER';
  const courseChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Course' });
  const goalChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Goal' });
  const custom = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 5, max: 300, placeholder: 'Custom goal (5–300 min)', style: { maxWidth: '240px' } });
  const stepSel = h('select', { class: 'input', 'aria-label': 'Working on' });
  const note = h('div', { class: 'small dim' });

  const drawCourses = () => courseChips.replaceChildren(...[...s.term.courses.map(c => [c.id, c.code]), ['OTHER', 'Other']].map(([id, label]) =>
    h('button', { class: 'chip', 'aria-pressed': String(setup.courseId === id), onclick: () => { setup.courseId = id; drawCourses(); drawSteps(); } }, label)));
  const drawGoals = () => goalChips.replaceChildren(...GOALS.map(m =>
    h('button', { class: 'chip', 'aria-pressed': String(setup.goalMin === m && !custom.value), onclick: () => { custom.value = ''; setup.goalMin = m; drawGoals(); drawNote(); } }, m ? `${m} min` : 'No goal')));
  const drawSteps = () => {
    const steps = openSteps(s).sort((a, b) => (b.goal.courseId === setup.courseId) - (a.goal.courseId === setup.courseId));
    stepSel.replaceChildren(h('option', { value: '' }, 'Nothing specific'),
      ...steps.map(({ goal, step }) => h('option', { value: `${goal.id}:${step.id}`, selected: setup.stepId === `${goal.id}:${step.id}` }, `${step.text} — ${goal.title}`)));
    if (!steps.some(x => `${x.goal.id}:${x.step.id}` === setup.stepId)) setup.stepId = '';
  };
  const drawNote = () => {
    const ctx = payCtx(s.career, { examMult: examMultFor(s, setup.courseId, app.now()), goalHit: !!setup.goalMin });
    note.textContent = setup.goalMin
      ? `Reach ${setup.goalMin} min for +10%. That shift pays ≈ ${money(payFor(setup.goalMin, ctx))}. Keep going as long as you like.`
      : 'No goal: the clock just counts up until you clock out.';
  };
  custom.addEventListener('input', () => {
    const v = Math.round(Number(custom.value));
    custom.classList.toggle('bad', !!custom.value && !(v >= 5 && v <= 300));
    if (v >= 5 && v <= 300) setup.goalMin = v;
    drawGoals(); drawNote();
  });
  stepSel.addEventListener('change', () => { setup.stepId = stepSel.value; });
  drawCourses(); drawGoals(); drawSteps(); drawNote();

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back' }, '‹'), h('div', { class: 'label' }, 'Clock in'), h('span', { style: { width: '44px' } })),
    h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Billing to'), courseChips),
    h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Session goal (optional)'), goalChips, custom, note),
    h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Working on'), stepSel,
      h('div', { class: 'small dim' }, 'Pick a goal step and you can tick it off when you clock out.')),
    h('div', { class: 'card small dim stack' },
      h('div', null, '⏱ The clock counts up — stop when the work is actually done.'),
      h('div', null, `📱 Use the rest of the app freely. Leaving the app for more than ${GRACE_MS / 1000} seconds ends the session (you keep the pay).`),
      h('div', null, `Sessions under ${MIN_SAVE_MIN} minutes aren't saved.`)),
    h('button', { class: 'btn btn-gold btn-xl btn-block', onclick: () => {
      const v = Number(custom.value);
      if (custom.value && !(v >= 5 && v <= 300)) { toast('Custom goal must be 5–300 minutes', { bad: true }); return; }
      app.beginSession({ courseId: setup.courseId, goalMin: setup.goalMin, stepId: setup.stepId ? setup.stepId.split(':')[1] : null });
    } }, '▶  START')));
}

function renderRunning(root, app) {
  const s = app.state, a = s.active;
  const code = courseCode(s, a.courseId);
  const clock = h('div', { class: 'huge stopwatch', 'aria-live': 'off' }, '0:00');
  const goalLine = h('div', { class: 'small mono' });
  const barFill = h('i', { style: { width: '0%' } });
  const earned = h('b', { class: 'gold mono' }, '$0');
  const step = a.stepId && s.goals.flatMap(g => g.steps).find(x => x.id === a.stepId);

  const update = () => {
    const cur = app.state.active; if (!cur) return;
    const now = app.now();
    const ms = elapsedMs(cur, now);
    clock.textContent = fmtClock(ms);
    const hit = goalReached(cur, now);
    if (cur.goalMin) {
      const left = Math.ceil((cur.goalMin * 60000 - ms) / 60000);
      goalLine.textContent = hit ? `Goal hit ✓  ${cur.goalMin}m — +10% bonus locked in` : `Goal ${cur.goalMin}m — ${fmtMin(left)} to go`;
      goalLine.className = 'small mono ' + (hit ? 'gold' : 'dim');
      barFill.style.width = Math.min(100, (ms / (cur.goalMin * 60000)) * 100) + '%';
    }
    const ctx = payCtx(app.state.career, { examMult: examMultFor(app.state, cur.courseId, cur.startedAt), goalHit: hit });
    earned.textContent = money(payFor(Math.floor(ms / 60000), ctx));
  };

  root.append(h('div', { class: 'session running' },
    h('div', { class: 'card center stack' },
      h('div', { class: 'between' }, h('span', { class: 'label' }, '● On the clock'), h('span', { class: 'pill gold' }, code)),
      clock,
      a.goalMin ? h('div', { class: 'bar' }, barFill) : null,
      a.goalMin ? goalLine : h('div', { class: 'small dim' }, 'No goal set — stop whenever the work is done.'),
      step ? h('div', { class: 'small' }, 'Working on: ', h('b', null, step.text)) : null,
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'Billed so far'), earned)),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-gold btn-xl btn-block', onclick: () => app.requestClockOut() }, '■  CLOCK OUT'),
      h('a', { class: 'btn btn-block', href: '#home' }, 'Keep the clock running and browse →'),
      h('div', { class: 'small dim center' }, `Leaving the app for more than ${GRACE_MS / 1000}s ends the session. You keep what you've billed.`))));
  app.onTick = update;
  update();
}
