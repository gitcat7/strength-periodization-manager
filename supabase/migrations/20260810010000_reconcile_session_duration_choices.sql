-- Preserve both the restored 30-minute prescription budget and the extended
-- checkpoint duration choices. Both historical constraint names are removed so
-- this migration is idempotent across databases that followed either branch.
alter table public.usr_athlete_profiles
  drop constraint if exists usr_athlete_profiles_session_duration_minutes_check;

alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_session_duration_minutes_check;

alter table public.usr_athlete_profiles
  add constraint athlete_profiles_session_duration_minutes_check
  check (session_duration_minutes in (30, 45, 60, 75, 90, 120, 150, 180));
