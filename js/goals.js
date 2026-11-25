// Goals (short / medium / long term) with steps.
let seq = 0;
export const uid = (p, now) => p + now.toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/** v1 "Why I grind" lines -> long-term goals with no steps. */
export function migrateWhy(why, now) {
  return why.map(t => String(t || '').trim()).filter(Boolean).map((title, i) => ({
    id: `gwhy${i}`, title, tier: 'long', courseId: null, due: null, steps: [],
    createdAt: now, doneAt: null, archived: false, paid: false,
  }));
}
