begin;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000004101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'plan-integrity@example.test',
  'not-used',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.cfg_exercises (id, slug, name, category, default_increment, is_main_lift, training_direction)
values ('00000000-0000-0000-0000-000000004201', 'plan_integrity_press', 'Integrity press', 'strength', 2.5, true, 'push');

insert into public.plan_programs (id, user_id, name, template_type, schedule_mode, schedule_config, status, start_date, end_date)
values (
  '00000000-0000-0000-0000-000000004301',
  '00000000-0000-0000-0000-000000004101',
  'Integrity plan',
  'push_pull_squat',
  'cadence',
  '{"train_days":2,"rest_days":1}'::jsonb,
  'active',
  '2026-08-20',
  '2026-09-20'
);

-- The fixture mirrors the production defect: index order is 20 -> 22 -> 21.
-- Both chronology and continuity triggers are deferred until the repair completes.
insert into public.plan_workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values
  ('00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000004101', '2026-08-20', 0, 0, 'training', 'Completed source', 'completed'),
  ('00000000-0000-0000-0000-000000004402', '00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000004101', '2026-08-22', null, 1, 'rest', 'Recovery', 'scheduled'),
  ('00000000-0000-0000-0000-000000004403', '00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000004101', '2026-08-21', 1, 2, 'training', 'Next training', 'scheduled');

insert into public.plan_workout_exercises (id, workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values
  ('00000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000004201', 1, 1, 5, 60),
  ('00000000-0000-0000-0000-000000004502', '00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000004201', 2, 1, 5, 62.5);

insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
values
  ('00000000-0000-0000-0000-000000004501', 1, 60, 5, 60, 5, 6, true),
  ('00000000-0000-0000-0000-000000004502', 1, 62.5, 5, 62.5, 5, 6, true);

select has_function('public', 'repair_active_program_schedule_indexes', array[]::text[], 'active schedule repair function exists');
select is(has_function_privilege('authenticated', 'public.repair_active_program_schedule_indexes()', 'execute'), false, 'clients cannot execute schedule repair');
select has_function('public', 'deduplicate_pending_workout_recommendations', array[]::text[], 'pending Coach cleanup function exists');
select is(has_function_privilege('authenticated', 'public.deduplicate_pending_workout_recommendations()', 'execute'), false, 'clients cannot execute Coach cleanup');
select is(to_regclass('public.log_recommendations_one_pending_per_workout_exercise_idx') is not null, true, 'pending Coach partial unique index exists');

select is(public.repair_active_program_schedule_indexes(), 2, 'active schedule repair rewrites the two misplaced indexes');
select is(
  (
    select count(*)
    from (
      select scheduled_date, lag(scheduled_date) over (order by schedule_index) as previous_date
      from public.plan_workouts
      where program_id = '00000000-0000-0000-0000-000000004301'
    ) ordered
    where previous_date is not null and scheduled_date < previous_date
  ),
  0::bigint,
  'active schedule repair keeps dates non-decreasing by index'
);
select is(
  (
    select count(*)
    from public.plan_workouts
    where id = '00000000-0000-0000-0000-000000004401'
      and scheduled_date = '2026-08-20'
      and sequence_index = 0
      and status = 'completed'
      and name = 'Completed source'
  ),
  1::bigint,
  'completed workout facts remain unchanged by schedule repair'
);
select is((select schedule_revision from public.plan_programs where id = '00000000-0000-0000-0000-000000004301'), 2, 'schedule repair increments revision once');
select is(public.repair_active_program_schedule_indexes(), 0, 'schedule repair is idempotent');

set constraints workouts_require_schedule_date_order immediate;
select throws_ok(
  $$update public.plan_workouts set scheduled_date = '2026-08-19' where id = '00000000-0000-0000-0000-000000004402'$$,
  '23514',
  'Workout scheduled dates must follow schedule_index',
  'out-of-order schedule writes are rejected'
);
set constraints workouts_require_schedule_date_order deferred;

drop index public.log_recommendations_one_pending_per_workout_exercise_idx;
insert into public.log_recommendations (id, user_id, exercise_id, workout_id, recommendation_type, previous_weight, suggested_weight, reason, status, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000004601', '00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004401', 'increase', 62.5, 65, 'duplicate old', 'pending', now() - interval '1 minute', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000004602', '00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004401', 'increase', 62.5, 65, 'duplicate new', 'pending', now(), now());

select is(public.deduplicate_pending_workout_recommendations(), 1, 'duplicate pending Coach suggestions are collapsed');
select is(
  (select count(*) from public.log_recommendations where workout_id = '00000000-0000-0000-0000-000000004401' and exercise_id = '00000000-0000-0000-0000-000000004201' and status = 'pending'),
  1::bigint,
  'Coach cleanup leaves one pending suggestion'
);

create unique index log_recommendations_one_pending_per_workout_exercise_idx
  on public.log_recommendations (user_id, workout_id, exercise_id)
  where status = 'pending' and workout_id is not null;

select is(jsonb_array_length(public.replace_pending_workout_recommendations('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004401')), 1, 'one action receives one Coach suggestion even with two prescriptions');
select is(jsonb_array_length(public.replace_pending_workout_recommendations('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004401')), 1, 'repeated Coach generation stays idempotent');
select is(
  (select count(*) from public.log_recommendations where workout_id = '00000000-0000-0000-0000-000000004401' and exercise_id = '00000000-0000-0000-0000-000000004201' and status = 'pending'),
  1::bigint,
  'repeated Coach generation persists one pending row'
);

select * from finish();
rollback;
