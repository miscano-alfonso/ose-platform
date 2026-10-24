# OH-SO platform

A new website, admin and database for OH-SO ED, built so that other schools can run on it too (OH-SO EdTech).

Stack: Next.js (website, admin and API), Postgres, Stripe. Every school's data is separated inside the database by row-level security.

## Status: milestone 1, foundations

| Part | State |
| --- | --- |
| Database schema (multi-school, timetable with clash checks, teacher payroll, termly reports), `db/001_schema.sql` | Done and tested |
| School isolation (row-level security), `db/002_rls.sql` | Done and tested |
| Seed data (real catalogue, fictional families), `db/003_seed.sql` | Done |
| Termly billing rules, `src/billing/schedule.ts` | Done and tested (14 tests) |
| Next.js app: storefront, admin, Stripe checkout | **Blocked.** The build workspace can't reach npm or the Stripe API (organisation network policy) |

## Run the checks

```bash
# database (needs Postgres 16)
createdb ose_test
for f in db/001_schema.sql db/002_rls.sql db/003_seed.sql db/test_db.sql; do psql -d ose_test -v ON_ERROR_STOP=1 -f $f; done

# billing rules (needs Node 22+)
node --experimental-strip-types --test src/billing/schedule.test.ts
```

## The website (milestone 2, first part)

A Next.js app at the repository root: homepage (with "Last few places"), Courses (year and level tabs, sticky labels, waiting list when full), Term dates, Timetable and Teachers. All data comes from the database; booking and payments come next.

- `npm run build` applies any new files in `db/` (`scripts/migrate.mjs`, recorded in `_migrations`), then builds. **Never edit an applied db file: add `004_….sql` and so on.** New tables must enable row-level security.
- The app connects as the database owner, then inside every request runs `SET LOCAL ROLE app_user` and sets `app.school_id`, so row-level security limits every query to one school.
- While `SITE_PASSWORD` is set, every page asks for that password and nothing is indexed by search engines.

### Environment variables (set in Vercel, never in the code)

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection string (pooled), London region |
| `SITE_PASSWORD` | Password for the private preview; remove at launch |
| `SCHOOL_SLUG` | `ohsoed` |

### Deploying to ose.miscano.co.uk

1. Publish this folder to the private GitHub repository `ose-platform` (GitHub Desktop).
2. Vercel → Add New → Project → import `ose-platform`. Framework: Next.js. Add the environment variables above. Settings → Functions → region London (lhr1).
3. Vercel → Settings → Domains → add `ose.miscano.co.uk`; add the CNAME it shows in IONOS (DNS for miscano.co.uk, host `ose`). Change no other records.

The seed (`003_seed.sql`) holds the real 2026-27 catalogue, timetable and term dates with **fictional** families, so the preview never contains real family data.

## Class capacity, waiting lists and sticky labels

- Each class (`course_groups`) has a group code (e.g. `KEng26/1`, a second group `KEng26/2`), a capacity and a status.
- A class takes bookings until it is full. A full class shows no days or times on the website and offers the waiting list instead (`course_group_availability.shows_times`, `shows_waitlist`). Bookings into a full class are refused by the database.
- Admin overrides (`capacity_mode`): `auto` (close at capacity), `keep_open` (take bookings past capacity), `full` (close early).
- When a place comes up in a full class, the first family on its waiting list is invited automatically (first come, first served).
- Sticky labels (`sticky_label`): `auto` picks one from places left: "Few spaces left" (5 or fewer, `schools.few_places_at`), "Almost full" (2 or fewer, `schools.almost_full_at`), "New Group!" (no students yet), "New Group Launching Soon!" (collecting sign-ups). Admins can choose any label or switch it off.
- The website shows one card per group, so a subject can offer several days and times.

## Next year on sale from March

- Each academic year has `sales_open_on` (default 1 March before it starts). From that date the website shows its term dates and sells its courses (`website_years`); before it, its classes can be prepared but not booked.
- `prepare_next_year(this_year, '2027/28', starts, ends)` copies price plans, classes and weekly lesson times into the new year with fresh codes (KEng26/1 → KEng27/1), no students and no Google Classroom yet. Year 1 of a 2-year course also gets its linked year-2 class, which isn't sold on the website. Term dates are entered separately.

