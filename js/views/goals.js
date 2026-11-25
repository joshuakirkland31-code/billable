// Goals tab: short / medium / long-term goals, each broken into steps that feed your daily contracts.
import { h, money, fmtDate, toast, openSheet, confirmSheet, bar } from '../dom.js';
import { TIERS, TIER_NAMES, GOAL_REWARD_MIN, createGoal, updateGoal, deleteGoal, addStep, editStep, deleteStep, moveStep,
  tickStep, completeGoal, canComplete } from '../goals.js';
import { addStepToToday, evaluateDailyContracts } from '../contracts.js';
import { achievementById } from '../achievements.js';
import { dayKey } from '../time.js';
import { playCash } from '../sound.js';

const HINT = { short: 'Days to two weeks', medium: 'This term', long: 'The big why' };
const showDone = { open: false };

/** Tick/untick a step from anywhere, settle today's contracts, and tell the user what happened. */
export async function tickAndToast(app, goalId, stepId, done) {
  const now = app.now();
  const r = tickStep(app.state, goalId, stepId, done, now);
  const ev = evaluateDailyContracts(r.state, dayKey(new Date(now)));
  await app.commit(ev.state);
  const { reason, paid, newAchievements } = r.receipt;
  if (reason === 'ok') { playCash(); toast(`✔ Step done  +${money(paid + ev.cash)}`); }
  else if (reason === 'too-new') toast('Done ✔ — steps pay once they\'ve been on your list for an hour', { ms: 3500 });
  else if (reason === 'cap') toast('Done ✔ — daily step pay limit reached (10)', { ms: 3500 });
  else if (reason === 'already') toast('Done ✔ (already paid)');
  else if (ev.cash) { playCash(); toast(`+${money(ev.cash)} contracts`); }
  for (const id of newAchievements) { const a = achievementById(id, app.state); toast(`🏆 ${a ? a.name : id}`); }
}

function courseOptions(app, selected) {
  return [h('option', { value: '' }, 'No course'), ...app.state.term.courses.map(c => h('option', { value: c.id, selected: c.id === selected }, c.code))];
}

function newGoalSheet(app, tier = 'short') {
  const title = h('input', { class: 'input', placeholder: 'e.g. Ace the EC120 final', maxlength: 80, style: { fontFamily: 'var(--sans)' } });
  let t = tier;
  const chips = h('div', { class: 'chips' });
  const draw = () => chips.replaceChildren(...TIERS.map(x => h('button', { class: 'chip', 'aria-pressed': String(t === x), onclick: () => { t = x; draw(); } }, TIER_NAMES[x])));
  draw();
  const course = h('select', { class: 'input' }, courseOptions(app, null));
  const due = h('input', { class: 'input', type: 'date' });
  const close = openSheet(h('div', { class: 'stack' },
    h('h2', null, 'New goal'),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Goal'), title),
    h('div', { class: 'stack' }, h('span', { class: 'label' }, 'Term'), chips),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Course'), course),
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Due (optional)'), due)),
    h('button', { class: 'btn btn-gold btn-block', onclick: async () => {
      if (!title.value.trim()) { title.classList.add('bad'); toast('Give the goal a name', { bad: true }); return; }
      const r = createGoal(app.state, { title: title.value, tier: t, courseId: course.value || null, due: due.value || null }, app.now());
      close();
      await app.commit(r.state, { rerender: false });
      app.go('#goal/' + r.goal.id);
    } }, 'CREATE GOAL')));
}

function goalCard(app, g) {
  const done = g.steps.filter(x => x.done).length;
  const code = g.courseId && (app.state.term.courses.find(c => c.id === g.courseId) || {}).code;
  return h('a', { class: 'card tap stack', href: '#goal/' + g.id, style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'between' }, h('b', null, g.title), g.doneAt ? h('span', { class: 'pill green' }, 'DONE') : h('span', { class: 'mono small dim' }, `${done}/${g.steps.length}`)),
    g.steps.length ? bar(g.steps.length ? (done / g.steps.length) * 100 : 0, done === g.steps.length ? 'green' : '') : h('div', { class: 'small dim' }, 'No steps yet — tap to break it down'),
    (code || g.due) ? h('div', { class: 'row small dim' }, code ? h('span', { class: 'pill' }, code) : null, g.due ? h('span', null, 'Due ' + fmtDate(g.due)) : null) : null);
}

export function render(root, app, params, name) {
  if (name === 'goal' && params[0]) return renderGoal(root, app, params[0]);
  const s = app.state;
  const active = s.goals.filter(g => !g.doneAt && !g.archived);
  const finished = s.goals.filter(g => g.doneAt);
  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('h1', { style: { margin: 0 } }, 'Goals'), h('button', { class: 'btn btn-gold', onclick: () => newGoalSheet(app) }, '+ NEW GOAL')),
    h('div', { class: 'small dim' }, 'Break goals into steps. Your open steps become today\'s contracts, and each one you finish pays.'),
    TIERS.map(t => h('div', { class: 'stack' },
      h('div', { class: 'between', style: { marginTop: '8px' } }, h('div', null, h('h2', { style: { margin: 0 } }, TIER_NAMES[t]), h('div', { class: 'small dim' }, `${HINT[t]} · finishing one pays ${GOAL_REWARD_MIN[t]} min of salary`)),
        h('button', { class: 'icon-btn', 'aria-label': `New ${TIER_NAMES[t]} goal`, onclick: () => newGoalSheet(app, t) }, '+')),
      active.filter(g => g.tier === t).map(g => goalCard(app, g)),
      active.some(g => g.tier === t) ? null : h('div', { class: 'card small dim' }, 'Nothing here yet.'))),
    finished.length ? h('div', { class: 'stack' },
      h('button', { class: 'btn btn-ghost', onclick: () => { showDone.open = !showDone.open; app.render(); } }, `${showDone.open ? '▾' : '▸'} Done (${finished.length})`),
      showDone.open ? finished.map(g => goalCard(app, g)) : null) : null));
}

