/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

export function resolveSupabaseUrl(): string {
  const envUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;

  if (typeof window !== "undefined") {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // When accessed from a remote device (e.g. phone via ngrok), any loopback URL like
    // http://127.0.0.1:54321 would incorrectly target the phone itself and fail with "Failed to fetch".
    // If envUrl is a loopback URL or empty, route through the reverse proxy on the current origin.
    if (!isLocalhost && (!envUrl || envUrl.includes("127.0.0.1") || envUrl.includes("localhost"))) {
      return window.location.origin;
    }
  }

  return envUrl || "https://wecmpncixopetvunkkyd.supabase.co";
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlY21wbmNpeG9wZXR2dW5ra3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MDc0NzAsImV4cCI6MjEwMDE4MzQ3MH0.I6qblnYASnO9BGkrfKJr97nj7lmwkdgNAkHgdv0xsCo";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
