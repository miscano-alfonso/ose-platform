// The modules each customisable dashboard can show (shared by the pages and the save action).
export const BOARD_MODULES: Record<string, string[]> = {
  "teacher-home": ["hero", "reports-pop", "k-attendance", "k-reports", "k-ones", "k-pay", "week", "reports", "messages", "email", "chats", "rewards", "stream"],
  "parent-home": ["hero", "payment", "children", "work", "reports", "coming", "messages"],
  "student-home": ["hero", "points", "classes", "chat"],
  // the Solo plan: admin and teacher in one (arranged in OH-SO ED under Settings → Solo dashboard)
  "solo-home": ["hero", "overview", "k-students", "k-places", "k-attendance", "k-collected", "k-next", "k-failed", "k-ones", "today", "week", "attention", "messages", "email", "stream",
    "collections", "tasters", "bookings", "coming", "fullest"],
};
