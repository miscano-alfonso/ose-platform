// 27 Nov: step-by-step guides shown with <GuideSlides /> (pictures in public/guides/<name>/, captions drawn on them).
const ALT = ["Writing reports: how it works", "Open Reports and press Write on a class", "Write and save drafts any time; Submit opens in the last week of term",
  "Choose Progress and Effort from 1 to 5", "Working and Predicted grades for GCSE final-year classes", "Write a comment with targets for each student",
  "Draft with AI writes a first draft to edit", "Press Save draft", "Submit once the end-of-term assessment is marked, or say why there isn't one",
  "In the last week of term, press Submit or Submit all", "The office approves and publishes; parents get a PDF by email"];
export const REPORT_SLIDES = ALT.map((alt, n) => ({ src: `/guides/reports/${String(n + 1).padStart(2, "0")}.jpg`, alt }));

const DRIVE_ALT = ["Your lesson slides on My day: connect a Google Drive folder for each class", "How it works: your folder, shared with the school, shows on My day",
  "In Google Drive, open one class's slides folder", "Share the folder with ose@ohsoed.co.uk as a Viewer", "Copy the folder's address from the browser",
  "In OH-SO ED, the cog next to Sign out, then Google Drive", "Paste the address in the class's box and press Save", "Name each file with its lesson number, e.g. Lesson 7",
  "My day shows Lesson slides for your next lesson", "No slides found? Use the pencil to paste a link for one lesson", "Students see the slides when your Classroom post goes out"];
export const DRIVE_SLIDES = DRIVE_ALT.map((alt, n) => ({ src: `/guides/drive/${String(n + 1).padStart(2, "0")}.jpg`, alt }));
