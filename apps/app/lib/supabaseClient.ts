/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const SUPABASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || "https://wecmpncixopetvunkkyd.supabase.co";
const SUPABASE_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlY21wbmNpeG9wZXR2dW5ra3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MDc0NzAsImV4cCI6MjEwMDE4MzQ3MH0.I6qblnYASnO9BGkrfKJr97nj7lmwkdgNAkHgdv0xsCo";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
