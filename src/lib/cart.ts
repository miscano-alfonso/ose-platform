import "server-only";
import { cookies } from "next/headers";
import { withSchool } from "./db";
import { bundlePercent, percentOf, type BundleTier } from "@/billing/schedule";

// The website basket (31 Oct): the chosen classes' codes in a cookie, priced on the server each time from the live price plans,
// so the figures are always today's. Rules as on ohsoed.co.uk: bundle discount by how many courses are in the basket
// (Admin → Rules), a registration fee per course, and the option to spread each course over its terms.
export const CART_COOKIE = "ose_cart", COUPON_COOKIE = "ose_coupon", START_COOKIE = "ose_start";
import { startOptions, type StartKey, type StartOption } from "./start-terms";

/** Each course's chosen start ("this" or "next" term), keyed by class code. */
export async function cartStarts(): Promise<Record<string, StartKey>> {
  try { const v = JSON.parse((await cookies()).get(START_COOKIE)?.value ?? "{}"); const o: Record<string, StartKey> = {};
    for (const [k, x] of Object.entries(v)) if (/^[\w/-]{1,40}$/.test(k) && (x === "this" || x === "next")) o[k] = x; return o; } catch { return {}; }
}
const MAX = 12;

export async function cartCodes(): Promise<string[]> {
  const raw = (await cookies()).get(CART_COOKIE)?.value ?? "";
  return [...new Set(raw.split(".").map((c) => c.trim()).filter((c) => /^[\w/-]{1,40}$/.test(c)))].slice(0, MAX);
}
export const cartValue = (codes: string[]) => [...new Set(codes)].slice(0, MAX).join(".");

export type CartLine = { code: string; level: string; subject: string; colour: string; years: number; slots: { d: number; t: string }[] | null;
  listPence: number; discountPence: number; netPence: number; feePence: number; terms: number; perTermPence: number; page_slug: string; year_label: string;
  start: StartOption | null; starts: StartOption[]; fullPence: number };   // start null: can't be joined now (e.g. a GCSE after its first terms)
export type CartQuote = { lines: CartLine[]; subtotalPence: number; bundlePct: number; bundlePence: number; coupon: { code: string; pence: number; label: string } | null;
  totalPence: number; feesPence: number; payPence: number; perTermPence: number; terms: number };

