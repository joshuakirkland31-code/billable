// Marks engine: per-course rules, current %, needed on remaining, 12-point scale.
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function applyRule(vals, rule) {
  const r = rule || { type: 'avg' };
  if (r.type === 'dropLowest') {
    const s = [...vals].sort((a, b) => a - b);
    return mean(s.length > r.n ? s.slice(r.n) : s);
  }
  if (r.type === 'bestOf') {
    const s = [...vals].sort((a, b) => b - a);
    return mean(s.slice(0, Math.max(1, r.keep)));
  }
  if (r.type === 'ranked') {
    const s = [...vals].sort((a, b) => b - a);
    const w = r.weights.slice(0, s.length);
    return s.slice(0, w.length).reduce((acc, v, i) => acc + v * w[i], 0) / w.reduce((a, b) => a + b, 0);
  }
  return mean(vals);
}

/** Score (%) of a component; fill = value for ungraded items, or null to use graded only. */
export function componentScore(component, fill) {
  const vals = component.items.map(i => (isNum(i.score) ? i.score : fill)).filter(isNum);
  if (!vals.length) return null;
  if (vals.length === component.items.length) return applyRule(vals, component.rule);
  return mean(vals);
}

function gradedShare(component) {
  const n = component.items.length;
  return n ? component.items.filter(i => isNum(i.score)).length / n : 0;
}

/** Final grade (%) with ungraded items = fill; fill null → weighted by graded share. */
export function finalGrade(course, fill) {
  let num = 0, den = 0;
  for (const c of course.components) {
    const s = componentScore(c, fill);
    if (s === null) continue;
    const w = fill === null ? c.weight * gradedShare(c) : c.weight;
    num += w * s; den += w;
  }
  if (den === 0) return null;
  const bonus = course.bonus && isNum(course.bonus.value) ? course.bonus.value : 0;
  return (num / den) * (fill === null ? 1 : den / 100) + bonus;
}

const hasUngraded = course => course.components.some(c => c.items.some(i => !isNum(i.score)));

function bisect(f, target) {
  let lo = 0, hi = 150;
  if (f(hi) < target) return null;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= target) hi = mid; else lo = mid;
  }
  return Math.round(hi * 100) / 100;
}

export function computeCourse(course) {
  const current = finalGrade(course, null);
  const target = course.target;
  const remaining = hasUngraded(course);
  const f = x => finalGrade(course, x);
  const maxPossible = remaining ? f(100) : current;
  let needed = remaining ? bisect(f, target) : null;
  let status;
  if (current === null) status = 'no-data';
  else if (!remaining) status = current >= target ? 'on-track' : 'behind';
  else if (f(0) >= target) { status = 'locked'; needed = 0; }
  else if (f(100) < target) status = 'out-of-reach';
  else status = current >= target ? 'on-track' : 'behind';
  const projected = current === null ? null : (remaining ? f(current) : current);
  return { current, needed, status, projected, maxPossible, remaining };
}

/** Needed % on the final exam item, assuming other ungraded work matches the current average. */
export function neededOnFinal(course) {
  const fc = course.components.find(c => c.id === 'final');
  if (!fc || fc.items.every(i => isNum(i.score))) return null;
  const cur = finalGrade(course, null);
  const others = cur === null ? course.target : cur;
  const f = x => {
    const copy = { ...course, components: course.components.map(c => ({
      ...c, items: c.items.map(i => (isNum(i.score) ? i : { ...i, score: c.id === 'final' ? x : others })),
    })) };
    return finalGrade(copy, null);
  };
  const v = bisect(f, course.target);
  return v === null || v > 100 ? Infinity : v; // Infinity = can't reach the target on the final alone
}

const SCALE = [[90, 'A+', 12], [85, 'A', 11], [80, 'A-', 10], [77, 'B+', 9], [73, 'B', 8], [70, 'B-', 7],
  [67, 'C+', 6], [63, 'C', 5], [60, 'C-', 4], [57, 'D+', 3], [53, 'D', 2], [50, 'D-', 1], [-Infinity, 'F', 0]];

export function twelvePoint(pct) {
  const p = Math.round(pct);
  const [, letter, points] = SCALE.find(([min]) => p >= min);
  return { letter, points };
}

function comp(course, id) { return course.components.find(c => c.id === id); }

export function passWarnings(course) {
  const out = [];
  if (course.passRule === 'cs115') {
    const cur = finalGrade(course, null);
    if (cur !== null) {
      const ids = ['labq', 'mid', 'final'];
      const graded = ids.some(id => comp(course, id) && componentScore(comp(course, id), null) !== null);
      if (graded) {
        const pts = ids.reduce((a, id) => a + comp(course, id).weight * componentScore(comp(course, id), cur) / 100, 0);
        if (pts < 40) out.push('At risk: you need 50% on exams + lab quizzes to pass');
      }
    }
  }
  if (course.passRule === 'bu111') {
    const m = componentScore(comp(course, 'mid'), null), f = componentScore(comp(course, 'final'), null);
    if (m !== null && f !== null && m < 50 && f < 50) out.push('Must pass one exam to pass the course');
    else if (m !== null && m < 50 && f === null) out.push('Midterm under 50%: you must pass the final');
  }
  return out;
}

export function overallAverage(courses) {
  const vals = courses.map(c => finalGrade(c, null)).filter(isNum);
  return vals.length ? mean(vals) : null;
}

/** "81" | "81%" | "17/20" → percent; "" → null; invalid → undefined. */
export function parseScore(text) {
  const t = String(text ?? '').trim().replace(/%$/, '').trim();
  if (t === '') return null;
  const frac = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d > 0 ? Math.round((Number(frac[1]) / d) * 10000) / 100 : undefined;
  }
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}
