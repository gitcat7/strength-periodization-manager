begin;

select plan(25);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task4-owner@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task4-other@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.programs (id, user_id, name, template_type, status, start_date, end_date)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 'Current scope', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', 'Remaining scope', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000401', 'Inactive program', 'push_pull_squat', 'archived', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000402', 'Other user', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31');

insert into public.workouts (id, program_id, user_id, scheduled_date, name, status)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Current', 'scheduled'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Remaining start', 'scheduled'),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-18', 'Remaining future', 'scheduled'),
  ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-20', 'Remaining draft', 'draft'),
  ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-04', 'Past', 'scheduled'),
  ('00000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-25', 'Completed', 'completed'),
  ('00000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-26', 'Skipped', 'skipped'),
  ('00000000-0000-0000-0000-000000000608', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Inactive', 'scheduled'),
  ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-12', 'Rejected', 'scheduled'),
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-13', 'Completed set', 'scheduled'),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000402', '2026-07-11', 'Other user', 'scheduled');

insert into public.workout_exercises (id, workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000601', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000602', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000603', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000604', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000605', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-000000000606', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000707', '00000000-0000-0000-0000-000000000607', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000708', '00000000-0000-0000-0000-000000000602', (select id from public.exercises where slug = 'lateral_raise'), 4, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000709', '00000000-0000-0000-0000-000000000608', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 1, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 2, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000606', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000714', '00000000-0000-0000-0000-000000000607', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000715', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'bench_press'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000716', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'cardio_zone2'), 3, 1, 30, 0),
  ('00000000-0000-0000-0000-000000000717', '00000000-0000-0000-0000-000000000610', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000718', '00000000-0000-0000-0000-000000000611', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50);

insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, completed)
values
  ('00000000-0000-0000-0000-000000000701', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000701', 2, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000717', 1, 12.50, 12, true),
  ('00000000-0000-0000-0000-000000000717', 2, 12.50, 12, false);

select has_function(
  'public',
  'substitute_workout_exercise',
  array['uuid', 'uuid', 'workout_exercise_substitution_scope'],
  'substitution RPC exists with its public contract'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select results_eq(
  $$
    select affected_count
    from public.substitute_workout_exercise(
      '00000000-0000-0000-0000-000000000701',
      (select id from public.exercises where slug = 'cable_lateral_raise'),
      'current_workout'
    )
  $$,
  $$ values (1::integer) $$,
  'current_workout returns exactly the selected workout exercise'
);

select is(
  (select exercise_id from public.workout_exercises where id = '00000000-0000-0000-0000-000000000701'),
  (select id from public.exercises where slug = 'cable_lateral_raise'),
  'current_workout changes the selected exercise'
);

select results_eq(
  $$
    select target_sets, target_reps, target_weight
    from public.workout_exercises
    where id = '00000000-0000-0000-0000-000000000701'
  $$,
  $$ values (3::integer, 12::integer, 0::numeric) $$,
  'current_workout preserves sets and reps while resetting weight'
);

select is(
  (select count(*) from public.set_logs where workout_exercise_id = '00000000-0000-0000-0000-000000000701'),
  0::bigint,
  'current_workout deletes incomplete pre-created logs'
);

select results_eq(
  $$
    select affected_count
    from public.substitute_workout_exercise(
      '00000000-0000-0000-0000-000000000702',
      (select id from public.exercises where slug = 'cable_lateral_raise'),
      'remaining_program'
    )
  $$,
  $$ values (3::integer) $$,
  'remaining_program returns current and future scheduled or draft matches only'
);

select is(
  (
    select count(*)
    from public.workout_exercises
    where id in (
      '00000000-0000-0000-0000-000000000702',
      '00000000-0000-0000-0000-000000000703',
      '00000000-0000-0000-0000-000000000704'
    )
      and exercise_id = (select id from public.exercises where slug = 'cable_lateral_raise')
      and target_weight = 0
  ),
  3::bigint,
  'remaining_program changes every eligible row and resets each weight'
);

select results_eq(
  $$
    select target_sets, target_reps
    from public.workout_exercises
    where id = '00000000-0000-0000-0000-000000000703'
  $$,
  $$ values (4::integer, 15::integer) $$,
  'remaining_program preserves sets and reps'
);

select is(
  (
    select count(*)
    from public.workout_exercises
    where id in (
      '00000000-0000-0000-0000-000000000705',
      '00000000-0000-0000-0000-000000000706',
      '00000000-0000-0000-0000-000000000707',
      '00000000-0000-0000-0000-000000000708'
    )
      and exercise_id = (select id from public.exercises where slug = 'lateral_raise')
  ),
  4::bigint,
  'remaining_program excludes past, completed, skipped, and different-position rows'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Authentication required',
  'unauthenticated callers are rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'a different user cannot substitute the owner exercise'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000709', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'inactive programs are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000711', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'position one is protected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000712', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'position two is protected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000713', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'completed workouts are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000714', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'skipped workouts are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000715', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'disabled sources are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000716', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Source exercise is not eligible for substitution',
  'unmapped sources are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_biceps_curl'), 'current_workout') $$,
  'P0001',
  'Target exercise has an incompatible training direction',
  'targets with another training direction are rejected'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'triceps_pushdown'), 'current_workout') $$,
  'P0001',
  'Target exercise has an incompatible movement pattern',
  'targets with another movement pattern are rejected'
);

reset role;
update public.exercises set substitution_enabled = false where slug = 'cable_lateral_raise';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Target exercise is not eligible for substitution',
  'disabled targets are rejected'
);

reset role;
update public.exercises set substitution_enabled = true where slug = 'cable_lateral_raise';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'lateral_raise'), 'current_workout') $$,
  'P0001',
  'Target exercise must differ from the source exercise',
  'the current exercise cannot replace itself'
);

select throws_ok(
  $$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000717', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$,
  'P0001',
  'Completed sets cannot be substituted',
  'a completed set rejects the entire substitution'
);

select is(
  (select exercise_id from public.workout_exercises where id = '00000000-0000-0000-0000-000000000717'),
  (select id from public.exercises where slug = 'lateral_raise'),
  'completed-set rejection preserves the source exercise'
);

select is(
  (select count(*) from public.set_logs where workout_exercise_id = '00000000-0000-0000-0000-000000000717'),
  2::bigint,
  'completed-set rejection preserves every log for rollback safety'
);

select * from finish();
rollback;
