// Fall 2026 courses, from the official outlines. All editable in the app.
const item = (id, name, date = null) => ({ id, name, date, score: null });
const one = (id, name, weight, date = null) => ({ id, name, weight, rule: { type: 'avg' }, items: [item(id + '1', name, date)] });
const FINAL_WINDOW = 'Final exam (date TBA, Dec exam period)';

export const COURSES = [
  {
    id: 'MATH137', code: 'MATH 137', name: 'Calculus 1', school: 'waterloo', target: 80, finalDate: null,
    bonus: null, passRule: null,
    components: [
      { id: 'quizzes', name: 'Quizzes (best 9 of 10)', weight: 20, rule: { type: 'bestOf', keep: 9 },
        items: ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-19', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']
          .map((d, i) => item('q' + (i + 1), `Quiz ${i + 1}`, d)) },
      one('mid', 'Midterm', 30, '2026-10-26'),
      one('final', FINAL_WINDOW, 50),
    ],
  },
  {
    id: 'CS115', code: 'CS 115', name: 'Intro to Computer Science 1', school: 'waterloo', target: 80, finalDate: null,
    bonus: { label: 'Weekly edX practice quizzes', max: 2, value: null }, passRule: 'cs115',
    components: [
      one('prep', 'Course Preparation Quiz', 1, '2026-09-18'),
      { id: 'assign', name: 'Assignments (lowest dropped)', weight: 19, rule: { type: 'dropLowest', n: 1 },
        items: ['2026-09-25', '2026-10-09', '2026-11-06', '2026-11-20', '2026-12-04'].map((d, i) => item('a' + (i + 1), `Assignment ${i + 1}`, d)) },
      { id: 'labq', name: 'Lab Quizzes (lowest dropped)', weight: 10, rule: { type: 'dropLowest', n: 1 },
        items: ['2026-10-02', '2026-10-23', '2026-11-13', '2026-11-27'].map((d, i) => item('l' + (i + 1), `Lab Quiz ${i + 1}`, d)) },
      one('mid', 'Midterm', 25, '2026-11-02'),
      one('final', FINAL_WINDOW, 45),
    ],
  },
  {
    id: 'MATH135', code: 'MATH 135', name: 'Algebra for Honours Mathematics', school: 'waterloo', target: 80, finalDate: null,
    bonus: { label: 'Academic Integrity bonus quizzes', max: 3, value: null }, passRule: null,
    components: [
      { id: 'weekly', name: 'Weekly assessments (W0–W10)', weight: 44, rule: { type: 'avg' },
        items: ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']
          .map((d, i) => item('w' + i, i < 4 ? `Assignment W${i}` : `Quiz W${i}`, d)) },
      one('mid', 'Midterm', 25, '2026-10-21'),
      one('final', FINAL_WINDOW, 31),
    ],
  },
  {
    id: 'EC120', code: 'EC120', name: 'Intro to Microeconomics', school: 'laurier', target: 80, finalDate: null,
    bonus: { label: 'Learning Curve (overall % points)', max: 1.25, value: null }, passRule: null,
    components: [
      { id: 'minor', name: 'Minor assessments (5 parts, best 9 each)', weight: 25, rule: { type: 'avg' },
        items: ['2026-09-24', '2026-10-08', '2026-11-10', '2026-11-24', '2026-12-08'].map((d, i) => item('p' + (i + 1), `Part ${i + 1}`, d)) },
      { id: 'quizzes', name: 'Review Quizzes (higher 8%, lower 2%)', weight: 10, rule: { type: 'ranked', weights: [8, 2] },
        items: [item('rq1', 'Review Quiz 1', '2026-10-02'), item('rq2', 'Review Quiz 2', '2026-11-20')] },
      one('mid', 'Midterm', 25, '2026-10-23'),
      one('final', FINAL_WINDOW, 40),
    ],
  },
  {
    id: 'BU111', code: 'BU111', name: 'Understanding the Business Environment', school: 'laurier', target: 80, finalDate: null,
    bonus: { label: 'Bonus marks (SI, workshops, quizzes)', max: 5, value: null }, passRule: 'bu111',
    components: [
      one('comm', 'Communication Skills Test', 6, '2026-10-02'),
      one('ciip_report', 'CIIP Report slidedoc', 12, '2026-10-24'),
      one('ciip_pres', 'CIIP Presentation', 8, '2026-11-03'),
      one('lc_ind', 'Live Case individual hand-in', 10, '2026-11-10'),
      one('lc_group', 'Live Case group presentation', 8, '2026-12-01'),
      one('pres_quality', 'Individual presentation quality', 4, '2026-12-01'),
      one('lab_prep', 'Lab Preparation', 8),
      one('mid', 'Midterm', 20, '2026-10-09'),
      one('final', FINAL_WINDOW, 24),
    ],
  },
];
