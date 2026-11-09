-- KUDOS Public Safety Log.
-- Publication is controlled exclusively by the existing manager follow-up
-- status, not the safety_entries.status column or a client-side filter.
-- Visibility starts at Actioning and continues through Resolved or Closed.
-- Submitted and Under Review records remain restricted to authorised staff.
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='safety_entries'
      AND policyname='public read approved safety log entries'
  ) THEN
    CREATE POLICY "public read approved safety log entries"
      ON public.safety_entries FOR SELECT TO anon, authenticated
      USING (EXISTS (
        SELECT 1 FROM public.contribution_followups AS f
        WHERE f.contribution_type='safety'
          AND f.contribution_id=safety_entries.id
          AND f.status IN ('actioning','resolved','closed')
      ));
  END IF;
END
$policy$;

CREATE OR REPLACE VIEW public.kudos_safety_log
  WITH (security_invoker=true,security_barrier=true)
AS
SELECT
  s.id,
  s.profile_id,
  p.name AS contributor_name,
  p.profile_code AS contributor_profile_code,
  t.id AS team_id,
  t.name AS team_name,
  t.nickname AS team_nickname,
  s.category,
  s.description,
  s.external_reference,
  s.entry_date,
  s.created_at,
  f.status,
  f.manager_update,
  f.manager_updated_at
FROM public.safety_entries AS s
JOIN public.contribution_followups AS f
  ON f.contribution_type='safety'
 AND f.contribution_id=s.id
 AND f.status IN ('actioning','resolved','closed')
JOIN public.profiles AS p
  ON p.id=s.profile_id AND p.active=true
JOIN public.teams AS t
  ON t.id=p.team_id AND t.active=true;

REVOKE ALL ON public.kudos_safety_log FROM PUBLIC;
GRANT SELECT ON public.kudos_safety_log TO anon, authenticated;
