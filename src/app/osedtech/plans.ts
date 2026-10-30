// OH-SO EdTech plans. Prices set by Alfonso (27 Oct 2026): change them here and every page follows.
export type Plan = { id: "solo" | "growth" | "school"; name: string; for: string; monthly: number; yearly: number; teachers: string; students: string; cta: string; highlight?: boolean; adds?: string; features: string[] };

export const TRIAL_DAYS = 30;
/** Each plan includes a number of students; above that, each extra student costs this much a month. */
export const EXTRA_STUDENT = 2;
export const PLANS: Plan[] = [
  {
    id: "solo", name: "Solo", for: "One teacher running their own classes", monthly: 49, yearly: 490, teachers: "1 teacher", students: "30 students included", cta: "Start a free trial",
    features: [
      "Your own website: course pages, timetable, term dates and prices",
      "Online booking and card payments, including instalments",
      "Group classes, 1:1 tutoring and one-off workshops",
      "Free taster lessons, waiting list and enquiries",
      "Parent accounts: bookings, payments and messages in one place",
      "Lesson links for Google Meet, Zoom, Teams or any video tool, with attendance taken for you",
      "Students invited to the right Google Classroom when they book",
      "Automatic emails: lesson reminders, receipts and follow-ups",
      "Lesson recordings named, filed and posted to Google Classroom, with a title card",
      "Your logo and colours on yourname.ohsoedtech.com",
    ],
  },
  {
    id: "growth", name: "Growth", for: "A small team of teachers under one name", monthly: 200, yearly: 2000, teachers: "Up to 8 teachers", students: "250 students included", cta: "Start a free trial", highlight: true, adds: "Everything in Solo, plus",
    features: [
      "A login for each teacher: their day, timetable, classes and messages",
      "Reports to families, with Google Classroom assessments checked",
      "Student accounts, class chats and reward points",
      "Newsletters, subscriber lists and email stats",
      "Social posts in your style, drafted and illustrated with Claude",
      "Posting and scheduling to Facebook and Instagram",
      "Your own web address, with no OH-SO EdTech name on show",
    ],
  },
  {
    id: "school", name: "School", for: "An online school with staff, payroll and marketing", monthly: 600, yearly: 6000, teachers: "Unlimited teachers and staff", students: "600 students included", cta: "Ask about School", adds: "Everything in Growth, plus",
    features: [
      "Payroll for teachers, worked out from the lessons they taught",
      "Staff roles and access: office, teachers and admins",
      "Jobs page and applications for hiring teachers",
      "Data protection tools: exports, deletions and retention",
      "An AI assistant across the dashboard",
      "More than one school from one login, plus a demo school for training",
      "Guided set-up, help moving your data across, and priority support",
    ],
  },
];

/** The comparison table on the pricing page: [feature, solo, growth, school]; true / false / text. */
export const COMPARE: [string, [string, boolean | string, boolean | string, boolean | string][]][] = [
  ["Your website and bookings", [
    ["Course pages, timetable, term dates and prices", true, true, true],
    ["Online booking and card payments (your own Stripe account)", true, true, true],
    ["Instalments, discounts and multi-course offers", true, true, true],
    ["Free taster lessons, waiting list and enquiries", true, true, true],
    ["Web address", "yourname.ohsoedtech.com", "Your own domain", "Your own domain"],
    ["“Powered by OH-SO EdTech” on your site", "Small mark", false, false],
  ]],
  ["Running lessons", [
    ["Group classes, 1:1 tutoring and workshops", true, true, true],
    ["Lesson links for Google Meet, Zoom or any video tool, with attendance", true, true, true],
    ["Students invited to their Google Classroom when they book", true, true, true],
    ["Lesson reminders and automatic emails", true, true, true],
    ["Recordings filed and posted to Google Classroom", true, true, true],
    ["Title cards on recordings", true, true, true],
    ["Teacher logins", "1", "Up to 8", "Unlimited"],
    ["Reports to families", false, true, true],
    ["Student accounts, class chats and reward points", false, true, true],
  ]],
  ["Families and money", [
    ["Parent accounts: bookings, payments, messages", true, true, true],
    ["Failed-payment follow-ups", true, true, true],
    ["Payroll for teachers", false, false, true],
  ]],
  ["Marketing", [
    ["Newsletters, subscribers and email stats", false, true, true],
    ["Social posts with Claude, Facebook and Instagram", false, true, true],
    ["Jobs page for hiring", false, false, true],
  ]],
  ["Running the business", [
    ["Students included", "30", "250", "600"],
    ["Each student over that", "£2 a month", "£2 a month", "£2 a month"],
    ["Staff roles and access", false, false, true],
    ["Data protection tools", "Basic", "Basic", "Full"],
    ["AI assistant in the dashboard", false, false, true],
    ["Several schools from one login", false, false, true],
    ["Support", "Email", "Priority email", "Guided set-up and priority"],
  ]],
];

