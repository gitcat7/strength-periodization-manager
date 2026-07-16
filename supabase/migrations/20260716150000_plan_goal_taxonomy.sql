alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_goal_check;

-- Replace the legacy label after releasing its old check constraint.
update public.athlete_profiles
set goal = 'hypertrophy'
where goal = 'hypertrophy_strength';

alter table public.athlete_profiles
  add constraint athlete_profiles_goal_check
  check (goal in ('strength', 'hypertrophy', 'fat_loss', 'body_recomposition'));
