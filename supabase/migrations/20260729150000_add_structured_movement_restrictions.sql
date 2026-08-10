alter table public.usr_athlete_profiles
  add column if not exists movement_restrictions text[] not null default '{}';

comment on column public.usr_athlete_profiles.movement_restrictions is
  '用户明确选择的动作限制；不从自由文本推断。';
