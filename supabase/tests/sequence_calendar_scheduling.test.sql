begin;

select plan(20);

-- The fixture authenticates with request.jwt.claim.sub, so it deliberately avoids
-- auth confirmation timestamp columns that differ between Supabase releases.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reflow-owner@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reflow-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.plan_programs (id, user_id, name, template_type, schedule_mode, status, start_date, end_date)
values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', 'Reflow owner plan', 'three_split', 'cadence', 'active', '2026-08-01', '2026-09-30'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002102', 'Reflow other plan', 'three_split', 'cadence', 'active', '2026-08-01', '2026-09-30'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002101', 'Reflow archived plan', 'three_split', 'cadence', 'archived', '2026-08-01', '2026-09-30');

insert into public.plan_workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values
  ('00000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', '2026-08-01', 0, 0, 'training', 'Completed workout', 'completed'),
  ('00000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', '2026-08-03', 1, 1, 'training', 'Draft workout', 'draft'),
  ('00000000-0000-0000-0000-000000002403', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', '2026-08-05', 2, 2, 'training', 'Pending skip target', 'scheduled'),
  ('00000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', '2026-08-07', 3, 3, 'training', 'Pending move target', 'scheduled'),
  ('00000000-0000-0000-0000-000000002405', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002101', '2026-08-06', null, 4, 'rest', 'Pending rest', 'scheduled'),
  ('00000000-0000-0000-0000-000000002406', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002102', '2026-08-05', 0, 0, 'training', 'Other user pending', 'scheduled');

select has_function('public', 'reflow_program_schedule', array['jsonb'], 'atomic schedule reflow RPC exists');
select is(has_function_privilege('anon', 'public.reflow_program_schedule(jsonb)', 'execute'), false, 'anon cannot execute the reflow RPC');
select is(has_function_privilege('authenticated', 'public.reflow_program_schedule(jsonb)', 'execute'), true, 'authenticated can execute the reflow RPC');

create temporary table reflow_result (doc jsonb);
grant all on table reflow_result to authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002101', true);
set local role authenticated;

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":99,"action":"resume","resume_route":"start_next_cycle","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Schedule changed; refresh before confirming', 'stale revision is rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002999","expected_revision":1,"action":"extra_rest","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Program not found', 'a missing program is rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002003","expected_revision":1,"action":"extra_rest","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Program not found', 'an archived program is rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":1,"action":"delete_everything","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Schedule reflow payload is invalid', 'an unknown action is rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":1,"action":"resume","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Resume requires an explicit route', 'resume without a user-selected route is rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":1,"action":"extra_rest","effective_date":"2026-08-20","schedule_items":[{"workout_id":"00000000-0000-0000-0000-000000002401","scheduled_date":"2026-08-09","schedule_index":5,"sequence_index":0,"day_type":"training","status":"scheduled"}]}'::jsonb)$$,
  'P0001', 'Completed or draft training cannot be rescheduled', 'completed training rows are protected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"0000-0000-0000-0000-000000002001","expected_revision":1,"action":"extra_rest","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Schedule reflow payload is invalid', 'malformed program ids are rejected'
);

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":1,"action":"extra_rest","effective_date":"2026-08-20","schedule_items":[{"workout_id":"00000000-0000-0000-0000-000000002402","scheduled_date":"2026-08-09","schedule_index":5,"sequence_index":1,"day_type":"training","status":"scheduled"}]}'::jsonb)$$,
  'P0001', 'Completed or draft training cannot be rescheduled', 'draft training rows are protected'
);

insert into reflow_result
select public.reflow_program_schedule('{
  "program_id": "00000000-0000-0000-0000-000000002001",
  "expected_revision": 1,
  "action": "resume",
  "resume_route": "start_next_cycle",
  "reason": "fatigue",
  "effective_date": "2026-08-20",
  "schedule_items": [
    {"workout_id": "00000000-0000-0000-0000-000000002403", "scheduled_date": "2026-08-05", "schedule_index": 2, "sequence_index": 2, "day_type": "training", "status": "skipped", "skip_reason": "recovery_strategy"},
    {"workout_id": "00000000-0000-0000-0000-000000002404", "scheduled_date": "2026-08-23", "schedule_index": 4, "sequence_index": 3, "day_type": "training", "status": "scheduled"},
    {"workout_id": "00000000-0000-0000-0000-000000002405", "scheduled_date": "2026-08-22", "schedule_index": 3, "sequence_index": null, "day_type": "rest", "status": "scheduled"}
  ]
}'::jsonb);

select is((select doc ->> 'schedule_revision' from reflow_result), '2', 'reflow returns the incremented revision');
select is((select schedule_revision from public.plan_programs where id = '00000000-0000-0000-0000-000000002001'), 2, 'program revision increments exactly once');
select is((select doc #>> '{next_workout,id}' from reflow_result), '00000000-0000-0000-0000-000000002404', 'reflow returns the next pending workout');

select is(
  (select count(*) from public.plan_workouts where id = '00000000-0000-0000-0000-000000002403' and status = 'skipped' and skip_reason = 'recovery_strategy'),
  1::bigint,
  'supplied skipped items become recovery strategy skips'
);

select is(
  (select count(*) from public.plan_workouts where id = '00000000-0000-0000-0000-000000002404' and status = 'scheduled' and scheduled_date = '2026-08-23'),
  1::bigint,
  'pending scheduled items move to the domain-computed dates'
);

select is(
  (select count(*) from public.plan_workouts where id = '00000000-0000-0000-0000-000000002404' and schedule_index = 4)
  + (select count(*) from public.plan_workouts where id = '00000000-0000-0000-0000-000000002405' and schedule_index = 3),
  2::bigint,
  'swapped schedule indexes remain unique after reflow'
);

select is(
  (select count(*) from public.ops_schedule_events where program_id = '00000000-0000-0000-0000-000000002001'),
  1::bigint,
  'exactly one audit event is inserted per reflow'
);

select is(
  (select count(*) from public.ops_schedule_events where program_id = '00000000-0000-0000-0000-000000002001' and event_type = 'resume_confirmed' and schedule_revision = 2 and metadata ->> 'resume_route' = 'start_next_cycle' and metadata ->> 'reason' = 'fatigue'),
  1::bigint,
  'the audit event carries sanitized structured metadata'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002102', true);
set local role authenticated;

select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":2,"action":"extra_rest","effective_date":"2026-08-21","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Program not found', 'another user cannot reflow a foreign program'
);

reset role;

select * from finish();
rollback;
