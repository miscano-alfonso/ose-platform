/**
 * Termly billing rules for OH-SO platform.
 *
 * Pure functions with no database or Stripe calls, so the rules can be tested on their own
 * and reused by checkout, the admin and the nightly billing job.
 * All money is in pence (integers).
 *
 * Rules marked ASSUMPTION need confirming against how OH-SO ED bills today.
 */

export type Term = { id: string; number: number; startsOn: string; endsOn: string; billsOn: string };
/**
 * One year of a course. Course shapes at OH-SO ED:
 *   KS3 1 lesson/week x 6 terms · Pre-GCSE core 2/week x 6 terms · GCSE 1-year 3/week x 5 terms
 *   GCSE 2-year: year 1 2/week x 6 terms, year 2 2/week x 5 terms (each course year is its own plan)
 * The course runs in terms 1..termCount and bills one instalment per term it runs.
 */
export type Plan = { totalPence: number; termCount: number; registrationFeePence: number; lessonsPerWeek?: number };
export type BundleTier = { minCourses: number; percentOff: number };
export type Coupon = { percentOff?: number; amountOffPence?: number };
export type LateJoinPolicy = 'drop_finished_terms' | 'full_price';

export type ScheduledInstalment = { termId: string; termNumber: number; dueOn: string; amountPence: number };

