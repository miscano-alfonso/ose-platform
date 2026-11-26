import "server-only";
import { withSchool } from "./db";

/** 26 Nov: a fingerprint of the school's messages (newest message, reply or read), so open pages can tell something
 *  changed without reloading everything. */
export async function messagesStamp(): Promise<string> {
  const [r] = await withSchool((q) => q<{ s: string | null }>(`select concat_ws('|',
      (select max(created_at)::text from office_messages), (select max(read_at)::text from office_messages),
      (select max(created_at)::text from messages), (select max(greatest(received_at, coalesce(replied_at, received_at)))::text from inbox_messages where kind = 'staff')) as s`)).catch(() => [{ s: null }]);
  return r?.s ?? "";
}
