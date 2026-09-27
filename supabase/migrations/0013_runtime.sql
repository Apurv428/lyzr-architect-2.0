-- Track which runtime a project's preview uses.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS preview_runtime TEXT NOT NULL DEFAULT 'sandpack'
    CHECK (preview_runtime IN ('sandpack', 'webcontainer', 'e2b'));

-- E2B sandbox sessions (short-lived, for audit/billing).
CREATE TABLE IF NOT EXISTS e2b_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);

ALTER TABLE e2b_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "e2b_sessions_owner" ON e2b_sessions;
CREATE POLICY "e2b_sessions_owner" ON e2b_sessions
  USING (user_id = auth.uid());
