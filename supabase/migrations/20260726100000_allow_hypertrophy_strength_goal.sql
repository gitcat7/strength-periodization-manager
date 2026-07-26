alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_goal_check;

alter table public.usr_athlete_profiles
  add constraint athlete_profiles_goal_check
  check (goal in ('strength', 'hypertrophy', 'hypertrophy_strength', 'fat_loss', 'body_recomposition'));
