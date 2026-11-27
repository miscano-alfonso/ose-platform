// 27 Nov: step-by-step guides shown with <GuideSlides /> (pictures in public/guides/<name>/, captions drawn on them).
const ALT = ["Writing reports: how it works", "Open Reports and press Write on a class", "Write and save drafts any time; Submit opens in the last week of term",
  "Choose Progress and Effort from 1 to 5", "Working and Predicted grades for GCSE final-year classes", "Write a comment with targets for each student",
  "Draft with AI writes a first draft to edit", "Press Save draft", "Submit once the end-of-term assessment is marked, or say why there isn't one",
  "In the last week of term, press Submit or Submit all", "The office approves and publishes; parents get a PDF by email"];
export const REPORT_SLIDES = ALT.map((alt, n) => ({ src: `/guides/reports/${String(n + 1).padStart(2, "0")}.jpg`, alt }));
