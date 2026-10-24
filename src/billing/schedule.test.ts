import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitEvenly, percentOf, bundlePercent, coursePrice, buildSchedule, quoteCheckout,
  cancelPlan, swapPlan, dueForCharging, dueForReminder, type Term, type Plan,
} from './schedule.ts';

const terms: Term[] = [
  { id: 't1', number: 1, startsOn: '2026-09-07', endsOn: '2026-10-23', billsOn: '2026-09-01' },
  { id: 't2', number: 2, startsOn: '2026-11-02', endsOn: '2026-12-18', billsOn: '2026-10-26' },
  { id: 't3', number: 3, startsOn: '2027-01-04', endsOn: '2027-02-12', billsOn: '2026-12-21' },
  { id: 't4', number: 4, startsOn: '2027-02-22', endsOn: '2027-03-26', billsOn: '2027-02-15' },
  { id: 't5', number: 5, startsOn: '2027-04-12', endsOn: '2027-05-28', billsOn: '2027-04-05' },
  { id: 't6', number: 6, startsOn: '2027-06-07', endsOn: '2027-07-23', billsOn: '2027-05-31' },
];
const KS3: Plan = { totalPence: 27200, termCount: 6, lessonsPerWeek: 1, registrationFeePence: 2500 };
const PRE_CORE: Plan = { totalPence: 81600, termCount: 6, lessonsPerWeek: 2, registrationFeePence: 2500 };
const IGCSE: Plan = { totalPence: 121800, termCount: 5, lessonsPerWeek: 3, registrationFeePence: 2500 }; // GCSE 1-year
const GCSE2_Y1: Plan = { totalPence: 95200, termCount: 6, lessonsPerWeek: 2, registrationFeePence: 2500 };
const GCSE2_Y2: Plan = { totalPence: 84000, termCount: 5, lessonsPerWeek: 2, registrationFeePence: 2500 };
const tiers = [{ minCourses: 3, percentOff: 10 }, { minCourses: 5, percentOff: 15 }];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('splitEvenly always adds back up to the total', () => {
  assert.deepEqual(splitEvenly(121800, 5), [24360, 24360, 24360, 24360, 24360]); // £243.60 a term, as in the old admin
  assert.deepEqual(splitEvenly(27200, 3), [9067, 9067, 9066]);
  for (const [t, n] of [[1, 6], [99999, 7], [0, 3], [24480, 5]]) assert.equal(sum(splitEvenly(t, n)), t);
  assert.throws(() => splitEvenly(-1, 2)); assert.throws(() => splitEvenly(100, 0)); assert.throws(() => splitEvenly(10.5, 2));
});

test('bundle tiers match the homepage price table', () => {
  assert.equal(bundlePercent(1, tiers), 0);
  assert.equal(bundlePercent(2, tiers), 0);
  assert.equal(bundlePercent(3, tiers), 10);
  assert.equal(bundlePercent(4, tiers), 10);
  assert.equal(bundlePercent(5, tiers), 15);
  assert.equal(coursePrice(KS3, 10).netPence, 24480); // £244.80
  assert.equal(coursePrice(KS3, 15).netPence, 23120); // £231.20
  assert.equal(coursePrice(KS3, 10).netPence * 3, 73440); // £734.40 for 3
  assert.equal(coursePrice(KS3, 15).netPence * 5, 115600); // £1,156 for 5
});

test('coupons apply after the bundle discount and never go below zero', () => {
  assert.equal(coursePrice(KS3, 0, { percentOff: 10 }).netPence, 24480);
  assert.equal(coursePrice(KS3, 10, { percentOff: 10 }).netPence, 24480 - percentOf(24480, 10));
  assert.equal(coursePrice(KS3, 0, { amountOffPence: 50000 }).netPence, 0);
});

test('KS3 and Pre-GCSE core run all 6 terms; a 1-year GCSE stops after term 5', () => {
  const ks3 = buildSchedule({ netPence: 27200, plan: KS3, terms, enrolOn: '2026-08-20' });
  assert.deepEqual(ks3.map(x => x.termNumber), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ks3.map(x => x.amountPence), [4534, 4534, 4533, 4533, 4533, 4533]);
  const core = buildSchedule({ netPence: 81600, plan: PRE_CORE, terms, enrolOn: '2026-08-20' });
  assert.deepEqual(core.map(x => x.amountPence), [13600, 13600, 13600, 13600, 13600, 13600]);
  const g1 = buildSchedule({ netPence: 121800, plan: IGCSE, terms, enrolOn: '2026-08-20' });
  assert.equal(g1.length, 5);
});

