alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_training_days_per_week_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_training_days_per_week_check
  check (training_days_per_week in (3, 4, 7));

alter table public.programs
  drop constraint if exists programs_template_type_check;

alter table public.programs
  add constraint programs_template_type_check
  check (template_type in ('three_day_full_body', 'four_day_upper_lower', 'push_pull_squat'));

insert into public.exercises (slug, name, category, default_increment, is_main_lift)
values
  ('incline_dumbbell_press', '上斜哑铃卧推', 'push', 2.50, false),
  ('lateral_raise', '侧平举', 'push', 1.00, false),
  ('triceps_pushdown', '绳索下压', 'push', 2.50, false),
  ('seated_cable_row', '坐姿划船', 'pull', 2.50, false),
  ('face_pull', '面拉', 'pull', 1.00, false),
  ('dumbbell_curl', '哑铃弯举', 'pull', 1.00, false),
  ('standing_calf_raise', '站姿提踵', 'squat', 2.50, false),
  ('cardio_zone2', 'Zone 2 有氧', 'cardio', 0.00, false)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  is_main_lift = excluded.is_main_lift;