export async function cartQuote(): Promise<CartQuote> {
  const codes = await cartCodes();
  const couponCode = ((await cookies()).get(COUPON_COOKIE)?.value ?? "").slice(0, 40);
  const chosen = await cartStarts();
  return withSchool(async (q) => {
    const rows = codes.length ? await q<{ id: string; code: string; level: string; subject: string; colour: string; years: number; year_of_course: number; total: number; fee: number; terms: number; total_terms: number; first_year: number;
      year_id: string; level_id: string; slots: { d: number; t: string }[] | null; page_slug: string; year_label: string }>(`
      select g.id, g.code, l.name as level, sj.name as subject, coalesce(sj.colour, '#8494c2') as colour, pp.course_years as years, pp.year_of_course,
             (select total_pence from course_price(pp.id)) as total, (select terms from course_price(pp.id)) as total_terms, pp.registration_fee_pence as fee, pp.term_count as terms, pp.total_pence as first_year,
             g.academic_year_id as year_id, g.level_id, y.label as year_label,
             lower(regexp_replace(l.name, '[^A-Za-z0-9]+', '-', 'g')) || '/' || lower(regexp_replace(sj.name, '[^A-Za-z0-9]+', '-', 'g')) as page_slug,
             (select json_agg(json_build_object('d', s.weekday, 't', to_char(s.starts_at, 'HH24:MI')) order by s.weekday, s.starts_at) from lesson_slots s where s.group_id = g.id) as slots
      from course_group_availability a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      join price_plans pp on pp.id = g.price_plan_id join academic_years y on y.id = g.academic_year_id
      where g.code = any($1) and a.on_sale and a.bookable and a.status not in ('hidden', 'closed')
      order by l.sort_order, sj.name`, [codes]) : [];
    // bundle tiers for the year of the first course (all levels, or that course's level)
    const tiers = rows.length ? await q<{ min_courses: number; percent_off: string; level_id: string | null }>(
      `select min_courses, percent_off::text, level_id from bundle_discounts where academic_year_id = $1`, [rows[0].year_id]) : [];
    // 24 Nov: priced from the chosen start term (This term / Next term), from the lessons still to come
    const starts = await startOptions(q, rows.map((r) => ({ id: r.id, level: r.level, courseYears: r.years, yearOfCourse: r.year_of_course, firstYearPence: r.first_year,
      laterPence: Math.max(0, r.total - r.first_year), yearTerms: r.terms, laterTerms: Math.max(0, (r.total_terms ?? r.terms) - r.terms) })));
    const lines: CartLine[] = rows.map((r) => {
      const t: BundleTier[] = tiers.filter((x) => !x.level_id || x.level_id === r.level_id).map((x) => ({ minCourses: x.min_courses, percentOff: Number(x.percent_off) }));
      const opts = starts.get(r.id) ?? [], start = opts.find((o) => o.key === chosen[r.code]) ?? opts[0] ?? null;
      const price = start ? start.pence : 0, terms = start ? start.terms : r.terms;
      const joinable = rows.filter((x) => (starts.get(x.id) ?? []).length).length;   // courses that can't be joined now don't count towards the bundle
      const pct = bundlePercent(joinable, t), disc = percentOf(price, pct), net = price - disc;
      return { code: r.code, level: r.level, subject: r.subject, colour: r.colour, years: r.years, slots: r.slots, page_slug: r.page_slug, year_label: r.year_label,
        listPence: price, discountPence: disc, netPence: net, feePence: start ? r.fee : 0, terms, perTermPence: Math.round(net / Math.max(1, terms)),
        start, starts: opts, fullPence: r.total };
    });
    const subtotal = lines.reduce((a, l) => a + l.listPence, 0), bundle = lines.reduce((a, l) => a + l.discountPence, 0);
    const bundlePct = subtotal ? Math.round((bundle / subtotal) * 100) : 0;
    let coupon: CartQuote["coupon"] = null;
    if (couponCode && lines.length) {
      const c = (await q<{ code: string; percent_off: string | null; amount_off_pence: number | null }>(`
        select code::text, percent_off::text, amount_off_pence from coupons where code = $1 and active
          and (valid_from is null or valid_from <= current_date) and (valid_to is null or valid_to >= current_date)`, [couponCode]))[0];
      if (c) {
        const after = subtotal - bundle;
        const pence = c.percent_off ? percentOf(after, Number(c.percent_off)) : Math.min(after, c.amount_off_pence ?? 0);
        coupon = { code: c.code, pence, label: c.percent_off ? `${Number(c.percent_off)}%` : "" };
      }
    }
    const total = Math.max(0, subtotal - bundle - (coupon?.pence ?? 0));
    const fees = lines.reduce((a, l) => a + l.feePence, 0);
    const terms = lines.reduce((a, l) => Math.max(a, l.terms), 0);
    const perTerm = lines.reduce((a, l) => a + l.perTermPence, 0) - (coupon && terms ? Math.round(coupon.pence / terms) : 0);
    return { lines, subtotalPence: subtotal, bundlePct, bundlePence: bundle, coupon, totalPence: total, feesPence: fees, payPence: total + fees, perTermPence: Math.max(0, perTerm), terms };
  });
}

export async function bundleTiersNow(): Promise<{ min: number; pct: number }[]> {
  return withSchool((q) => q<{ min: number; pct: number }>(`
    select distinct b.min_courses as min, b.percent_off::float as pct from bundle_discounts b join academic_years y on y.id = b.academic_year_id
    where b.level_id is null and current_date between y.starts_on - 200 and y.ends_on order by 1`)).catch(() => []);
}
