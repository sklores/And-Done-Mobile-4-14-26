import { create } from "zustand";
import { ownerFetch } from "../data/ownerFetch";

// The owner's activity log. Lives on the seed (owner_log); photos go to the
// seed's media bucket. Gizmo's notes land here too (type "gizmo").

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

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  loaded: false,

  hydrate: async () => {
    try {
      const r = await ownerFetch("/api/seed?view=log");
      if (!r.ok) return;
      set({ entries: (await r.json()) as LogEntry[], loaded: true });
    } catch (e) {
      console.warn("[log] hydrate failed", e);
    }
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
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "could not save");
      const saved = (await r.json()) as LogEntry;
      set((s) => ({ entries: s.entries.map((e) => (e.id === tempId ? saved : e)) }));
    } catch (e) {
      set((s) => ({ entries: s.entries.filter((x) => x.id !== tempId) }));
      throw e;
    }
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    const r = await ownerFetch("/api/seed?view=log-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) set({ entries: prev });
  },
}));
