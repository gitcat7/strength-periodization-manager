begin;

select plan(43);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task4-owner@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'task4-other@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.programs (id, user_id, name, template_type, status, start_date, end_date)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 'Current scope', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', 'Remaining scope', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000401', 'Inactive program', 'push_pull_squat', 'archived', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000402', 'Other user', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000401', 'Remaining rollback', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31');

insert into public.workouts (id, program_id, user_id, scheduled_date, name, status)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Current', 'scheduled'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Remaining start', 'scheduled'),
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Remaining same date', 'scheduled'),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-18', 'Remaining future', 'scheduled'),
  ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-20', 'Remaining draft', 'draft'),
  ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-04', 'Past', 'scheduled'),
  ('00000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-25', 'Completed', 'completed'),
  ('00000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000401', '2026-07-26', 'Skipped', 'skipped'),
  ('00000000-0000-0000-0000-000000000608', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Inactive', 'scheduled'),
  ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-12', 'Rejected', 'scheduled'),
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '2026-07-13', 'Completed set', 'scheduled'),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000402', '2026-07-11', 'Other user', 'scheduled'),
  ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000402', '2026-07-14', 'Mixed owner', 'scheduled'),
  ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000401', '2026-07-11', 'Rollback start', 'scheduled'),
  ('00000000-0000-0000-0000-000000000615', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000401', '2026-07-12', 'Rollback future', 'scheduled');

insert into public.workout_exercises (id, workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000601', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000602', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000719', '00000000-0000-0000-0000-000000000612', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000603', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000604', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000605', (select id from public.exercises where slug = 'lateral_raise'), 3, 4, 15, 10.00),
  ('00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000606', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000714', '00000000-0000-0000-0000-000000000607', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000709', '00000000-0000-0000-0000-000000000608', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 1, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'lateral_raise'), 2, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000715', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'bench_press'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000716', '00000000-0000-0000-0000-000000000609', (select id from public.exercises where slug = 'cardio_zone2'), 3, 1, 30, 0),
  ('00000000-0000-0000-0000-000000000717', '00000000-0000-0000-0000-000000000610', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000718', '00000000-0000-0000-0000-000000000611', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000720', '00000000-0000-0000-0000-000000000613', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000614', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50),
  ('00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000615', (select id from public.exercises where slug = 'lateral_raise'), 3, 3, 12, 12.50);

insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, completed)
values
  ('00000000-0000-0000-0000-000000000701', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000701', 2, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000709', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000710', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000711', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000712', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000713', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000714', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000715', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000716', 1, 0, 30, false),
  ('00000000-0000-0000-0000-000000000717', 1, 12.50, 12, true),
  ('00000000-0000-0000-0000-000000000717', 2, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000720', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000721', 1, 12.50, 12, false),
  ('00000000-0000-0000-0000-000000000722', 1, 12.50, 12, true);

create function pg_temp.exercise_state(p_workout_exercise_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'exercise_id', we.exercise_id,
    'target_weight', we.target_weight,
    'target_sets', we.target_sets,
    'target_reps', we.target_reps,
    'log_count', (select count(*) from public.set_logs as sl where sl.workout_exercise_id = we.id)
  )
  from public.workout_exercises as we
  where we.id = p_workout_exercise_id
$$;

select has_function('public', 'substitute_workout_exercise', array['uuid', 'uuid', 'workout_exercise_substitution_scope'], 'substitution RPC exists with its public contract');
select is(has_function_privilege('public', 'public.substitute_workout_exercise(uuid, uuid, public.workout_exercise_substitution_scope)', 'execute'), false, 'PUBLIC cannot execute the substitution RPC');
select is(has_function_privilege('anon', 'public.substitute_workout_exercise(uuid, uuid, public.workout_exercise_substitution_scope)', 'execute'), false, 'anon cannot execute the substitution RPC');
select is(has_function_privilege('authenticated', 'public.substitute_workout_exercise(uuid, uuid, public.workout_exercise_substitution_scope)', 'execute'), true, 'authenticated can execute the substitution RPC');
select is((select count(*) from public.exercises where training_direction is not null and training_direction not in ('push', 'pull', 'squat', 'cardio')), 0::bigint, 'reviewed catalog metadata uses only allowed directions');
select throws_ok($$ insert into public.exercises (slug, name, category, default_increment, is_main_lift, training_direction) values ('invalid_direction_test', 'Invalid', 'push', 1, false, 'invalid') $$, '23514', 'new row for relation "exercises" violates check constraint "exercises_training_direction_check"', 'training direction constraint rejects invalid metadata');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select results_eq($$ select affected_ids, affected_count from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000701', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, $$ values (array['00000000-0000-0000-0000-000000000701'::uuid], 1::integer) $$, 'current_workout returns its exact sorted affected ID array');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000701'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'cable_lateral_raise'), 'target_weight', 0::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 0), 'current_workout preserves prescription and deletes incomplete logs');

