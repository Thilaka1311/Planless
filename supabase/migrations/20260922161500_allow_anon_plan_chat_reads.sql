-- Migration: 20260922161500_allow_anon_plan_chat_reads.sql
-- Allow public/anon access to plan_chat_reads table

DROP POLICY IF EXISTS "Public can view chat read state" ON public.plan_chat_reads;
CREATE POLICY "Public can view chat read state"
  ON public.plan_chat_reads
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Public can insert chat read state" ON public.plan_chat_reads;
CREATE POLICY "Public can insert chat read state"
  ON public.plan_chat_reads
  FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update chat read state" ON public.plan_chat_reads;
CREATE POLICY "Public can update chat read state"
  ON public.plan_chat_reads
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
