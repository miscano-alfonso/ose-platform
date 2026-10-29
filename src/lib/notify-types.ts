// Notifications on the dashboards: what each person can be told about, the five sounds, and the defaults.
// Shared by the server (settings, events) and the browser (sounds, pop-ups).
export type NotifyRole = "admin" | "teacher" | "parent" | "student";
export type SoundId = "chime" | "bell" | "pop" | "marimba" | "ding";
export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" }, { id: "bell", label: "Bell" }, { id: "pop", label: "Pop" }, { id: "marimba", label: "Marimba" }, { id: "ding", label: "Soft ding" },
];
export type NotifyType = { id: string; label: string; hint: string; sound: SoundId };
export const TYPES: Record<NotifyRole, NotifyType[]> = {
  admin: [
    { id: "email", label: "New email", hint: "A family or teacher emails the school inbox", sound: "chime" },
    { id: "message", label: "New message", hint: "A parent or teacher writes in Messages", sound: "pop" },
    { id: "taster", label: "Taster request", hint: "Someone books a taster lesson", sound: "marimba" },
    { id: "enquiry", label: "New enquiry", hint: "A contact form or waiting-list enquiry", sound: "ding" },
    { id: "lesson", label: "Lesson starting", hint: "10 minutes before each lesson", sound: "bell" },
  ],
  teacher: [
    { id: "lesson", label: "Lesson starting", hint: "10 minutes before each of your lessons", sound: "bell" },
    { id: "message", label: "Message from a parent", hint: "A parent writes to you in Messages", sound: "pop" },
    { id: "email", label: "Reply from the school", hint: "The office answers your email", sound: "chime" },
    { id: "chat", label: "Class chat", hint: "A student posts in one of your class chats", sound: "ding" },
  ],
  parent: [
    { id: "lesson", label: "Lesson starting", hint: "10 minutes before your child’s lesson", sound: "bell" },
    { id: "message", label: "Message from a teacher", hint: "A teacher writes to you", sound: "pop" },
    { id: "report", label: "New report", hint: "A report is ready to read", sound: "marimba" },
    { id: "payment", label: "Payment tomorrow", hint: "The day before a payment is taken", sound: "chime" },
  ],
  student: [
    { id: "lesson", label: "Lesson starting", hint: "10 minutes before your lesson", sound: "bell" },
    { id: "chat", label: "Chat message", hint: "Someone writes in your chats", sound: "pop" },
    { id: "points", label: "Reward points", hint: "A teacher gives you points", sound: "marimba" },
  ],
};
export type NotifySettings = { on: boolean; items: Record<string, { on: boolean; sound: SoundId }> };
export function defaultsFor(role: NotifyRole): NotifySettings {
  return { on: true, items: Object.fromEntries(TYPES[role].map((t) => [t.id, { on: true, sound: t.sound }])) };
}
/** A saved setting tidied against the role's types (new types appear switched on, unknown ones dropped). */
export function cleanSettings(role: NotifyRole, raw: unknown): NotifySettings {
  const d = defaultsFor(role), r = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifySettings>;
  const ids = new Set(SOUNDS.map((s) => s.id));
  const items: NotifySettings["items"] = {};
  for (const t of TYPES[role]) {
    const x = r.items?.[t.id];
    items[t.id] = { on: typeof x?.on === "boolean" ? x.on : true, sound: x?.sound && ids.has(x.sound) ? x.sound : d.items[t.id].sound };
  }
  return { on: typeof r.on === "boolean" ? r.on : true, items };
}
export type NotifyEvent = { id: string; type: string; title: string; body: string; href: string | null; at: string };