select results_eq($$ select affected_ids, affected_count from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000702', (select id from public.exercises where slug = 'cable_lateral_raise'), 'remaining_program') $$, $$ values (array['00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000703'::uuid, '00000000-0000-0000-0000-000000000704'::uuid, '00000000-0000-0000-0000-000000000719'::uuid], 4::integer) $$, 'remaining_program returns the exact sorted current, same-date, and future ID array');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000719'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'cable_lateral_raise'), 'target_weight', 0::numeric, 'target_sets', 4, 'target_reps', 15, 'log_count', 0), 'remaining_program includes a matching workout on the source date');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000705'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 10.00::numeric, 'target_sets', 4, 'target_reps', 15, 'log_count', 0), 'remaining_program excludes past workouts');

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Authentication required', 'unauthenticated callers are rejected');
reset role;
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'unauthenticated rejection leaves exercise, weight, and logs unchanged');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'cross-user callers are rejected');
reset role;
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'cross-user rejection leaves exercise, weight, and logs unchanged');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000720', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'an owner cannot substitute a mixed-owner workout attached to the owner program');
reset role;
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000720'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'mixed-owner rejection leaves exercise, weight, and logs unchanged');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000709', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'inactive programs are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000709'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'inactive-program rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000713', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'completed workouts are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000713'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'completed-workout rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000714', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'skipped workouts are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000714'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'skipped-workout rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000711', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'position one is protected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000711'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'position-one rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000712', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'position two is protected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000712'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'position-two rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000715', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'disabled sources are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000715'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'bench_press'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'disabled-source rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000716', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Source exercise is not eligible for substitution', 'unmapped sources are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000716'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'cardio_zone2'), 'target_weight', 0::numeric, 'target_sets', 1, 'target_reps', 30, 'log_count', 1), 'unmapped-source rejection leaves exercise, weight, and logs unchanged');

reset role;
update public.exercises set substitution_enabled = false where slug = 'cable_lateral_raise';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Target exercise is not eligible for substitution', 'disabled targets are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'disabled-target rejection leaves exercise, weight, and logs unchanged');

reset role;
update public.exercises set substitution_enabled = true where slug = 'cable_lateral_raise';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'lateral_raise'), 'current_workout') $$, 'P0001', 'Target exercise must differ from the source exercise', 'the current exercise cannot replace itself');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'same-target rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'cable_biceps_curl'), 'current_workout') $$, 'P0001', 'Target exercise has an incompatible training direction', 'targets with another training direction are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'direction-mismatch rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000710', (select id from public.exercises where slug = 'triceps_pushdown'), 'current_workout') $$, 'P0001', 'Target exercise has an incompatible movement pattern', 'targets with another movement pattern are rejected');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000710'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'pattern-mismatch rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000717', (select id from public.exercises where slug = 'cable_lateral_raise'), 'current_workout') $$, 'P0001', 'Completed sets cannot be substituted', 'a completed set rejects the entire substitution');
select is(pg_temp.exercise_state('00000000-0000-0000-0000-000000000717'), jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 2), 'completed-set rejection leaves exercise, weight, and logs unchanged');
select throws_ok($$ select * from public.substitute_workout_exercise('00000000-0000-0000-0000-000000000721', (select id from public.exercises where slug = 'cable_lateral_raise'), 'remaining_program') $$, 'P0001', 'Completed sets cannot be substituted', 'a completed set in a remaining-program row rolls back the entire scope');
select is(jsonb_build_object('source', pg_temp.exercise_state('00000000-0000-0000-0000-000000000721'), 'future', pg_temp.exercise_state('00000000-0000-0000-0000-000000000722')), jsonb_build_object('source', jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1), 'future', jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'lateral_raise'), 'target_weight', 12.50::numeric, 'target_sets', 3, 'target_reps', 12, 'log_count', 1)), 'remaining-program rejection leaves every affected exercise, weight, and log unchanged');

select * from finish();
rollback;
