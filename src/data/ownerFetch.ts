/** fetch() for the owner app's own /api -- a 401 means the session is gone:
 *  close the front door (PinGate listens) and let the caller treat it as no data. */
export async function ownerFetch(input: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(input, { cache: "no-store", ...init });
  if (r.status === 401) window.dispatchEvent(new Event("owner-session-expired"));
  return r;
}
