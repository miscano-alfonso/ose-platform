// SEND labels (31 Oct): the needs a parent can tick at registration, and the short labels teachers see next to a name.
export const NEEDS = ["ADHD", "Autism", "Dyslexia", "Dyspraxia", "Dyscalculia", "Anxiety", "Sensory processing", "Speech and language", "Hearing", "Vision", "Physical", "Other"];
const WORDS: [RegExp, string][] = [[/adhd|add\b|attention/i, "ADHD"], [/autis|asd|asperger/i, "Autism"], [/dyslex/i, "Dyslexia"], [/dyspra|dcd/i, "Dyspraxia"],
  [/dyscalc/i, "Dyscalculia"], [/anxi/i, "Anxiety"], [/sensory|spd/i, "Sensory processing"], [/speech|language|slcn/i, "Speech and language"],
  [/hearing|deaf/i, "Hearing"], [/visual|vision|sight/i, "Vision"], [/physical|mobility/i, "Physical"], [/ehcp/i, "EHCP"]];
/** The labels to show: what the parent ticked, or what can be read from their description, or just "SEND". */
export function sendLabels(needs: string[] | null | undefined, details?: string | null): string[] {
  const n = (needs ?? []).filter((x) => x && x !== "Other");
  if (n.length) return n;
  const found = WORDS.filter(([re]) => re.test(details ?? "")).map(([, l]) => l);
  return found.length ? [...new Set(found)] : ["SEND"];
}
