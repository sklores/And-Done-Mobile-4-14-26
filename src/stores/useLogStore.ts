// useLogStore — now backed by the Supabase `activity_log` table.
// Realtime subscription means Gizmo's inserts appear instantly in the
// Log tab without a refresh. Falls back to in-memory if Supabase isn't
// configured (dev / offline).

import { create } from "zustand";
import { supabase, supabaseReady } from "../lib/supabase";

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
  addEntry: (
    text: string,
    type?: "manual" | "auto" | "gizmo",
    opts?: { mediaFile?: File | null },
  ) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
};

// ── DB row → LogEntry ────────────────────────────────────────────────────────
type Row = {
  id: string;
  created_at: string;
  text: string | null;
  type: string;
  media_url?: string | null;
  media_type?: string | null;
};
function rowToEntry(r: Row): LogEntry {
  const t = (r.type === "manual" || r.type === "auto" || r.type === "gizmo")
    ? (r.type as LogEntry["type"])
    : "manual";
  return {
    id: r.id,
    timestamp: r.created_at,
    text: r.text ?? "",
    type: t,
    mediaUrl: r.media_url ?? null,
    mediaType: r.media_type ?? null,
  };
}

const BUCKET = "activity-media";
const SELECT_COLS = "id, created_at, text, type, media_url, media_type";

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  loaded: false,

  hydrate: async () => {
    if (!supabaseReady) {
      set({ loaded: true });
      return;
    }
    const { data, error } = await supabase
      .from("activity_log")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("activity_log fetch failed:", error.message);
      set({ loaded: true });
      return;
    }
    set({ entries: (data ?? []).map(rowToEntry), loaded: true });

    // Realtime: push-based sync for inserts/deletes by anyone (incl Gizmo).
    supabase
      .channel("activity_log_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const entry = rowToEntry(payload.new as Row);
          set((s) => {
            if (s.entries.some((e) => e.id === entry.id)) return s;
            return { entries: [entry, ...s.entries] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "activity_log" },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        },
      )
      .subscribe();
  },

  addEntry: async (text, type = "manual", opts = {}) => {
    const trimmed = text.trim();
    const mediaFile = opts.mediaFile ?? null;
    if (!trimmed && !mediaFile) return;

    // Optimistic insert for snappy UI
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const localPreview = mediaFile ? URL.createObjectURL(mediaFile) : null;
    const optimistic: LogEntry = {
      id: tempId,
      timestamp: new Date().toISOString(),
      text: trimmed,
      type,
      mediaUrl: localPreview,
      mediaType: mediaFile ? "image" : null,
    };
    set((s) => ({ entries: [optimistic, ...s.entries] }));

    if (!supabaseReady) return;

    // Upload media first if present, so we can store the public URL on the row
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    if (mediaFile) {
      const ext = (mediaFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${new Date().toISOString().slice(0, 10)}/${tempId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, mediaFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: mediaFile.type || "image/jpeg",
        });
      if (upErr) {
        console.warn("media upload failed:", upErr.message);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== tempId) }));
        if (localPreview) URL.revokeObjectURL(localPreview);
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      mediaUrl = pub.publicUrl;
      mediaType = "image";
    }

    const { data, error } = await supabase
      .from("activity_log")
      .insert({
        text: trimmed || null,
        type,
        source: type === "manual" ? "user" : type,
        media_url: mediaUrl,
        media_type: mediaType,
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      // Roll back optimistic insert
      set((s) => ({ entries: s.entries.filter((e) => e.id !== tempId) }));
      if (localPreview) URL.revokeObjectURL(localPreview);
      console.warn("activity_log insert failed:", error.message);
      return;
    }
    // Swap temp row for real row
    const real = rowToEntry(data as Row);
    set((s) => ({
      entries: s.entries.some((e) => e.id === real.id)
        ? s.entries.filter((e) => e.id !== tempId)
        : s.entries.map((e) => (e.id === tempId ? real : e)),
    }));
    if (localPreview) URL.revokeObjectURL(localPreview);
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    if (!supabaseReady || id.startsWith("tmp-")) return;
    const { error } = await supabase.from("activity_log").delete().eq("id", id);
    if (error) {
      console.warn("activity_log delete failed:", error.message);
      set({ entries: prev });
    }
  },
}));
