begin;

select plan(28);

select has_column('public', 'plan_workouts', 'prescription_revision', 'workout prescription revision exists');
select has_table('public', 'ops_workout_revision_events', 'workout revision audit table exists');
select has_function('public', 'revise_workout_prescription', array['uuid', 'integer', 'jsonb'], 'atomic prescription RPC exists');
select is(has_function_privilege('anon', 'public.revise_workout_prescription(uuid, integer, jsonb)', 'execute'), false, 'anon cannot execute prescription RPC');
select is(has_function_privilege('authenticated', 'public.revise_workout_prescription(uuid, integer, jsonb)', 'execute'), true, 'authenticated can execute prescription RPC');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prescription-owner@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prescription-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.cfg_exercises (id, slug, name, category, default_increment, is_main_lift, training_direction, movement_pattern, substitution_enabled)
values
  ('00000000-0000-0000-0000-000000003201', 'test-squat', '测试深蹲', 'strength', 2.5, true, 'squat', 'squat', true),
  ('00000000-0000-0000-0000-000000003202', 'test-front-squat', '测试前蹲', 'strength', 2.5, true, 'squat', 'squat', true),
  ('00000000-0000-0000-0000-000000003203', 'test-bench', '测试卧推', 'strength', 2.5, true, 'push', 'horizontal_push', true)
on conflict (id) do nothing;

insert into public.plan_programs (id, user_id, name, template_type, schedule_mode, status, start_date, end_date)
values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', 'Prescription owner plan', 'three_split', 'cadence', 'active', '2026-08-01', '2026-09-30'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000003102', 'Prescription other plan', 'three_split', 'cadence', 'active', '2026-08-01', '2026-09-30'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000003101', 'Prescription archived plan', 'three_split', 'cadence', 'archived', '2026-08-01', '2026-09-30');

insert into public.plan_workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values
  ('00000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-01', 0, 0, 'training', '待编辑深蹲', 'scheduled'),
  ('00000000-0000-0000-0000-000000003402', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-02', 1, 1, 'training', '草稿深蹲', 'draft'),
  ('00000000-0000-0000-0000-000000003403', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-03', 2, 2, 'training', '已完成深蹲', 'completed'),
  ('00000000-0000-0000-0000-000000003404', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-04', null, 3, 'rest', '休息日', 'scheduled'),
  ('00000000-0000-0000-0000-000000003405', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-05', 4, 4, 'training', '跳过深蹲', 'skipped'),
  ('00000000-0000-0000-0000-000000003406', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003101', '2026-08-06', 5, 5, 'training', '归档深蹲', 'scheduled'),
  ('00000000-0000-0000-0000-000000003407', '00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000003102', '2026-08-07', 0, 0, 'training', '他人深蹲', 'scheduled'),
  ('00000000-0000-0000-0000-000000003408', '00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000003101', '2026-08-08', 0, 0, 'training', '归档计划深蹲', 'scheduled');

update public.plan_workouts set program_id = '00000000-0000-0000-0000-000000003003' where id = '00000000-0000-0000-0000-000000003408';

insert into public.plan_workout_exercises (id, workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values
  ('00000000-0000-0000-0000-000000003501', '00000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003201', 1, 3, 5, 100),
  ('00000000-0000-0000-0000-000000003502', '00000000-0000-0000-0000-000000003403', '00000000-0000-0000-0000-000000003201', 1, 3, 5, 100),
  ('00000000-0000-0000-0000-000000003503', '00000000-0000-0000-0000-000000003402', '00000000-0000-0000-0000-000000003201', 1, 3, 5, 100);

insert into public.log_set_logs (id, workout_exercise_id, set_index, target_reps, target_weight, completed, actual_reps, actual_weight)
values
  ('00000000-0000-0000-0000-000000003601', '00000000-0000-0000-0000-000000003502', 1, 5, 100, true, 5, 100),
  ('00000000-0000-0000-0000-000000003602', '00000000-0000-0000-0000-000000003503', 1, 5, 100, true, 5, 100);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);
set local role authenticated;

select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003999', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout not found', 'missing workout is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003407', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout not found', 'another user workout is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003403', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout prescription can only be edited while pending', 'completed workout is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003404', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout prescription can only be edited while pending', 'rest day is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003405', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout prescription can only be edited while pending', 'skipped workout is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003408', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout not found', 'archived program workout is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003402', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Completed sets cannot be structurally edited', 'completed set is protected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 99, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout prescription revision is stale', 'stale revision is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[]}'::jsonb)$$, 'P0001', 'Workout prescription must contain 1 to 12 exercises', 'empty prescription is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100},{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":2,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout prescription has duplicate exercises', 'duplicate exercises are rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":2,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout prescription order indexes must be contiguous', 'noncontiguous order is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":0,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout prescription values are invalid', 'invalid values are rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5}]}'::jsonb)$$, 'P0001', 'Workout prescription values are invalid', 'missing weight is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003203","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout exercise direction is incompatible', 'direction mismatch is rejected');
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100,"exercise_provider":"external"}]}'::jsonb)$$, 'P0001', 'Only local cfg_exercises can be used', 'external exercise is rejected');

delete from public.log_set_logs where workout_exercise_id = '00000000-0000-0000-0000-000000003503';
delete from public.plan_workout_exercises where workout_id = '00000000-0000-0000-0000-000000003402';

create temporary table prescription_result (doc jsonb);
insert into prescription_result
select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003202","order_index":1,"target_sets":4,"target_reps":6,"target_weight":105}]}'::jsonb);

select is((select doc ->> 'prescription_revision' from prescription_result), '2', 'successful edit increments revision');
select is((select count(*) from public.plan_workout_exercises where workout_id = '00000000-0000-0000-0000-000000003401' and exercise_id = '00000000-0000-0000-0000-000000003202' and order_index = 1 and target_sets = 4 and target_reps = 6 and target_weight = 105), 1::bigint, 'successful edit replaces local prescription');

reset role;
select is((select count(*) from public.ops_workout_revision_events where workout_id = '00000000-0000-0000-0000-000000003401'), 1::bigint, 'successful edit writes one audit event');
select is((select count(*) from public.plan_workouts where id = '00000000-0000-0000-0000-000000003401' and prescription_revision = 2), 1::bigint, 'stored revision is incremented');

set local role authenticated;
select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":100}]}'::jsonb)$$, 'P0001', 'Workout prescription revision is stale', 'old revision cannot overwrite new prescription');

select throws_ok($$select public.revise_workout_prescription('00000000-0000-0000-0000-000000003401', 2, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003202","order_index":1,"target_sets":4,"target_reps":6,"target_weight":105},{"exercise_id":"00000000-0000-0000-0000-000000003203","order_index":2,"target_sets":4,"target_reps":6,"target_weight":105}]}'::jsonb)$$, 'P0001', 'Workout exercise direction is incompatible', 'invalid second item rolls back the complete edit');
select is((select prescription_revision from public.plan_workouts where id = '00000000-0000-0000-0000-000000003401'), 2, 'failed edit leaves revision unchanged');
select is((select count(*) from public.plan_workout_exercises where workout_id = '00000000-0000-0000-0000-000000003401'), 1::bigint, 'failed edit leaves rows unchanged');

select * from finish();
rollback;