/** Split a total into n parts that add up exactly; leftover pennies go to the earliest parts. */
export function splitEvenly(totalPence: number, n: number): number[] {
  if (!Number.isInteger(totalPence) || totalPence < 0) throw new Error('total must be a non-negative whole number of pence');
  if (!Number.isInteger(n) || n < 1) throw new Error('instalments must be at least 1');
  const base = Math.floor(totalPence / n);
  const extra = totalPence - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Percentage of a pence amount, rounded half up to the nearest penny. */
export function percentOf(pence: number, percent: number): number {
  return Math.round((pence * percent) / 100 + 1e-9);
}

/**
 * Bundle discount for a student, from how many courses they take that year.
 * Homepage example: 3 courses = 10% off each, 5 courses = 15% off each.
 */
export function bundlePercent(courseCount: number, tiers: BundleTier[]): number {
  return tiers.filter(t => courseCount >= t.minCourses).reduce((best, t) => Math.max(best, t.percentOff), 0);
}

/** Price of one course for the year after bundle and coupon discounts. */
export function coursePrice(plan: Plan, bundlePct: number, coupon?: Coupon): { listPence: number; discountPence: number; netPence: number } {
  const listPence = plan.totalPence;
  let net = listPence - percentOf(listPence, bundlePct);
  if (coupon?.percentOff) net -= percentOf(net, coupon.percentOff);
  if (coupon?.amountOffPence) net -= coupon.amountOffPence;
  net = Math.max(0, net);
  return { listPence, discountPence: listPence - net, netPence: net };
}

/** The terms a course runs in, and so bills across: terms 1..termCount of the year (a 5-term GCSE year ends after term 5). */
export function billingTerms(terms: Term[], termCount: number): Term[] {
  const sorted = [...terms].sort((a, b) => a.number - b.number);
  if (sorted.length < termCount) throw new Error(`course runs ${termCount} terms but the year has ${sorted.length}`);
  return sorted.slice(0, termCount);
}

/**
 * Build the instalment schedule for one enrolment.
 * - Each billing term carries an equal share of the year's net price.
 * - Late joiners: terms that finished before the enrolment date are not charged (ASSUMPTION; set
 *   lateJoin to 'full_price' to spread the whole price over the remaining terms instead).
 * - An instalment whose bill date has passed is due today.
 */
export function buildSchedule(opts: {
  netPence: number; plan: Plan; terms: Term[]; enrolOn: string; lateJoin?: LateJoinPolicy;
}): ScheduledInstalment[] {
  const { netPence, plan, enrolOn } = opts;
  const lateJoin = opts.lateJoin ?? 'drop_finished_terms';
  const terms = billingTerms(opts.terms, plan.termCount);
  const shares = splitEvenly(netPence, terms.length);
  const remaining = terms.map((t, i) => ({ t, share: shares[i] })).filter(({ t }) => t.endsOn >= enrolOn);
  if (remaining.length === 0) return [];
  const amounts = lateJoin === 'full_price'
    ? splitEvenly(netPence, remaining.length)
    : remaining.map(r => r.share);
  return remaining.map(({ t }, i) => ({
    termId: t.id, termNumber: t.number,
    dueOn: t.billsOn < enrolOn ? enrolOn : t.billsOn,
    amountPence: amounts[i],
  }));
}

export type CartLine = { groupId: string; plan: Plan };
export type CheckoutQuote = {
  lines: Array<CartLine & { listPence: number; discountPence: number; netPence: number; schedule: ScheduledInstalment[] }>;
  bundlePercent: number;
  registrationFeePence: number;
  payTodayPence: number;
  laterPence: number;
};

/**
 * Quote a checkout for ONE student: bundle tier counts courses already held this year plus the cart.
 * Pay today = registration fee (once a year) + every instalment already due.
 * ASSUMPTION: the bundle discount does not go back and re-price courses bought earlier in the year.
 */
export function quoteCheckout(opts: {
  cart: CartLine[]; existingCourseCount: number; tiers: BundleTier[]; coupon?: Coupon;
  terms: Term[]; today: string; registrationFeePaid: boolean; lateJoin?: LateJoinPolicy;
}): CheckoutQuote {
  if (opts.cart.length === 0) throw new Error('cart is empty');
  const pct = bundlePercent(opts.existingCourseCount + opts.cart.length, opts.tiers);
  const lines = opts.cart.map(line => {
    const price = coursePrice(line.plan, pct, opts.coupon);
    const schedule = buildSchedule({ netPence: price.netPence, plan: line.plan, terms: opts.terms, enrolOn: opts.today, lateJoin: opts.lateJoin });
    return { ...line, ...price, schedule };
  });
  const registrationFeePence = opts.registrationFeePaid ? 0 : Math.max(...opts.cart.map(l => l.plan.registrationFeePence));
  const dueNow = lines.flatMap(l => l.schedule).filter(s => s.dueOn <= opts.today).reduce((a, s) => a + s.amountPence, 0);
  const later = lines.flatMap(l => l.schedule).filter(s => s.dueOn > opts.today).reduce((a, s) => a + s.amountPence, 0);
  return { lines, bundlePercent: pct, registrationFeePence, payTodayPence: registrationFeePence + dueNow, laterPence: later };
}

export type InstalmentState = { id: string; termNumber: number; dueOn: string; amountPence: number; status: 'scheduled' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'waived' | 'processing' | 'part_refunded' };

/** Cancelling a course stops every instalment not yet paid. Paid ones stay; refunds are a separate, deliberate admin action. */
export function cancelPlan(instalments: InstalmentState[]): Array<{ id: string; status: 'cancelled' }> {
  return instalments.filter(i => i.status === 'scheduled' || i.status === 'failed').map(i => ({ id: i.id, status: 'cancelled' as const }));
}

/**
 * Swapping to another class: paid instalments stay with the old enrolment; unpaid ones are re-issued
 * on the new class, re-priced if the new class's plan costs a different amount per instalment.
 */
export function swapPlan(old: InstalmentState[], oldPlanNet: number, newPlanNet: number, termCount: number): {
  cancel: string[]; reissue: Array<{ termNumber: number; dueOn: string; amountPence: number }>;
} {
  const open = old.filter(i => i.status === 'scheduled' || i.status === 'failed').sort((a, b) => a.termNumber - b.termNumber);
  const newShares = splitEvenly(newPlanNet, termCount);
  const oldShares = splitEvenly(oldPlanNet, termCount);
  return {
    cancel: open.map(i => i.id),
    reissue: open.map(i => ({
      termNumber: i.termNumber, dueOn: i.dueOn,
      amountPence: i.amountPence === oldShares[i.termNumber - 1] ? newShares[i.termNumber - 1] : Math.round(i.amountPence * newPlanNet / Math.max(1, oldPlanNet)),
    })),
  };
}

/** Which scheduled instalments the nightly job should charge today. */
export function dueForCharging(instalments: InstalmentState[], today: string): InstalmentState[] {
  return instalments.filter(i => i.status === 'scheduled' && i.dueOn <= today);
}

/** Which parents to remind: charges falling exactly `reminderDays` from today. */
export function dueForReminder(instalments: InstalmentState[], today: string, reminderDays: number): InstalmentState[] {
  const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + reminderDays);
  const target = d.toISOString().slice(0, 10);
  return instalments.filter(i => i.status === 'scheduled' && i.dueOn === target);
}
