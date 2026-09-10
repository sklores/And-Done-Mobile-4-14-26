import { create } from "zustand";
import { ownerFetch, ownerRead } from "../data/ownerFetch";
import type { FetchStatus } from "../data/ownerFetch";

// The owner's activity log. Lives on the seed (owner_log); photos go to the
// seed's media bucket. Gizmo's notes land here too (type "gizmo").
//
// The read carries its own phase: a log that could not be read is "error" with
// the reason, never an empty list the screen can state as "no entries".

export type LogEntry = {
  id: string;
  timestamp: string; // ISO
  text: string;
  type: "manual" | "auto" | "gizmo";
  mediaUrl?: string | null;
  mediaType?: string | null; // 'image' | 'audio' | null
};

type LogState = {
  entries: LogEntry[];
  loaded: boolean;
  /** The hydrate phase: idle -> loading -> ready | error. */
  status: FetchStatus;
  /** Why the last read or write failed, in words the screen can print. */
  error: string | null;
  addEntry: (text: string, type?: "manual" | "auto" | "gizmo", opts?: { mediaFile?: File | null }) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
};

const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : String(e ?? "")) || fallback;

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  loaded: false,
  status: "idle",
  error: null,

  hydrate: async () => {
    set((s) => ({ status: s.status === "ready" ? s.status : "loading", error: null }));
    const read = await ownerRead<LogEntry[]>("/api/seed?view=log");
    if (read.status !== "ready" || !Array.isArray(read.data)) {
      // Nothing is known about the log right now. Leave whatever was already
      // loaded alone and say the read failed -- an empty list here would be
      // rendered as "no entries yet", which is a claim we cannot make.
      const message = read.status === "error" ? read.error : "the log came back empty";
      console.warn("[log] hydrate failed", message);
      set({ status: "error", error: message });
      return;
    }
    set({ entries: read.data, loaded: true, status: "ready", error: null });
  },

  addEntry: async (text, type = "manual", opts = {}) => {
    const trimmed = text.trim();
    const mediaFile = opts.mediaFile ?? null;
    if (!trimmed && !mediaFile) return;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: LogEntry = { id: tempId, timestamp: new Date().toISOString(), text: trimmed, type, mediaUrl: mediaFile ? URL.createObjectURL(mediaFile) : null, mediaType: mediaFile ? (mediaFile.type.startsWith("audio/") ? "audio" : "image") : null };
    set((s) => ({ entries: [optimistic, ...s.entries] }));
    try {
      const body: Record<string, unknown> = { text: trimmed, type };
      if (mediaFile) { body.media_base64 = await fileToBase64(mediaFile); body.mime_type = mediaFile.type || "image/jpeg"; }
      const r = await ownerFetch("/api/seed?view=log-add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `could not save (HTTP ${r.status})`);
      const saved = (await r.json()) as LogEntry;
      set((s) => ({ entries: s.entries.map((e) => (e.id === tempId ? saved : e)), error: null }));
    } catch (e) {
      // The note is NOT on the seed: drop the row that implied it was, record
      // why, and hand the failure to the composer, which keeps the owner's
      // text and photo on screen.
      const message = errText(e, "could not save");
      set((s) => ({ entries: s.entries.filter((x) => x.id !== tempId), error: message }));
      throw new Error(message);
    }
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    try {
      const r = await ownerFetch("/api/seed?view=log-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `could not delete (HTTP ${r.status})`);
      set({ error: null });
    } catch (e) {
      // Still on the seed: put it back, say so, and let the caller show it.
      const message = errText(e, "could not delete");
      set({ entries: prev, error: message });
      throw new Error(message);
    }
  },
}));
