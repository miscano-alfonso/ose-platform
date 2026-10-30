import { cloneElement, isValidElement, Fragment, type ReactElement, type ReactNode } from "react";
import { siteCms } from "@/lib/edt-cms";
import { keyOf, norm, SIZES, BSIZES, BACKGROUNDS, lightBg, type Cms, type SecSet } from "@/lib/edt-cms-key";

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

// Inside a section every element sitting directly in a "container" (div, section, nav, ul…) is a block with an id made of
// its position: "page:section:path" (path = child positions, e.g. "1.0.2"). Blocks can have space above/below, a gap between
// their own items, and their items reordered. Text containers (p, headings, links…) are not split further.
const CONTAINERS = new Set(["section", "div", "nav", "ul", "ol", "aside", "header", "footer", "form", "article", "figure", "main", "fieldset", "dl", "li"]);
const childId = (bid: string, k: number) => bid.split(":").length === 2 ? `${bid}:${k}` : `${bid}.${k}`;
const bsz = (id?: string) => BSIZES.find((x) => x.id === id)?.css;

async function walk(n: ReactNode, c: Ctx, i?: number, bid?: string): Promise<ReactNode> {
  if (typeof n === "string") return text(n, c, i);
  if (n == null || typeof n === "boolean" || typeof n === "number") return n;
  if (Array.isArray(n)) return Promise.all(n.map((x, j) => walk(x, c, j)));
  if (!isValidElement(n) || n === c.skip) return n;
  const el = n as El, type = el.type as unknown;
  if (typeof type === "string" && SKIP.has(type)) return bid ? block(el, c, bid, el.props.children, 0) : el;
  // our own server components (cards, buttons, pictures): run them so their text is editable too (the block id carries on)
  if (typeof type === "function" && (type as { $$typeof?: symbol }).$$typeof !== CLIENT_REF && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
    return walk(await (type as (p: unknown) => ReactNode | Promise<ReactNode>)(el.props), c, i, bid);
  }
  if (typeof type !== "string") return el;
  const kids = el.props.children;
  if (kids === undefined || typeof kids === "function") return bid ? block(el, c, bid, kids, 0) : el;
  // a container inside a section: number its element children, walk them as blocks, then apply any saved order
  if (bid && CONTAINERS.has(type)) {
    const list = ([] as ReactNode[]).concat(kids as ReactNode).flat(Infinity as 1);
    let k = 0; const ids: (number | null)[] = list.map((x) => isValidElement(x) ? k++ : null);
    const w = await Promise.all(list.map((x, j) => ids[j] == null ? walk(x, c, j) : walk(x, c, j, childId(bid, ids[j]!))));
    const order = c.cms.order[bid];
    let out = w, seq = Array.from({ length: k }, (_, o) => o);
    if (order?.length && k > 1) {
      const els = w.filter((_, j) => ids[j] != null);
      seq = [...order.filter((o) => o < k), ...seq.filter((o) => !order.includes(o))];
      const sorted = seq.map((o) => els[o]);
      let m = 0; out = w.map((x, j) => ids[j] == null ? x : sorted[m++]);
    }
    return block(el, c, bid, out, k, true, seq);
  }
  const w = await walk(kids, c);
  return bid ? block(el, c, bid, w, 0, Array.isArray(kids)) : Array.isArray(kids) ? cloneElement(el, undefined, ...(w as ReactNode[])) : cloneElement(el, undefined, w);
}

/** An element inside a section with its saved spacing, and in edit mode the attributes the editor uses to find it. */
function block(el: El, c: Ctx, bid: string, kids: ReactNode, n: number, spread = false, seq?: number[]): ReactNode {
  const isSection = bid.split(":").length === 2, b = isSection ? undefined : c.cms.blk[bid];
  const st: Record<string, string> = {};
  if (b?.mt) st.marginTop = bsz(b.mt)!; if (b?.mb) st.marginBottom = bsz(b.mb)!;
  if (b?.gap) { st.gap = bsz(b.gap)!; }
  const props: Record<string, unknown> = {};
  if (Object.keys(st).length) props.style = { ...(el.props.style as Record<string, unknown> ?? {}), ...st };
  // in edit mode: the element's id, how many items it holds, and in which order (original positions) they now show
  if (c.edit && !isSection) Object.assign(props, { "data-edt-blk": bid, "data-edt-n": n, "data-edt-tag": String(el.type) });
  if (c.edit && isSection) Object.assign(props, { "data-edt-n": n });
  if (c.edit && seq && n > 1) props["data-edt-ord"] = seq.join(",");
  if (kids === undefined) return Object.keys(props).length ? cloneElement(el, props) : el;
  return spread && Array.isArray(kids) ? cloneElement(el, props, ...(kids as ReactNode[])) : cloneElement(el, props, kids);
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
  return <>{await Promise.all(top.map((x, j) => isValidElement(x) && x.type === "section" ? walk(x, ctx, j, `${page}:${Number(((x as El).props as Record<string, unknown>)["data-edt-idx"])}`) : walk(x, ctx, j)))}</>;
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
