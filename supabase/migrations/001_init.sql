-- Posupject v0.1 schema: feature/bug tracker
-- Supabase project: yuevuqvldtmjwwzjrddo
-- Safe to re-run (idempotent via IF NOT EXISTS).

-- ── 1. profiles (mirrors auth.users) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  display_name text,
  role        text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor','viewer')),
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile when a new auth.user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  -- First user becomes owner automatically
  IF (SELECT count(*) FROM public.profiles) = 1 THEN
    UPDATE public.profiles SET role = 'owner' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. projects ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text DEFAULT '📦',
  color       text DEFAULT '#6366f1',
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 3. buckets (columns on the kanban) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buckets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text DEFAULT '#64748b',
  position    integer NOT NULL DEFAULT 0,
  is_done     boolean NOT NULL DEFAULT false,  -- marks items as closed
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buckets_project ON public.buckets(project_id, position);

-- ── 4. items (features / bugs / tasks) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bucket_id   uuid NOT NULL REFERENCES public.buckets(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  type        text NOT NULL DEFAULT 'task' CHECK (type IN ('feature','bug','task','chore')),
  priority    text NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2','P3')),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  labels      text[] DEFAULT '{}',
  github_ref  text,            -- e.g. pwar2804aio/possystem#123 or @sha
  version_seen  text,
  version_fixed text,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_items_project ON public.items(project_id);
CREATE INDEX IF NOT EXISTS idx_items_bucket ON public.items(bucket_id, position);
CREATE INDEX IF NOT EXISTS idx_items_assignee ON public.items(assignee_id);

-- ── 5. comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES public.profiles(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_item ON public.comments(item_id, created_at);

-- ── 6. activity log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid REFERENCES public.items(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES public.profiles(id),
  action     text NOT NULL,  -- created, moved, edited, commented, closed, reopened
  detail     jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_item ON public.activity(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_project ON public.activity(project_id, created_at DESC);

-- ── 7. updated_at triggers ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_touch ON public.projects;
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_items_touch ON public.items;
CREATE TRIGGER trg_items_touch BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 8. RLS — everyone logged in reads everything; role controls writes ───
-- Simple model: all authenticated users in the app are trusted members.
-- Access to the app itself is gated by Supabase Auth (magic link email).
-- Role restricts writes: viewer = read only, editor/owner = write, owner = manage users.

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buckets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity  ENABLE ROW LEVEL SECURITY;

-- Helper: current user's role
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles: anyone logged in reads; only self or owner writes
DO $$ BEGIN
  CREATE POLICY profiles_read_authed ON public.profiles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY profiles_update_self_or_owner ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- projects: all authed read; editor/owner write
DO $$ BEGIN
  CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY projects_write ON public.projects FOR ALL TO authenticated
    USING (public.current_user_role() IN ('editor','owner'))
    WITH CHECK (public.current_user_role() IN ('editor','owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- buckets, items, comments: same pattern
DO $$ BEGIN CREATE POLICY buckets_read  ON public.buckets  FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY buckets_write ON public.buckets  FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY items_read    ON public.items    FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY items_write   ON public.items    FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY comments_read ON public.comments FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY comments_write ON public.comments FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY activity_read ON public.activity FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY activity_insert ON public.activity FOR INSERT TO authenticated WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. Realtime publication ──────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.items, public.buckets, public.comments, public.activity;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 10. Verify ───────────────────────────────────────────────────────────
SELECT 'profiles' AS table, count(*) AS rows FROM public.profiles
UNION ALL SELECT 'projects', count(*) FROM public.projects
UNION ALL SELECT 'buckets', count(*) FROM public.buckets
UNION ALL SELECT 'items', count(*) FROM public.items
UNION ALL SELECT 'comments', count(*) FROM public.comments
UNION ALL SELECT 'activity', count(*) FROM public.activity;