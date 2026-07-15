begin;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rest-owner@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rest-other@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.exercises (id, slug, name, category, default_increment, is_main_lift)
values ('00000000-0000-0000-0000-000000002101', 'rest_day_test_exercise', 'Rest day test exercise', 'push', 1, false);

insert into public.programs (id, user_id, name, template_type, status, start_date, end_date)
values
  ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', 'Owner old plan', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31'),
  ('00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002202', 'Other old plan', 'push_pull_squat', 'active', '2026-07-01', '2026-07-31');

insert into public.workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values
  ('00000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-01', 0, 0, 'training', 'Old owner workout', 'scheduled'),
  ('00000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002202', '2026-07-01', 0, 0, 'training', 'Old other workout', 'scheduled');

select has_function('public', 'replace_active_program', array['jsonb'], 'atomic program replacement RPC exists');
select is(
  exists (
    select 1
    from pg_proc as proc
    cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) as acl
    where proc.oid = 'public.replace_active_program(jsonb)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  false,
  'PUBLIC cannot execute the replacement RPC'
);
select is(has_function_privilege('anon', 'public.replace_active_program(jsonb)', 'execute'), false, 'anon cannot execute the replacement RPC');
select is(has_function_privilege('authenticated', 'public.replace_active_program(jsonb)', 'execute'), true, 'authenticated can execute the replacement RPC');

select throws_ok(
  $$insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name)
      values ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-02', 1, 0, 'training', 'Duplicate schedule')$$,
  '23505',
  'duplicate program schedule index is rejected'
);

insert into public.workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name)
values
  ('00000000-0000-0000-0000-000000002403', '00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-02', null, 1, 'rest', 'Rest one'),
  ('00000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-03', null, 2, 'rest', 'Rest two');

select is((select count(*) from public.workouts where program_id = '00000000-0000-0000-0000-000000002301' and sequence_index is null), 2::bigint, 'multiple rest rows may have null sequence indexes');
select throws_ok(
  $$insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name)
      values ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-04', null, 3, 'training', 'Invalid training')$$,
  '23514',
  'training schedule items require a sequence index'
);
select throws_ok(
  $$insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
      values ('00000000-0000-0000-0000-000000002403', '00000000-0000-0000-0000-000000002101', 1, 3, 8, 20)$$,
  'P0001',
  'rest schedule items reject exercise prescriptions'
);

insert into public.workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name)
values ('00000000-0000-0000-0000-000000002405', '00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002201', '2026-07-04', 1, 3, 'training', 'Training with prescription');
insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values ('00000000-0000-0000-0000-000000002405', '00000000-0000-0000-0000-000000002101', 1, 3, 8, 20);
select throws_ok(
  $$update public.workouts set day_type = 'rest', sequence_index = null where id = '00000000-0000-0000-0000-000000002405'$$,
  'P0001',
  'training days with prescriptions cannot become rest schedule items'
);

set constraints workouts_require_continuous_schedule_index immediate;
select throws_ok(
  $$update public.workouts
      set program_id = '00000000-0000-0000-0000-000000002302',
          user_id = '00000000-0000-0000-0000-000000002202'
      where id = '00000000-0000-0000-0000-000000002403'$$,
  '23514',
  'moving a schedule item validates the prior program continuity'
);
set constraints workouts_require_continuous_schedule_index deferred;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002201', true);
set local role authenticated;

select throws_ok(
  $$select * from public.replace_active_program('{"name":"Broken replacement","template_type":"push_pull_squat","schedule_mode":"cadence","schedule_config":{},"start_date":"2026-07-15","end_date":"2026-08-15","schedule_items":[{"scheduled_date":"2026-07-15","schedule_index":0,"sequence_index":0,"day_type":"training","name":"Broken training","exercises":[]}]}'::jsonb)$$,
  'P0001',
  'invalid replacement payload is rejected'
);
reset role;
select is((select status from public.programs where id = '00000000-0000-0000-0000-000000002301'), 'active', 'invalid replacement leaves the old active program active');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002201', true);
set local role authenticated;
select throws_ok(
  $$select * from public.replace_active_program('{"name":"Mid-flight failure","template_type":"push_pull_squat","schedule_mode":"cadence","schedule_config":{},"start_date":"2026-07-15","end_date":"2026-08-15","schedule_items":[{"scheduled_date":"2026-07-15","schedule_index":0,"sequence_index":0,"day_type":"training","name":"First inserted training","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000002101","order_index":1,"target_sets":3,"target_reps":8,"target_weight":20}]},{"scheduled_date":"2026-07-16","schedule_index":1,"sequence_index":0,"day_type":"training","name":"Duplicate sequence training","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000002101","order_index":1,"target_sets":3,"target_reps":8,"target_weight":20}]}]}'::jsonb)$$,
  '23505',
  'replacement rolls back when a later schedule write fails'
);
reset role;
select is((select status from public.programs where id = '00000000-0000-0000-0000-000000002301'), 'active', 'mid-flight failure leaves the old active program active');
select is((select count(*) from public.programs where user_id = '00000000-0000-0000-0000-000000002201' and name = 'Mid-flight failure'), 0::bigint, 'mid-flight failure leaves no replacement program');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002202', true);
set local role authenticated;
select throws_ok(
  $$insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name)
      values ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002202', '2026-07-04', 1, 3, 'training', 'Cross-user schedule')$$,
  '42501',
  'another user cannot add a schedule item to the owner program'
);
select results_eq(
  $$select training_days, rest_days from public.replace_active_program('{"name":"Other replacement","template_type":"push_pull_squat","schedule_mode":"cadence","schedule_config":{},"start_date":"2026-07-15","end_date":"2026-08-15","schedule_items":[{"scheduled_date":"2026-07-15","schedule_index":0,"sequence_index":0,"day_type":"training","name":"Other training","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000002101","order_index":1,"target_sets":3,"target_reps":8,"target_weight":20}]}]}'::jsonb)$$,
  $$values (1::integer, 0::integer)$$,
  'replacement uses only the authenticated caller as owner'
);
reset role;
select is((select status from public.programs where id = '00000000-0000-0000-0000-000000002301'), 'active', 'cross-user replacement attempt leaves owner plan active');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002201', true);
set local role authenticated;
select results_eq(
  $$select training_days, rest_days from public.replace_active_program('{"name":"Owner replacement","template_type":"push_pull_squat","custom_template_name":null,"schedule_mode":"cadence","schedule_config":{"workout_days":3},"start_date":"2026-07-15","end_date":"2026-08-15","schedule_items":[{"scheduled_date":"2026-07-15","schedule_index":0,"sequence_index":0,"day_type":"training","name":"Push A","exercises":[{"exercise_id":"00000000-0000-0000-0000-000000002101","order_index":1,"target_sets":3,"target_reps":8,"target_weight":20}]},{"scheduled_date":"2026-07-16","schedule_index":1,"sequence_index":null,"day_type":"rest","name":"Rest","exercises":[]}]}'::jsonb)$$,
  $$values (1::integer, 1::integer)$$,
  'replacement creates training and rest schedule rows'
);
reset role;
select is((select status from public.programs where id = '00000000-0000-0000-0000-000000002301'), 'archived', 'successful replacement archives the old active program last');
select is((select count(*) from public.workout_exercises as we join public.workouts as w on w.id = we.workout_id where w.user_id = '00000000-0000-0000-0000-000000002201' and w.day_type = 'rest'), 0::bigint, 'replacement creates no rest exercise prescriptions');
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000002201' and day_type = 'rest' and sequence_index is null), 3::bigint, 'rest schedule rows retain null sequence indexes');

select * from finish();
rollback;
