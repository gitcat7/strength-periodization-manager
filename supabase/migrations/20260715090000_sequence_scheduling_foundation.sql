alter table public.programs
  add column if not exists schedule_mode text not null default 'fixed_weekdays';

alter table public.programs
  drop constraint if exists programs_schedule_mode_check;

alter table public.programs
  add constraint programs_schedule_mode_check
  check (schedule_mode in ('fixed_weekdays', 'cadence', 'flexible'));

alter table public.workouts
  add column if not exists sequence_index integer;

with ordered_workouts as (
  select
    id,
    row_number() over (
      partition by program_id
      order by scheduled_date, created_at, id
    ) - 1 as sequence_index
  from public.workouts
)
update public.workouts as workouts
set sequence_index = ordered_workouts.sequence_index
from ordered_workouts
where workouts.id = ordered_workouts.id
  and workouts.sequence_index is null;

alter table public.workouts
  alter column sequence_index set not null;

alter table public.workouts
  drop constraint if exists workouts_program_id_sequence_index_key;

alter table public.workouts
  add constraint workouts_program_id_sequence_index_key unique (program_id, sequence_index);

create index if not exists workouts_program_sequence_index_idx
  on public.workouts (program_id, sequence_index);
