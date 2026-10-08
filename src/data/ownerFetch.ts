/** fetch() for the owner app's own /api -- a 401 means the session is gone:
 *  close the front door (PinGate listens) and let the caller treat it as no data. */
export async function ownerFetch(input: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(input, { cache: "no-store", ...init });
  if (r.status === 401) window.dispatchEvent(new Event("owner-session-expired"));
  return r;
}

/** Where a read stands. "we don't know" is one of these words, never a zero. */
export type FetchStatus = "idle" | "loading" | "ready" | "error";

/** What a read came back as. "empty" is an answer the seed gave (nothing there
 *  yet); "error" is us not knowing -- the two must never render the same. */
export type ReadResult<T> =
  | { status: "ready"; data: T; error: null }
  | { status: "empty"; data: null; error: null }
  | { status: "error"; data: null; error: string };

/** A JSON read through ownerFetch that reports its failure instead of hiding
 *  it as null: a non-ok status (carrying the proxy's message when it sent one),
 *  a transport throw, and unparseable JSON all arrive as status "error", so the
 *  caller can say "couldn't load" rather than "none". */
export async function ownerRead<T>(input: string, init?: RequestInit): Promise<ReadResult<T>> {
  try {
    const r = await ownerFetch(input, init);
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      return { status: "error", data: null, error: body.error ?? `HTTP ${r.status}` };
    }
    const data = (await r.json()) as T | null;
    if (data == null) return { status: "empty", data: null, error: null };
    return { status: "ready", data, error: null };
  } catch (e) {
    return { status: "error", data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