## How the data fits together

- **schools** own everything. Users, parents, students, classes, prices and payments all carry `school_id`.
- **academic_years** have up to 6 **terms**. Each term has a `bills_on` date, which is when its instalment is charged.
- **course_groups** are the classes: one subject at one level, a main teacher, a price plan, and an open / waiting-list / closed status. Their weekly lessons are in **lesson_slots** (see below).
- **orders** are checkouts. An order creates **enrolments**, one per student per class, and each enrolment gets its **instalments**, one per billed term.
- **ledger_entries** record every charge and refund, mirrored from Stripe. The table is append-only, and each Stripe object can be recorded only once, so a repeated webhook can't double-count.
- **bundle_discounts** (3 courses = 10%, 5 = 15%), **coupons**, **registration_fees** (once per student per year), **waitlist_entries** and **enquiries** cover the rest of the current admin's core.

## Courses and timetable

How courses run (confirmed by OH-SO ED):

| Course | Lessons a week | Terms |
| --- | --- | --- |
| KS3 | 1 | 6 |
| Pre-GCSE core subjects (English, Maths, Science) | 2 | 6 |
| GCSE 1-year (English, Literature, single sciences) | 3 | 5 |
| GCSE 2-year, year 1 | 2 | 6 |
| GCSE 2-year, year 2 | 2 | 5 |

- **price_plans** hold one row per course year: lessons a week, the number of terms it runs, lessons charged and cost per lesson. A 2-year GCSE has two plans, and each year is enrolled and billed on its own.
- **lesson_slots** hold every weekly lesson a class has, placed by an admin. The database **refuses** any lesson that double-books a teacher.
- Enrolling a student into a class that **overlaps their other classes** is refused unless an admin ticks `allow_clash`.
- The `level_clashes` view lists classes at the same level that run at the same time, so admins can see them as warnings.

## Waiting lists, course pages and assignments

