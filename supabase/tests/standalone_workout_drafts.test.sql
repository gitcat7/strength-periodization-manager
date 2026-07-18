begin;

select plan(21);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'standalone-owner@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'standalone-other@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.exercises (id, slug, name, category, default_increment, is_main_lift)
values ('00000000-0000-0000-0000-000000003201', 'standalone_draft_test_exercise', 'Standalone draft test exercise', 'push', 1, false);

insert into public.programs (id, user_id, name, template_type, status, start_date, end_date)
values ('00000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003101', 'Standalone owner active plan', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31');

insert into public.workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values ('00000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003101', '2026-07-01', 0, 0, 'training', 'Active program next', 'scheduled');

select has_function('public', 'save_standalone_workout', array['jsonb'], 'draft save RPC exists');
select has_function('public', 'get_standalone_workout_draft', array[]::text[], 'draft read RPC exists');
select is(has_function_privilege('anon', 'public.save_standalone_workout(jsonb)', 'execute'), false, 'anon cannot save standalone drafts');
select is(has_function_privilege('authenticated', 'public.save_standalone_workout(jsonb)', 'execute'), true, 'authenticated can save standalone drafts');

create temporary table standalone_test_state (workout_id uuid not null);
grant all on table standalone_test_state to authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);
set local role authenticated;
insert into standalone_test_state
select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"draft","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","sets":[{"weight":"50","reps":"5","rpe":"8","completed":true}]}]}'::jsonb);
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000003101' and program_id is null and status = 'draft'), 1::bigint, 'first draft save creates one standalone workout');
select is((select program_id is null from public.workouts where id = (select workout_id from standalone_test_state)), true, 'standalone draft never creates a program');
select is((select count(*) from public.workouts where program_id = '00000000-0000-0000-0000-000000003301' and status in ('scheduled', 'draft')), 1::bigint, 'standalone draft does not change the active program next session');

select public.save_standalone_workout(jsonb_build_object(
  'workout_id', (select workout_id from standalone_test_state),
  'scheduled_date', '2026-07-16', 'status', 'draft',
  'exercises', jsonb_build_array(jsonb_build_object('exercise_id', '00000000-0000-0000-0000-000000003201', 'sets', jsonb_build_array(
    jsonb_build_object('weight', '55', 'reps', '5', 'rpe', '8', 'completed', true),
    jsonb_build_object('weight', '55', 'reps', '5', 'rpe', '8', 'completed', false)
  )))
));
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000003101' and program_id is null and status = 'draft'), 1::bigint, 'later draft save updates instead of inserting another workout');
select is((select count(*) from public.set_logs where workout_exercise_id in (select id from public.workout_exercises where workout_id = (select workout_id from standalone_test_state))), 2::bigint, 'draft update replaces the saved set rows');
select is((select get_standalone_workout_draft() ->> 'workout_id'), (select workout_id::text from standalone_test_state), 'opening the recorder restores the caller draft');
select throws_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"draft","exercises":[]}'::jsonb)$$,
  'P0001',
  'invalid draft payload is rejected'
);
select throws_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"draft","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000003201","sets":[{"weight":"NaN","reps":"5","rpe":"8","completed":true}]}]}'::jsonb)$$,
  'P0001',
  'invalid NaN weight is rejected'
);
select public.save_standalone_workout(jsonb_build_object(
  'workout_id', (select workout_id from standalone_test_state),
  'scheduled_date', '2026-07-16', 'status', 'draft',
  'exercises', jsonb_build_array(jsonb_build_object(
    'exercise_id', null,
    'exercise_provider', 'manual',
    'external_exercise_id', 'manual:00000000-0000-4000-8000-000000000001',
    'exercise_name_snapshot', '酒店健身房划船',
    'exercise_metadata_snapshot', jsonb_build_object('equipment', jsonb_build_array('哑铃'), 'muscles', jsonb_build_array('背部'), 'loadType', 'weighted'),
    'sets', jsonb_build_array(jsonb_build_object('weight', '20', 'reps', '10', 'rpe', '7', 'completed', true))
  ))
));
select is((select exercise_provider from public.workout_exercises where workout_id = (select workout_id from standalone_test_state)), 'manual', 'manual action is stored only as a workout snapshot');
select is((select exercise_name_snapshot from public.workout_exercises where workout_id = (select workout_id from standalone_test_state)), '酒店健身房划船', 'manual snapshot preserves a readable user-provided name');
select throws_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"completed","exercises":[{"exercise_provider":"manual","external_exercise_id":"manual:00000000-0000-4000-8000-000000000001","exercise_name_snapshot":"徒手划船","exercise_metadata_snapshot":{"equipment":[],"muscles":[],"loadType":"bodyweight"},"sets":[{"weight":"","reps":"","rpe":"7","completed":true}]}]}'::jsonb)$$,
  'P0001',
  'completed standalone set requires repetitions'
);
select lives_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"completed","exercises":[{"exercise_provider":"reviewed","external_exercise_id":"reviewed:treadmill-run","exercise_name_snapshot":"跑步机跑步","exercise_metadata_snapshot":{"equipment":["跑步机"],"muscles":["股四头肌"],"loadType":"bodyweight","movementPattern":"有氧跑步","riskLevel":"standard"},"sets":[{"weight":"","reps":"30","rpe":"","completed":true}]}]}'::jsonb)$$,
  'reviewed cardio can omit RPE'
);
select throws_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"completed","exercises":[{"exercise_provider":"reviewed","external_exercise_id":"reviewed:treadmill-run","exercise_name_snapshot":"跑步机跑步","exercise_metadata_snapshot":{"equipment":["跑步机"],"muscles":["股四头肌"],"loadType":"bodyweight","movementPattern":"水平推","riskLevel":"standard"},"sets":[{"weight":"","reps":"30","rpe":"","completed":true}]}]}'::jsonb)$$,
  'P0001',
  'untrusted reviewed metadata cannot omit RPE'
);
select throws_ok(
  $$select public.save_standalone_workout('{"scheduled_date":"2026-07-16","status":"completed","exercises":[{"exercise_provider":"reviewed","external_exercise_id":"reviewed:barbell-bench-press","exercise_name_snapshot":"杠铃卧推","exercise_metadata_snapshot":{"equipment":["杠铃"],"muscles":["胸大肌"],"loadType":"bodyweight","movementPattern":"水平推","riskLevel":"technical"},"sets":[{"weight":"","reps":"8","rpe":"7","completed":true}]}]}'::jsonb)$$,
  'P0001',
  'reviewed strength action cannot spoof a bodyweight load type'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003102', true);
set local role authenticated;
select is(public.get_standalone_workout_draft(), null::jsonb, 'another user cannot read the owner draft');
select throws_ok(
  format(
    'select public.save_standalone_workout(%L::jsonb)',
    jsonb_build_object(
      'workout_id', (select workout_id::text from standalone_test_state),
      'scheduled_date', '2026-07-16', 'status', 'draft',
      'exercises', jsonb_build_array(jsonb_build_object('exercise_id', '00000000-0000-0000-0000-000000003201', 'sets', jsonb_build_array(jsonb_build_object('weight', '50', 'reps', '5', 'rpe', '8', 'completed', true))))
    )::text
  ),
  'P0001',
  'another user cannot update a standalone draft they do not own'
);
reset role;

select * from finish();
rollback;
