// TEMPORARY Gate 0a keep-alive — remove when the owner face ships in DashVue.
//
// Schedule data (shift_*) moved to the DashVue Supabase core on 2026-08-13.
// This read-only client points there so the Labor tile keeps seeing the LIVE
// schedule. The DashVue core carries narrow anon SELECT-only policies scoped
// to the GCDC org for exactly these three tables (also temporary).
// Falls back to the main client when the env vars are absent.
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const url = import.meta.env.VITE_SHIFT_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SHIFT_SUPABASE_ANON_KEY as string | undefined;

export const supabaseShift =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : supabase;
