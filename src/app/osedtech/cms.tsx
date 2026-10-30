import { cloneElement, isValidElement, Fragment, type ReactElement, type ReactNode } from "react";
import { siteCms } from "@/lib/edt-cms";
import { keyOf, norm, SIZES, BACKGROUNDS, lightBg, type Cms, type SecSet } from "@/lib/edt-cms-key";

// The OH-SO EdTech website editor, on the server: each page's JSX goes through cms(page, …) before it's sent.
// Every piece of text gets its edited wording (if any); in edit mode it's wrapped in <span data-edt> so it can be
// clicked and typed over. Each top-level <section> gets its spacing, background, order and "hidden" setting.
const CLIENT_REF = Symbol.for("react.client.reference");
const SKIP = new Set(["script", "style", "textarea", "option", "select", "svg", "title", "code"]);
type Ctx = { page: string; cms: Cms; edit: boolean; skip?: unknown };
type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

function text(s: string, c: Ctx, i?: number): ReactNode {
  const t = norm(s); if (!t || t.length < 1 || /^[\s·•|,.:;–—\-()&]+$/.test(t)) return s;
  const k = keyOf(c.page, t), v = c.cms.text[k];
  const lead = s.match(/^\s*/)![0], trail = s.match(/\s*$/)![0];
  if (!c.edit) return v == null ? s : lead + v + trail;
  return <Fragment key={i}>{lead}<span data-edt={k} data-orig={t}>{v ?? t}</span>{trail}</Fragment>;
}

async function walk(n: ReactNode, c: Ctx, i?: number): Promise<ReactNode> {
  if (typeof n === "string") return text(n, c, i);
  if (n == null || typeof n === "boolean" || typeof n === "number") return n;
  if (Array.isArray(n)) return Promise.all(n.map((x, j) => walk(x, c, j)));
  if (!isValidElement(n) || n === c.skip) return n;
  const el = n as El, type = el.type as unknown;
  if (typeof type === "string" && SKIP.has(type)) return el;
  // our own server components (cards, buttons, pictures): run them so their text is editable too
  if (typeof type === "function" && (type as { $$typeof?: symbol }).$$typeof !== CLIENT_REF && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
    return walk(await (type as (p: unknown) => ReactNode | Promise<ReactNode>)(el.props), c, i);
  }
  const kids = el.props.children;
  if (kids === undefined || typeof kids === "function") return el;
  const w = await walk(kids, c);
  return Array.isArray(kids) ? cloneElement(el, undefined, ...(w as ReactNode[])) : cloneElement(el, undefined, w);
}

/** A section's settings as inline style (spacing and background) and attributes. */
function sectionProps(s: SecSet | undefined, id: string, edit: boolean, style: Record<string, unknown> = {}) {
  const st: Record<string, string> = {};
  if (s?.pt) st.paddingTop = SIZES.find((x) => x.id === s.pt)!.css;
  if (s?.pb) st.paddingBottom = SIZES.find((x) => x.id === s.pb)!.css;
  if (s?.bg) {
    const tok = BACKGROUNDS.find((b) => b.id === s.bg);
    st.background = tok ? tok.css : s.bg;
    if (!tok && lightBg(s.bg)) Object.assign(st, { color: "#12162f", "--ink": "#12162f", "--muted": "#4b5068", "--card": "#ffffff", "--line": "#d9d6cc" });
    else if (!tok) Object.assign(st, { color: "#f1f2f4", "--ink": "#f1f2f4", "--muted": "#c3c6cf" });
  }
  return { style: { ...style, ...st }, ...(edit ? { "data-edt-sec": id, "data-edt-hidden": s?.hidden ? "1" : undefined } : {}) };
}

/** A page through the editor. Top-level sections can be reordered and hidden. */
export async function cms(page: string, tree: ReactNode): Promise<ReactNode> {
  const { cms: c, edit } = await siteCms();
  const ctx: Ctx = { page, cms: c, edit };
  let top: ReactNode[] = isValidElement(tree) && tree.type === Fragment ? ([] as ReactNode[]).concat((tree as El).props.children ?? []) : [tree];
  // number the sections in their original order, apply their settings
  let n = 0;
  top = top.map((x) => {
    if (!isValidElement(x) || x.type !== "section") return x;
    const idx = n++, id = `${page}:${idx}`, s = c.sec[id], el = x as El;
    if (s?.hidden && !edit) return null;
    return cloneElement(el, { ...sectionProps(s, id, edit, el.props.style as Record<string, unknown>), key: `s${idx}`, "data-edt-idx": idx } as never);
  });
  const order = c.order[page];
  if (order?.length) {
    const secs = top.filter((x) => isValidElement(x) && x.type === "section") as El[];
    const byIdx = new Map(secs.map((x) => [Number((x.props as Record<string, unknown>)["data-edt-idx"]), x]));
    const sorted = [...order.filter((i) => byIdx.has(i)).map((i) => byIdx.get(i)!), ...secs.filter((x) => !order.includes(Number((x.props as Record<string, unknown>)["data-edt-idx"])))];
    let k = 0; top = top.map((x) => isValidElement(x) && x.type === "section" ? sorted[k++] : x);
  }
  return <>{await walk(top, ctx)}</>;
}

/** Plain text through the editor (for text a client component shows, e.g. the plan cards). */
export async function cmsText(page: string, s: string): Promise<ReactNode> {
  const { cms: c, edit } = await siteCms();
  return text(s, { page, cms: c, edit });
}

/** The layout's header and footer through the editor; the page itself (children) is left alone. */
export async function cmsLayout(tree: ReactNode, children: ReactNode): Promise<ReactNode> {
  const { cms: c, edit } = await siteCms();
  return walk(tree, { page: "layout", cms: c, edit, skip: children });
}
