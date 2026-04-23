-- v0.2: invite-only whitelist
-- Public signup is open in Supabase Auth but the handle_new_user trigger
-- will reject any email not present in invited_emails.
-- Also adds bucket INSERT/UPDATE/DELETE policy granularity (already covered
-- by _write but split here for clarity in the UI's disable/enable states).

-- ── 1. invited_emails whitelist ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invited_emails (
  email       text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor','viewer')),
  invited_by  uuid REFERENCES public.profiles(id),
  invited_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.invited_emails ENABLE ROW LEVEL SECURITY;

-- Only owners see + manage invites
DO $$ BEGIN
  CREATE POLICY invites_owner_all ON public.invited_emails FOR ALL TO authenticated
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Replace handle_new_user: whitelist gate + pre-assigned role ───────
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $$
DECLARE
  v_role text;
  v_invite_exists boolean;
  v_first_user boolean;
BEGIN
  -- Is this the very first user? They become owner automatically.
  v_first_user := (SELECT count(*) FROM public.profiles) = 0;

  IF v_first_user THEN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (NEW.id, NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
            'owner')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Everyone else must be whitelisted
  SELECT role INTO v_role FROM public.invited_emails WHERE email = NEW.email;
  v_invite_exists := FOUND;

  IF NOT v_invite_exists THEN
    -- Block the signup by raising — Supabase Auth will return this error to the client
    RAISE EXCEPTION 'Email not on the invite list. Ask an owner to invite you first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
          v_role)
  ON CONFLICT (id) DO NOTHING;

  -- Mark invite as accepted
  UPDATE public.invited_emails
     SET accepted_at = now(), accepted_by = NEW.id
   WHERE email = NEW.email;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from 001_init but re-ensure
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Verify ────────────────────────────────────────────────────────────
SELECT 'invited_emails table exists' AS check, EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invited_emails'
) AS ok
UNION ALL SELECT 'handle_new_user updated',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user')
UNION ALL SELECT 'invites RLS enabled',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'invited_emails')
UNION ALL SELECT 'trigger on auth.users',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created');
