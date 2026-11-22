// Tiny test harness: describe / it / expect, async-aware.
const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  if (!current) throw new Error('it() outside describe()');
  current.tests.push({ name, fn });
}

function fmt(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

export function expect(actual) {
  const fail = msg => { throw new Error(msg); };
  return {
    toBe(x) { if (!Object.is(actual, x)) fail(`expected ${fmt(actual)} to be ${fmt(x)}`); },
    toEqual(x) { if (!deepEqual(actual, x)) fail(`expected ${fmt(actual)} to equal ${fmt(x)}`); },
    toBeCloseTo(x, digits = 2) {
      if (typeof actual !== 'number' || Math.abs(actual - x) >= Math.pow(10, -digits) / 2)
        fail(`expected ${fmt(actual)} to be close to ${x} (${digits} digits)`);
    },
    toBeNull() { if (actual !== null) fail(`expected ${fmt(actual)} to be null`); },
    toBeTruthy() { if (!actual) fail(`expected ${fmt(actual)} to be truthy`); },
    toBeFalsy() { if (actual) fail(`expected ${fmt(actual)} to be falsy`); },
    toBeGreaterThan(x) { if (!(actual > x)) fail(`expected ${fmt(actual)} > ${x}`); },
    toBeLessThan(x) { if (!(actual < x)) fail(`expected ${fmt(actual)} < ${x}`); },
    toContain(x) { if (!actual || !actual.includes(x)) fail(`expected ${fmt(actual)} to contain ${fmt(x)}`); },
    toThrow(msg) {
      let threw = false, err;
      try { actual(); } catch (e) { threw = true; err = e; }
      if (!threw) fail('expected function to throw');
      if (msg && !String(err && err.message).includes(msg)) fail(`expected throw "${msg}", got "${err && err.message}"`);
    },
    async toReject(msg) {
      let threw = false, err;
      try { await actual; } catch (e) { threw = true; err = e; }
      if (!threw) fail('expected promise to reject');
      if (msg && !String(err && err.message).includes(msg)) fail(`expected reject "${msg}", got "${err && err.message}"`);
    },
  };
}

export async function run(loadErrors = []) {
  const lines = [];
  let total = 0, failed = loadErrors.length;
  for (const e of loadErrors) lines.push(`FAIL load › ${e}`);
  for (const s of suites) {
    for (const t of s.tests) {
      total++;
      try { await t.fn(); }
      catch (e) { failed++; lines.push(`FAIL ${s.name} › ${t.name}: ${e && e.message}`); }
    }
  }
  const summary = failed === 0 ? `ALL PASS (${total} tests)` : `FAILED ${failed} of ${total + loadErrors.length}`;
  lines.unshift(summary);
  const out = document.getElementById('out');
  out.textContent = lines.join('\n');
  document.title = summary;
  return { total, failed };
}
