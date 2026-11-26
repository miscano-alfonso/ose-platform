/** The subjects we mark past papers for (the form): set in Admin → Website → Past paper marking, one per line (26 Nov). */
export const MARKING_DEFAULT = ["iGCSE English Language", "iGCSE English Literature"];
export const markingSubjects = (text: string | null | undefined): string[] => {
  const list = [...new Set(String(text ?? "").split("\n").map((s) => s.trim().replace(/\s+/g, " ").slice(0, 80)).filter(Boolean))].slice(0, 40);
  return list.length ? list : MARKING_DEFAULT;
};
export const MARKING_PRICE_PENCE = 2000;
