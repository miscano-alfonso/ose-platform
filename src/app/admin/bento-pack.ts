// Packs dashboard modules so they fill the space. Modules go left to right in rows (in the saved order, at their
// chosen widths). In a row, modules are stretched to the row's height, so tiles line up. But when one module in a
// row of three or more is far taller than the others (1.5×), it keeps its own height and hangs down beside the next
// rows, and the modules after it move up into the space under its shorter neighbours instead of leaving a gap.
// A module that hangs down is then stretched to line up with the bottom of the row it ends beside.
export type PackIn = { w: number; h: number; fixed: boolean };
export type PackOut = { x: number; w: number; top: number; height: number };

export function pack(items: PackIn[], cols = 12, gap = 16, tall = 1.5): { boxes: PackOut[]; height: number } {
  const colBottom = new Array(cols).fill(0) as number[];
  const boxes: PackOut[] = new Array(items.length);
  const hangs: number[] = [];
  const rows: number[][] = [];
  let i = 0;
  while (i < items.length) {
    const row: number[] = []; let used = 0;
    while (i < items.length && (row.length === 0 || used + Math.min(items[i].w, cols) <= cols)) { row.push(i); used += Math.min(items[i].w, cols); i++; }
    rows.push(row);
    let x = 0;
    const tops = row.map((k) => { const w = Math.min(items[k].w, cols), xs = x; x += w; return { k, x: xs, w, top: Math.max(...colBottom.slice(xs, xs + w)) }; });
    // the module that hangs down, if any
    let hang = -1;
    if (row.length >= 3) {
      const byH = [...tops].sort((a, b) => items[b.k].h - items[a.k].h);
      if (items[byH[0].k].h >= tall * items[byH[1].k].h && items[byH[0].k].h - items[byH[1].k].h > 120) hang = byH[0].k;
    }
    const bandBottom = Math.max(...tops.filter((t) => t.k !== hang).map((t) => t.top + items[t.k].h));
    for (const t of tops) {
      const it = items[t.k];
      const height = t.k === hang || it.fixed ? it.h : Math.max(it.h, bandBottom - t.top);
      boxes[t.k] = { x: t.x, w: t.w, top: t.top, height };
      for (let c = t.x; c < t.x + t.w; c++) colBottom[c] = t.top + height + gap;
    }
    if (hang >= 0) hangs.push(hang);
  }
  // line a hanging module's bottom up with the bottom of a module beside it that ends a little lower (within 160px)
  for (const k of hangs) {
    const b = boxes[k], end = b.top + b.height;
    const beside = boxes.filter((o, j) => j !== k && o && (o.x + o.w <= b.x || o.x >= b.x + b.w) && o.top < end && o.top + o.height >= end && o.top + o.height - end <= 160);
    if (beside.length && !items[k].fixed) {
      const target = Math.min(...beside.map((o) => o.top + o.height));
      // only if nothing sits under it in its columns before that point
      const blocked = boxes.some((o, j) => j !== k && o && o.x < b.x + b.w && o.x + o.w > b.x && o.top >= end && o.top < target + gap);
      if (!blocked) b.height = target - b.top;
    }
  }
  // a module with nothing under it grows down to the bottom of the modules beside it (up to 420px), so the
  // board ends in a straight line instead of a ragged edge
  boxes.forEach((b, k) => {
    if (!b) return;
    const end = b.top + b.height;
    if (boxes.some((o, j) => j !== k && o && o.x < b.x + b.w && o.x + o.w > b.x && o.top >= end)) return;
    const beside = boxes.filter((o, j) => j !== k && o && (o.x + o.w <= b.x || o.x >= b.x + b.w) && o.top < end + 1 && o.top + o.height > end);
    if (!beside.length) return;
    const target = Math.max(...beside.map((o) => o.top + o.height));
    if (target - end <= 420) b.height = target - b.top;
  });
  const height = Math.max(0, ...boxes.map((b) => b ? b.top + b.height : 0));
  return { boxes, height };
}

/** How many of the 12 columns a width takes at this board width (the same steps as the CSS). */
export function spanOf(size: string, boardWidth: number): number {
  const wide: Record<string, number> = { s: 2, q: 3, m: 4, l: 6, xl: 8, full: 12 };
  const mid: Record<string, number> = { s: 4, q: 6, m: 6, l: 12, xl: 12, full: 12 };
  const small: Record<string, number> = { s: 6, q: 6, m: 12, l: 12, xl: 12, full: 12 };
  return (boardWidth >= 1000 ? wide : boardWidth >= 620 ? mid : small)[size] ?? 4;
}