function renderGoal(root, app, id) {
  const s = app.state;
  const g = s.goals.find(x => x.id === id);
  if (!g) { root.append(h('p', null, 'Goal not found. ', h('a', { href: '#goals' }, 'Back to goals'))); return; }
  const day = dayKey(new Date(app.now()));
  const inToday = sid => s.career.contracts.day === day && s.career.contracts.items.some(i => i.key === `step:${g.id}:${sid}`);
  const set = next => app.commit(next);
  const newStep = h('input', { class: 'input', placeholder: 'Add a step, e.g. "Do chapter 6 practice set"', maxlength: 120, style: { fontFamily: 'var(--sans)' } });
  const add = () => { if (!newStep.value.trim()) return; set(addStep(app.state, g.id, newStep.value, app.now()).state); };
  newStep.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  const tierChips = h('div', { class: 'chips' }, TIERS.map(t => h('button', { class: 'chip', 'aria-pressed': String(g.tier === t), onclick: () => set(updateGoal(app.state, g.id, { tier: t })) }, TIER_NAMES[t])));
  const ready = canComplete(g) && !g.paid;

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#goals', 'aria-label': 'Back' }, '‹'), h('div', { class: 'label' }, TIER_NAMES[g.tier]),
      h('button', { class: 'icon-btn', 'aria-label': 'Delete goal', onclick: async () => {
        if (await confirmSheet('Delete this goal?', 'Its steps are deleted too. Money already earned stays.', 'Delete', { danger: true })) { await app.commit(deleteGoal(app.state, g.id), { rerender: false }); app.go('#goals'); }
      } }, '🗑')),
    h('input', { class: 'input', value: g.title, 'aria-label': 'Goal title', style: { fontFamily: 'var(--sans)', fontSize: '18px', fontWeight: 700 }, onchange: e => set(updateGoal(app.state, g.id, { title: e.target.value.trim() || g.title })) }),
    tierChips,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Course'), h('select', { class: 'input', onchange: e => set(updateGoal(app.state, g.id, { courseId: e.target.value || null })) }, courseOptions(app, g.courseId))),
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Due'), h('input', { class: 'input', type: 'date', value: g.due || '', onchange: e => set(updateGoal(app.state, g.id, { due: e.target.value || null })) }))),
    h('div', { class: 'card stack' },
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'Steps'), h('span', { class: 'mono small dim' }, `${g.steps.filter(x => x.done).length}/${g.steps.length}`)),
      g.steps.length ? h('div', { class: 'list' }, g.steps.map((st, i) => h('div', { class: 'li step-row' },
        h('button', { class: 'check' + (st.done ? ' on' : ''), 'aria-label': st.done ? 'Mark not done' : 'Mark done', 'aria-pressed': String(st.done), onclick: () => tickAndToast(app, g.id, st.id, !st.done) }, st.done ? '✓' : ''),
        h('input', { class: 'input grow step-text' + (st.done ? ' done' : ''), value: st.text, 'aria-label': 'Step', onchange: e => set(editStep(app.state, g.id, st.id, e.target.value)) }),
        h('div', { class: 'step-tools' },
        !st.done && !g.doneAt ? (inToday(st.id)
          ? h('span', { class: 'pill gold small' }, 'TODAY')
          : h('button', { class: 'chip', onclick: async () => {
              const r = addStepToToday(app.state, g.id, st.id, day);
              await app.commit(r.state);
              toast(r.added ? 'Added to today\'s contracts' : 'Today\'s contracts are full (5) — it\'ll be first tomorrow');
            } }, '+ Today')) : null,
        h('div', { class: 'row', style: { gap: '2px' } },
          h('button', { class: 'icon-btn mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => set(moveStep(app.state, g.id, st.id, -1)) }, '↑'),
          h('button', { class: 'icon-btn mini', 'aria-label': 'Move down', disabled: i === g.steps.length - 1, onclick: () => set(moveStep(app.state, g.id, st.id, 1)) }, '↓'),
          h('button', { class: 'icon-btn mini', 'aria-label': 'Delete step', onclick: () => set(deleteStep(app.state, g.id, st.id)) }, '✕'))))))
        : h('div', { class: 'small dim' }, 'No steps yet. Small, concrete steps work best.'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, newStep), h('button', { class: 'btn btn-gold', onclick: add }, 'ADD'))),
    g.doneAt
      ? h('div', { class: 'card gold-edge center' }, '🏁 Completed ', fmtDate(dayKey(new Date(g.doneAt))))
      : h('button', { class: 'btn btn-block ' + (ready ? 'btn-gold' : ''), disabled: !ready, onclick: async () => {
          const r = completeGoal(app.state, g.id, app.now());
          await app.commit(r.state);
          if (r.receipt.reason === 'ok') { playCash(); toast(`🏁 Goal complete  +${money(r.receipt.paid)}`); }
          for (const a of r.receipt.newAchievements) { const x = achievementById(a, app.state); toast(`🏆 ${x ? x.name : a}`); }
        } }, ready ? `COMPLETE GOAL · +${GOAL_REWARD_MIN[g.tier]} min of salary` : 'Complete goal (needs 2+ steps, all done)')));
}
