alter table public.programs
  add column if not exists custom_template_name text;

alter table public.programs
  add column if not exists schedule_config jsonb not null default '{}'::jsonb;

alter table public.programs
  drop constraint if exists programs_template_type_check;

alter table public.programs
  add constraint programs_template_type_check
  check (
    template_type in (
      'three_day_full_body',
      'four_day_upper_lower',
      'one_split',
      'three_split',
      'five_split',
      'push_pull_squat',
      'custom'
    )
  );
