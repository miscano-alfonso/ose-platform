// OH-SO EdTech plans. Prices are suggestions (27 Oct 2026): change them here and every page follows.
export type Plan = { id: "solo" | "growth" | "school"; name: string; for: string; monthly: number; yearly: number; teachers: string; students: string; cta: string; highlight?: boolean; adds?: string; features: string[] };

export const TRIAL_DAYS = 30;
export const PLANS: Plan[] = [
  {
    id: "solo", name: "Solo", for: "One teacher running their own classes", monthly: 29, yearly: 290, teachers: "1 teacher", students: "Up to 60 students", cta: "Start a free trial",
    features: [
      "Your own website: course pages, timetable, term dates and prices",
      "Online booking and card payments, including instalments",
      "Group classes, 1:1 tutoring and one-off workshops",
      "Free taster lessons, waiting list and enquiries",
      "Parent accounts: bookings, payments and messages in one place",
      "Google Meet links, with attendance taken from Meet",
      "Automatic emails: lesson reminders, receipts and follow-ups",
      "Lesson recordings named, filed and posted to Google Classroom",
      "Your logo and colours on yourname.ohsoedtech.com",
    ],
  },
  {
    id: "growth", name: "Growth", for: "A small team of teachers under one name", monthly: 79, yearly: 790, teachers: "Up to 8 teachers", students: "Up to 250 students", cta: "Start a free trial", highlight: true, adds: "Everything in Solo, plus",
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
    id: "school", name: "School", for: "An online school with staff, payroll and marketing", monthly: 189, yearly: 1890, teachers: "Unlimited teachers and staff", students: "Unlimited students", cta: "Start a free trial", adds: "Everything in Growth, plus",
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
    ["Google Meet links and attendance from Meet", true, true, true],
    ["Lesson reminders and automatic emails", true, true, true],
    ["Recordings filed and posted to Google Classroom", true, true, true],
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
    ["Students", "Up to 60", "Up to 250", "Unlimited"],
    ["Staff roles and access", false, false, true],
    ["Data protection tools", "Basic", "Basic", "Full"],
    ["AI assistant in the dashboard", false, false, true],
    ["Several schools from one login", false, false, true],
    ["Support", "Email", "Priority email", "Guided set-up and priority"],
  ]],
];

export const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