export const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** "How we compare" on the pricing page: by kind of product, not by brand. "yes" / "some" / "no" or a short note. */
export const RIVALS = ["OH-SO EdTech", "Tutoring admin apps", "Online course platforms", "School management systems", "Spreadsheets and payment links"] as const;
export const VERSUS: [string, ...string[]][] = [
  ["Your own website, with live timetable and prices", "yes", "some", "yes", "no", "no"],
  ["Online booking and card payments", "yes", "yes", "yes", "some", "some"],
  ["Instalments and failed-payment follow-ups", "yes", "some", "some", "some", "no"],
  ["Weekly classes across terms and holidays", "yes", "some", "no", "yes", "no"],
  ["Attendance taken from Google Meet", "yes", "no", "no", "no", "no"],
  ["Recordings posted to Google Classroom, with title cards", "yes", "no", "no", "no", "no"],
  ["Parent and student accounts", "yes", "yes", "some", "yes", "no"],
  ["Reports to families", "yes", "some", "no", "yes", "no"],
  ["Teacher payroll from lessons taught", "School plan", "some", "no", "some", "no"],
  ["Newsletters and social posts, drafted with Claude", "Growth and School", "some", "some", "no", "no"],
  ["Your brand on your own web address", "Growth and School", "often extra", "yes", "no", "no"],
  ["No cut of your fees", "yes", "some take a %", "some take a %", "yes", "yes"],
  ["Typical cost", "£49–£600 a month", "£15–£200 a month, often plus per-lesson or % fees", "£30–£200 a month", "often charged per student", "free, but costs you time"],
];

/** Named competitors, feature by feature (their own pricing/feature pages and GetApp/Capterra listings, checked 27 Oct 2026; US prices).
 *  "yes" / "no" (not listed) / "partly", or a short note. Keep this up to date or remove it. */
export const NAMED_COLS = ["OH-SO EdTech", "TutorBird", "Teachworks", "TutorCruncher", "Teachable", "Kajabi", "Classe365"] as const;
export const NAMED_ROWS: [string, ...string[]][] = [
  ["Mainly for", "Running a live online school", "Scheduling and invoicing for tutors", "Tutoring business admin", "Tutoring agency admin", "Selling recorded courses", "Courses, memberships and marketing", "School management"],
  ["Your own website with live timetable and prices", "yes", "partly", "partly", "partly", "partly", "partly", "no"],
  ["Online booking and card payments", "yes", "yes", "yes", "yes", "yes", "yes", "yes"],
  ["Instalments and payment plans", "yes", "no", "no", "Top plan", "yes", "yes", "no"],
  ["Weekly classes across terms and holidays", "yes", "partly", "partly", "partly", "no", "no", "partly"],
  ["Live video lessons", "Meet, Zoom, Teams or any link", "Zoom link", "Zoom or Meet links", "Own video, extra cost", "no", "partly", "Built-in video"],
  ["Students invited to their Google Classroom on booking", "yes", "no", "no", "no", "no", "no", "no"],
  ["Attendance", "Automatic, from Meet or Zoom", "yes", "partly", "partly", "no", "no", "yes"],
  ["Recordings filed and posted to Google Classroom, with title cards", "yes", "no", "no", "no", "no", "no", "no"],
  ["Parent accounts", "yes", "yes", "partly", "yes", "no", "no", "yes"],
  ["Student accounts, class chats and rewards", "Growth and School", "partly", "partly", "partly", "partly", "partly", "yes"],
  ["Reports to families", "Growth and School", "yes", "no", "yes", "no", "no", "yes"],
  ["Teacher payroll", "School", "partly", "yes", "yes", "no", "no", "no"],
  ["Newsletters and email stats", "Growth and School", "no", "Via Mailchimp", "partly", "partly", "yes", "partly"],
  ["Social posts drafted and illustrated with Claude", "Growth and School", "no", "no", "no", "no", "no", "no"],
  ["Your brand on your own web address", "Growth and School", "partly", "partly", "+$100 a month", "yes", "yes", "no"],
  ["No cut of your fees", "yes", "yes", "yes", "3.5–3.85% of card payments", "Up to 7.5% on lower plans", "yes", "yes"],
  ["Starts at", "£49 a month", "$16.95 a month, +$4.95 per tutor", "$16.49 a month, plus per-lesson fees", "$30 a month, plus % fees", "$39 a month", "$179 a month", "Priced per student"],
];
