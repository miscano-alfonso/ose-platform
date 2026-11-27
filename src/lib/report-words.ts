/** 27 Nov (Alfonso): a report comment is 100–200 words, for teachers writing it and for Draft with AI. Shared by the
 *  server (the submit check) and the page (the live word count), so it holds no server code. */
export const MIN_WORDS = 100, MAX_WORDS = 200;
export const countWords = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
export const wordsOk = (s: string | null | undefined) => { const n = countWords(s); return n >= MIN_WORDS && n <= MAX_WORDS; };
