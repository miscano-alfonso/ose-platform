"use server";
import { revalidatePath } from "next/cache";
import { editor, changeDraft, publishDraft, discardDraft, stopEditing, cleanSection, cleanStyle, cleanBlock } from "@/lib/edt-cms";
import { norm, BLOCK_ID, type SecSet, type StyleSet, type BlkSet } from "@/lib/edt-cms-key";

// The OH-SO EdTech website editor's saves. Every one checks the signed editor cookie and that the person is still an admin.
const must = async () => { const e = await editor(); if (!e) throw new Error("Not signed in to edit."); return e; };
const done = () => revalidatePath("/osedtech", "layout");

/** A piece of text. Empty, or the same as the original, puts the original back. */
export async function cmsSaveText(key: string, value: string, orig: string): Promise<void> {
  const e = await must(); if (!/^[a-z-]{2,20}:[0-9a-z]{1,8}$/.test(key)) return;
  const v = norm(String(value)).slice(0, 3000), o = norm(String(orig));
  await changeDraft(e.name, (c) => { if (!v || v === o) delete c.text[key]; else c.text[key] = v; });
  done();
}
/** A section's spacing, background or hidden setting (null clears them). */
export async function cmsSaveSection(id: string, s: Partial<SecSet> | null): Promise<void> {
  const e = await must(); if (!/^[a-z-]{2,20}:\d{1,2}$/.test(id)) return;
  await changeDraft(e.name, (c) => { const v = s ? cleanSection(s) : {}; if (Object.keys(v).length) c.sec[id] = v; else delete c.sec[id]; });
  done();
}
/** Move a section up or down the page. */
export async function cmsMoveSection(page: string, idx: number, dir: -1 | 1, count: number): Promise<void> {
  const e = await must(); if (!/^[a-z-]{2,20}$/.test(page) || count < 1 || count > 40) return;
  await changeDraft(e.name, (c) => {
    const base = (c.order[page] ?? []).filter((i) => i < count);
    const order = [...base, ...Array.from({ length: count }, (_, i) => i).filter((i) => !base.includes(i))];
    const at = order.indexOf(idx), to = at + dir; if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    c.order[page] = order.every((v, i) => v === i) ? [] : order;
    if (!c.order[page].length) delete c.order[page];
  });
  done();
}
/** An element's space above / below and the gap between its items (null clears them). */
export async function cmsSaveBlock(id: string, b: Partial<BlkSet> | null): Promise<void> {
  const e = await must(); if (!BLOCK_ID.test(id) || id.split(":").length !== 3) return;
  await changeDraft(e.name, (c) => { const v = b ? cleanBlock(b) : {}; if (Object.keys(v).length) c.blk[id] = v; else delete c.blk[id]; });
  done();
}
/** Move an item earlier or later among the items of the element it sits in (parent = a section or an element id). */
export async function cmsMoveChild(parent: string, idx: number, dir: -1 | 1, count: number): Promise<void> {
  const e = await must(); if (!BLOCK_ID.test(parent) || count < 2 || count > 60 || idx < 0 || idx >= count) return;
  await changeDraft(e.name, (c) => {
    const base = (c.order[parent] ?? []).filter((i) => i < count);
    const order = [...base, ...Array.from({ length: count }, (_, i) => i).filter((i) => !base.includes(i))];
    const at = order.indexOf(idx), to = at + dir; if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    if (order.every((v, i) => v === i)) delete c.order[parent]; else c.order[parent] = order;
  });
  done();
}
export async function cmsSaveStyle(s: Partial<StyleSet> | null): Promise<void> {
  const e = await must(); await changeDraft(e.name, (c) => { c.style = s ? cleanStyle(s) : {}; }); done();
}
export async function cmsPublish(): Promise<void> { const e = await must(); await publishDraft(e.name); done(); }
export async function cmsDiscard(): Promise<void> { await must(); await discardDraft(); done(); }
export async function cmsExit(): Promise<void> { await stopEditing(); done(); }