- **Waiting list.** A course on the waiting list shows no days or times on the website. When the **5th** family joins (`waitlist_threshold`), a trigger moves the course to `priority`, stamps every family on the list as invited (the email job sends to these), and starts a **48-hour** window (`priority_hours`). During the window only invited families can book (`can_book`). `open_expired_priority()` then opens the course to everyone.
- **Course pages.** `course_pages` holds each course's intro and topics, at a slug like `pre-gcse/science`. Days, times, lesson length, lessons a week and price come from the class and its price plan. Every course page uses the same layout in the page editor.
- **Sample lessons and teacher photos.** Each course page can show a recorded sample lesson (`course_pages.sample_video_url`, a Google Drive link shared as "anyone with the link", embedded on the page; until one is chosen the page says it's coming soon). Teachers have a photo (`teachers.photo_asset`) shown on their course and workshop pages.
- **Assignments.** `classroom_coursework` and `classroom_submissions` are synced from Google Classroom. The `student_assignments` view gives parents **due**, **overdue** and **submitted** lists. Reports use the marks on returned work.
- **Lesson length** is set per class (`lesson_minutes`). Pre-GCSE lessons are 45 minutes, as on the live site. Other levels default to 60 until confirmed.

## Google Classroom and email links

- After booking, the student is invited to the class's Google Classroom (`classroom_memberships`, state `invited`). They become a member (`joined`) only when they accept the invitation, and only members can join the lesson's Google Meet.
- `lesson_reminder_recipients(lesson)` sends members the "join your lesson" reminder. Students who haven't accepted get a version asking them to accept the invitation first. A separate reminder goes out if an invitation is still not accepted after 2 days, and again the day before the first lesson.
- **One welcome email per student, listing every class.** `student_pending_invitations(student, unsent_only)` returns one row per class still to accept. The welcome email uses the unsent ones (then sets `emailed_at`), so booking three courses sends one email with three "👉 <course name>" lines. The reminder email lists only the classes not yet accepted. Emails go to the student only; parents are not copied.
- Emails never show web addresses. Links appear as text with a pointing emoji, for example "👉 Join your lesson" and "👉 Accept your Google Classroom invitation".
- **Parents have no Classroom or Meet access.** The Parent dashboard shows assignments, marks and invitation status, with no links into Classroom.

## Termly reports

These match today's report template, one line per subject:

- **Progress, 1–5.** The average of the term's marked Google Classroom work (returned `classroom_submissions`), placed in a band by the grading key (`grade_bands`): 5 Exceeding 95–100%, 4 Secure 70–94%, 3 Meeting 50–69%, 2 Working Towards 40–49%, 1 Improvement Needed 0–39%. The teacher can override it.
- **Effort, 1–5.** Set by the teacher.
- **Working and Predicted grades, 9–1.** GCSE courses only; the database refuses them on other courses.
- **Targets.** The teacher's comment, written per child on the Teacher dashboard.

A **report_cycle** (for example "Term 1 Progress Report") has a marks window, a date comments are due and a publish date. Each line goes from not started, to draft, to submitted. An admin then approves it or sends it back with a note. A line can't be submitted without an effort score and a real comment. Published reports appear on the Parent dashboard, and the "Progress report ready" email goes out. The `report_lines` view works out the marks average and the Progress score.

## Messages between parents and teachers

- Parents message their children's teachers from the dashboard (`message_threads`, `messages`). A conversation is about one child, and the database only allows teachers who teach that child.
- Teachers see their own conversations and can **pass one to the office**; admins can read and reply to every conversation (safeguarding) and see who's been waiting more than 2 days. Either side can be closed by a teacher or admin.
- The email notification says there's a new message and links to the dashboard; it never contains the message itself.

## AI assistant (admin panel and website editor)

- **Admin assistant:** answers questions from the school's real data through read-only tools (overview, families, attendance, failed payments, classes, tasters and enquiries, free 1:1 times, payroll, report progress). It can only **propose** changes (an email, a draft workshop, a class status, a coupon, resending Classroom invitations); each appears as a card an admin must approve. Only admins see it.
- **Website assistant:** reads the pages and edits the **draft** (text, FAQs, new blocks, order, Google titles and descriptions, course page topics, brand). Nothing is live until someone publishes, and each run can be undone in one click. Prices, times and course data still come from the admin and can't be changed by it.
- In the prototypes it uses Claude on the viewer's own claude.ai account. In the real build it calls the Claude API from the server with the same tools, under the signed-in admin's school and permissions (row-level security), and every tool call is written to `audit_log`.

## Sign-up

- **Create your account → verify email → your family.** Parents give their name, email, mobile and a password (at least 10 characters) and agree to the T&Cs and Privacy Policy. They then verify their email with a 6-digit code or the button in the email (`email_verifications`: only a hash of the code is stored; 30 minutes; 5 attempts; resend after 60 seconds). **An order can't be paid until the email is verified.**
- Then they add **one or more children** (name, date of birth → age and school year, the child's Google account for Classroom) and, optionally, a **second parent/guardian** (see below).
- **SEND** (special educational needs and disabilities): for each child, No / Yes / Prefer to discuss; with Yes, details, what helps in lessons, whether they have an EHCP, and whether to share it with their teachers (`student_support`). It's special-category data: admins see it; a teacher sees it only for their own students and only if the parent agreed (`teacher_student_support(teacher)`).

## Parent details and a second parent/guardian

- Parents manage their details on the dashboard's **My details** page: name, email, mobile, billing address and their own marketing choice.
- They can add **one more parent or guardian** (`guardians`) with no sign-in of their own, and choose whether that person also gets **invoices, receipts and payment reminders** (`invoice_recipients(parent)`) and termly reports.
- **Marketing consent is per person.** The second guardian's box only counts once they confirm it from their own email (`marketing_confirmed_at`); `marketing_audience` lists only people who have consented.

## Attendance and reported absences

- `attendance_marks` holds one mark per student per lesson: present, late, absent or **approved absence**, taken from Google Meet (teachers or admins can correct it).
- Parents can **report an absence in advance** from the Parent dashboard for any upcoming lesson (`absence_notices`: reason and an optional note). It's approved straight away and the teacher is told. When the register is taken, an absence with a notice is recorded as an **approved absence**.
- `student_term_attendance` gives attended, late, approved and unexplained absences, and the attendance percentage with approved absences left out. Reports show approved and unexplained absences; the weekly low-attendance alert ignores approved absences.
- **To confirm:** whether some reasons (e.g. holidays in term time) should need the office's approval instead of being approved automatically, and how far ahead / how late parents can report.

## Taster lessons

- The website's **taster page** works like today's: choose a level and subject, and it lists that class's **upcoming lessons from the timetable** (`taster_lessons(class)`), with places left. The parent can pick **several lessons** (different subjects) and then fills in one form (`taster_requests`): the child's name, their own name and email, the child's email for the Google Meet invitations, and a message; each lesson is a `taster_bookings` row.
- The child joins that real lesson free. Places per lesson are capped (`schools.taster_places_per_lesson`, default 2), and a child can try each class once. Classes on the waiting list have no lessons to try, so the page offers the waiting list instead.
- Admins see every taster (`taster_list`) on the **Tasters & enquiries** page and the dashboard (attended, didn't join, booked a course); the teacher sees tasters on their day; a follow-up email goes the day after.
- **To confirm:** whether tasters are always free, and how many per lesson.

## 1:1 tutoring and workshops

- **1:1 tutoring.** Anyone can book a 1:1 with a teacher by level and subject (`teacher_subjects`), for 45 minutes. Families with a child on a course book from the Parent dashboard and pay the **enrolled** rate; everyone else books on the website at the **public** rate (`tutoring_rates`, by level, length and audience, with the teacher's pay per session). The rate is taken from the table by a trigger when the booking is made, so the website can't send a different price.
- **Availability.** Teachers set weekly 1:1 hours (`tutoring_availability`). `tutoring_open_times(level, subject, from, days, minutes)` lists bookable start times every 30 minutes, 24 hours ahead, that don't clash with the teacher's lessons, workshops or other 1:1s (`teacher_busy`). The database also refuses an overlapping booking for the same teacher. Unpaid bookings hold the slot for 15 minutes.
- **Workshops** (`workshops`, `workshop_bookings`) are one-off lessons with their own page (`slug`). Price 0 = free; an optional lower price for enrolled families (`enrolled_price_pence`). Places are capped, a child can only be booked once, and a workshop can't be put at a time its teacher is teaching. Free places are booked at once; paid ones wait for payment.
- **Payroll.** 1:1s taught (and no-shows) and finished workshops go into the pay run as `extras` (`teacher_term_extras`). Anything in half term or the holidays is paid with the term that ends next.
- **Payments** for both are one-off card payments; `ledger_entries` now links to the 1:1 or workshop booking.
- **To confirm:** the 1:1 rates and teacher pay (examples only), notice and cancellation rules, whether 1:1s run in school holidays, whether a no-show is paid, and whether enrolled families get a lower workshop price.

## Terms & Conditions, notice and cancelling

- **Agreement at checkout.** After "Pay now" the parent sees an agreement page: the key points of the T&Cs, the notice each course in the cart needs, and two boxes to tick (agree to the T&Cs; understand the notice period). The acceptance is saved in `terms_acceptances` with the T&Cs version (`terms_documents`), time, IP and browser. **An order can't be marked paid without it.**
- **Notice** is set per level (`levels.notice_terms`): KS3 and Pre-GCSE 1 full term, GCSE 2 (T&Cs clause 5). It's copied onto each enrolment when the order is paid, so later changes never alter what a family agreed to.
- **`cancel_enrolment(enrolment, date)`**: the next N full terms starting after the cancellation date are still charged, and every later instalment is cancelled. The course carries on until the end of the last charged term; `close_finished_notice()` then closes it. Within 14 days of the first lesson, before the student has joined the Classroom, the cooling-off rule refunds everything instead.
- **To confirm:** the live T&Cs mention only KS3 (1 term) and GCSE (2 terms). Pre-GCSE is set to 1 term here, as agreed, so clause 5 should add Pre-GCSE. Also confirm what "full term" means when a parent cancels during a holiday, and whether admins can waive notice (the admin prototype allows it).

## Parent-to-parent contact

- Parents of children in the **same class** can ask to swap contact details (`contact_requests`). OH-SO ED emails the other parent, who sees only the requester's first name, their child's first name and the class. **Nothing is shared until they accept;** then `shared_contacts(parent)` shows each of them the other's **name and email only**. Phone numbers (including children's) are exchanged by the parents themselves, outside the platform.
- Parents must **opt in** to receive requests (`parents.accepts_contact_requests`). They can decline (the sender isn't told), decline and block (`parent_blocks`), or stop sharing later. A declined request can't be repeated for 90 days; one open request per pair; up to 5 requests a day; requests expire after 14 days.
- Admins can see every request and stop any sharing for safeguarding reasons.

## Teacher payroll

- Teachers are paid **per lesson taught**: KS3 £40, Pre-GCSE £45 and GCSE £50 (`pay_rates`, one rate per level). A teacher can be given their own rate.
- **lesson_events** has one row per lesson on a real date. It's generated from the timetable for each term, skipping holidays (`generate_lesson_events`). Each row records who actually taught the lesson, so pay follows the cover teacher, and cancelled lessons aren't paid. Attendance registers use the same rows.
- **Pay day** is the Friday after the last day of term (`term_pay_date`). For Term 1, ending Fri 23 Oct 2026, that's Fri 30 Oct.
- `build_pay_run(term)` totals each teacher's lessons into a draft **pay run**. Once approved, a run is locked and can't be rebuilt. The figures are gross pay; tax, National Insurance and pension stay with the payroll provider.
- **To confirm:** Term 2 pay day falls on Christmas Day 2026. Should the rule be "the working day before" whenever pay day is a bank holiday?

## Billing rules

1. A course year's price is split equally across the terms it runs, with one payment per term: 6 for KS3 and Pre-GCSE, 5 for a 1-year GCSE. Leftover pennies go on the earliest payments.
2. Bundle discounts count every course the student takes that year. **Assumption:** courses bought earlier aren't re-priced when a later course triggers the discount.
3. Coupons apply after the bundle discount.
4. **Assumption, for late joiners:** terms that have already finished aren't charged, and the current term is due immediately.
5. **Assumption:** the registration fee is charged once per student per academic year.
6. Cancelling stops all unpaid payments. Refunds are a separate admin action.
7. Swapping class keeps paid terms, and re-prices the unpaid ones if the new course costs more or less.

Pre-GCSE core is £816 (confirmed from the live site). **To confirm:** how the 128 lessons of a 2-year GCSE split between its two years (assumed 68 + 60).

## Next steps

1. Open network access to `registry.npmjs.org` and `*.stripe.com` for this workspace, or build on a linked computer.
2. Scaffold the Next.js app on top of this schema: sign-in, the admin (Groups, Parents, Students, Finance, Terms) and the storefront with cart and Stripe Checkout in test mode.
3. Add Stripe webhooks, the nightly charging job and reminder emails.
4. Write the data-migration script from TechSaga's database export.

## Messaging extras, student chat and rewards (Oct 2026)
- **Teacher-started conversations:** `message_threads.started_by` ('parent' | 'teacher'). The same guard applies: the teacher must teach the student.
- **Attachments:** `message_attachments` accepts PDF, PNG/JPEG/GIF/WebP and Word files, up to 10 MB each and 5 per message. The files themselves live in object storage.
- **Student chat:**
  - `student_chats` holds one class chat per course group, plus private chats.
  - `start_direct_chat(a, b)` opens a private chat, only between students who share an active class.
  - Messages are checked against `chat_blocked_words`.
  - A private chat becomes read-only once the two students no longer share a class.
  - Staff can hide a message (`hidden_at`); students then see "Message removed by staff" via `student_chat_feed`.
  - Students report messages with `student_chat_reports`.
- **Rewards:**
  - `reward_points` records points (1–10 per award). Teachers can only give points to students in their own classes.
  - `term_leaderboard(term)` gives the whole-school ranking, with ties sharing a rank.
  - `reward_prizes` holds the prizes for 1st, 2nd and 3rd.
  - `confirm_reward_winners(term)` writes `reward_winners` after the term ends, and refuses if there's a tie for a prize place.

## Attendance from Google Meet (no registers)
- Nobody takes a register.
- **Where the data comes from:** every join and leave in a lesson's Meet is stored in `meet_sessions`.
  - Today it comes from AttendList's API.
  - After launch it will come straight from the Google Meet REST API (`conferenceRecords.participants.participantSessions`), and `attendance_settings.source` switches to `meet_api`.
- **How marks are worked out:** `compute_attendance(lesson_event)` measures each mark against the **timetabled** start and end, not when the teacher opened the Meet. The grace periods are set per school (5 minutes by default):
  - **Late:** joined more than the grace period after the start.
  - **Left early:** left more than the grace period before the end.
  - **Absent:** in the Meet for less than the minimum minutes.
  - **Dropped connections:** a missing leave time counts as the lesson end.
- **Corrections:** office corrections (`source = 'admin'`, with a note, e.g. "joined signed out") and approved absences are never overwritten by a later sync.
- `student_term_attendance` now also counts left-early lessons.

## Swapping a course
- Parents use `swap_course(enrolment, new_group, 'current' | 'next')` from their dashboard, and admins use the same function.
- **Which classes can be swapped into:** only ones that are open, have space and don't clash with the child's other classes. The class being left doesn't count as a clash.
- **Swap this term** (not offered in the last week of term): the child moves now and this term is re-priced at the new course's rate. If the term was already paid, the difference is charged now (a dearer course) or refunded to the card (a cheaper course). Each charge or refund is recorded in `swap_adjustments` for the Stripe job, and earlier swaps in the same term are taken into account.
- **Swap from next term:** nothing to pay now. The old class runs to the end of the current term (`last_billed_term_id`), and the new enrolment `starts_on` the first day of the next term.
- **Later terms** are charged at the new course's price, with the same bundle discount as before.

## Data protection (UK GDPR, DPA 2018, Children's Code)
- **Consent:** `consent_events` keeps every consent given or withdrawn, with the notice version. `current_consents` shows the latest choice for each purpose.
- **Rights requests:** `privacy_requests` covers access, erasure, rectification, restriction, objection and portability. Each request is due one calendar month after it arrives.
- **SEND details:** `read_student_support(student, viewer)` is the only way to read them. It lets in admins, and teachers who teach the child when the parent allowed sharing. Every read is logged in `sensitive_access_log`, which also logs family exports.
- **Family data:**
  - `export_family_data(parent)` returns everything held about the family as JSON.
  - `erase_family(parent)` removes or anonymises the family's data. It is refused while a course is active or money is owed. Payment rows are kept without names for six years (HMRC).
- **Retention:** `retention_policies` holds the schedule, `default_retention(school)` sets it up and `run_retention(school)` runs it nightly.
- **Incidents and suppliers:**
  - `data_breaches` is the breach log. A risky breach can't be closed without the time it was reported to the ICO.
  - `processors` lists the suppliers that process personal data, with their agreements and transfer safeguards.
- **Children's Code:** `students.leaderboard_name` defaults to `first_initial` (first name and initial), and parents can change it to `hidden`.
- **Opt-ins for contact (off by default):**
  - **Student chat:** `students.chat_access` is `none` until a parent changes it with `set_chat_access()`, to `class` or `class_and_private`. Private chats need both children's parents to allow them, and the database refuses messages otherwise.
  - **Parent-to-parent contact:** `parents.accepts_contact_requests` defaults to false.
  - **Consent log:** both choices are recorded in `consent_events`.
- **Each child's own Google account:** Classroom and Meet invitations go to `students.email`. The database refuses an address that is:
  - a parent's or second guardian's email
  - already used by another child
  - not Gmail, unless the parent has confirmed it is a Google account (`google_account_confirmed`)

  A booking can't be paid until every child on it has an account.