test('a 2-year GCSE bills each course year on its own: 6 terms, then 5 terms', () => {
  const y1 = buildSchedule({ netPence: 95200, plan: GCSE2_Y1, terms, enrolOn: '2026-08-20' });
  const y2 = buildSchedule({ netPence: 84000, plan: GCSE2_Y2, terms, enrolOn: '2026-08-20' });
  assert.equal(y1.length, 6); assert.equal(y2.length, 5);
  assert.deepEqual(y2.map(x => x.amountPence), [16800, 16800, 16800, 16800, 16800]);
  assert.equal(sum(y1.map(x => x.amountPence)) + sum(y2.map(x => x.amountPence)), 179200); // £1,792 over the two years
});

test('a September enrolment bills terms 1 to 5 on their bill dates', () => {
  const s = buildSchedule({ netPence: 121800, plan: IGCSE, terms, enrolOn: '2026-08-20' });
  assert.deepEqual(s.map(x => x.termNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(s.map(x => x.dueOn), ['2026-09-01', '2026-10-26', '2026-12-21', '2027-02-15', '2027-04-05']);
  assert.equal(sum(s.map(x => x.amountPence)), 121800);
});

test('late joiner: finished terms are not charged, the current term is due today', () => {
  const s = buildSchedule({ netPence: 27200, plan: KS3, terms, enrolOn: '2026-11-10' });
  assert.deepEqual(s.map(x => x.termNumber), [2, 3, 4, 5, 6]);
  assert.equal(s[0].dueOn, '2026-11-10');
  assert.equal(sum(s.map(x => x.amountPence)), 27200 - 4534);
});

test('late joiner with full_price policy spreads the whole price over remaining terms', () => {
  const s = buildSchedule({ netPence: 27200, plan: KS3, terms, enrolOn: '2026-11-10', lateJoin: 'full_price' });
  assert.equal(s.length, 5);
  assert.equal(sum(s.map(x => x.amountPence)), 27200);
});

test('enrolling after the course has ended creates no charges', () => {
  assert.deepEqual(buildSchedule({ netPence: 121800, plan: IGCSE, terms, enrolOn: '2027-06-01' }), []);
});

test('checkout quote: 3 KS3 courses in October', () => {
  const q = quoteCheckout({
    cart: [{ groupId: 'a', plan: KS3 }, { groupId: 'b', plan: KS3 }, { groupId: 'c', plan: KS3 }],
    existingCourseCount: 0, tiers, terms, today: '2026-10-01', registrationFeePaid: false,
  });
  assert.equal(q.bundlePercent, 10);
  assert.equal(q.registrationFeePence, 2500);
  // each course £244.80 over 6 terms = £40.80 a term; term 1's bill date has passed, so it is due today
  assert.equal(q.payTodayPence, 2500 + 3 * 4080);
  assert.equal(q.payTodayPence + q.laterPence, 2500 + 73440);
});

test('checkout quote: a course added later counts towards the bundle and skips the registration fee', () => {
  const q = quoteCheckout({ cart: [{ groupId: 'x', plan: KS3 }], existingCourseCount: 2, tiers, terms, today: '2026-08-15', registrationFeePaid: true });
  assert.equal(q.bundlePercent, 10);
  assert.equal(q.registrationFeePence, 0);
  assert.equal(q.payTodayPence, 0);
  assert.equal(q.laterPence, 24480);
});

test('cancelling stops unpaid instalments only', () => {
  const r = cancelPlan([
    { id: 'i1', termNumber: 1, dueOn: '2026-09-01', amountPence: 5440, status: 'paid' },
    { id: 'i2', termNumber: 2, dueOn: '2026-10-26', amountPence: 5440, status: 'failed' },
    { id: 'i3', termNumber: 3, dueOn: '2026-12-21', amountPence: 5440, status: 'scheduled' },
  ]);
  assert.deepEqual(r.map(x => x.id), ['i2', 'i3']);
});

test('swapping to a dearer class re-prices only the unpaid terms', () => {
  const r = swapPlan([
    { id: 'i1', termNumber: 1, dueOn: '2026-09-01', amountPence: 4534, status: 'paid' },
    { id: 'i2', termNumber: 2, dueOn: '2026-10-26', amountPence: 4534, status: 'scheduled' },
  ], 27200, 40800, 6);
  assert.deepEqual(r.cancel, ['i2']);
  assert.deepEqual(r.reissue, [{ termNumber: 2, dueOn: '2026-10-26', amountPence: 6800 }]);
});

test('nightly job picks due charges and reminder dates', () => {
  const list = [
    { id: 'a', termNumber: 1, dueOn: '2026-10-26', amountPence: 1, status: 'scheduled' as const },
    { id: 'b', termNumber: 2, dueOn: '2026-11-13', amountPence: 1, status: 'scheduled' as const },
    { id: 'c', termNumber: 3, dueOn: '2026-10-01', amountPence: 1, status: 'paid' as const },
  ];
  assert.deepEqual(dueForCharging(list, '2026-10-26').map(i => i.id), ['a']);
  assert.deepEqual(dueForReminder(list, '2026-10-26', 18).map(i => i.id), ['b']);
});
