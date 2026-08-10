-- P1-1: allow the new 30-minute plan budget while retaining legacy 75-minute profiles.
alter table public.usr_athlete_profiles
  drop constraint if exists usr_athlete_profiles_session_duration_minutes_check;

alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_session_duration_minutes_check;

alter table public.usr_athlete_profiles
  add constraint usr_athlete_profiles_session_duration_minutes_check
  check (session_duration_minutes in (30, 45, 60, 75, 90));
