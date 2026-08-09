-- Reflow can swap adjacent schedule indexes in one transaction. Defer the
-- uniqueness check until commit so intermediate row updates cannot collide.
alter table public.plan_workouts
  drop constraint if exists plan_workouts_program_id_schedule_index_key,
  drop constraint if exists workouts_program_schedule_index_key,
  drop constraint if exists plan_workouts_program_schedule_index_key,
  add constraint plan_workouts_program_schedule_index_key
    unique (program_id, schedule_index) deferrable initially deferred;
