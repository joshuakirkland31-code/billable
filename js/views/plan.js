// Plan tab placeholder until the Apple-style planner lands (Phase 3).
import { h } from '../dom.js';

export function render(root) {
  root.append(h('div', { class: 'stack' },
    h('h1', null, 'Plan'),
    h('div', { class: 'card stack center', style: { padding: '28px 16px' } },
      h('div', { style: { fontSize: '44px' } }, '🗓️'),
      h('h2', null, 'Your planner is on the way'),
      h('p', { class: 'dim' }, 'An Apple Calendar–style day and week view for your classes and planned study sessions arrives in the next update. Planned sessions will become contracts, and you can add them to your real Apple Calendar for reminders.'))));
}
