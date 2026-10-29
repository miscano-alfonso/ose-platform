// The modules each customisable dashboard can show (shared by the pages and the save action).
export const BOARD_MODULES: Record<string, string[]> = {
  "teacher-home": ["hero", "reports-pop", "k-attendance", "k-reports", "k-ones", "k-pay", "week", "reports", "messages", "email"],
  "parent-home": ["hero", "payment", "children", "work", "reports", "coming", "messages"],
  "student-home": ["hero", "points", "classes", "chat"],
};
