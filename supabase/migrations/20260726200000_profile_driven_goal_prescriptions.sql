alter table public.usr_athlete_profiles
  add column if not exists current_body_weight_kg numeric(6, 2)
    check (current_body_weight_kg between 30 and 300),
  add column if not exists target_weight_change_kg_per_week numeric(4, 2)
    check (target_weight_change_kg_per_week between -1.5 and 1),
  add column if not exists weight_change_last_14_days_kg numeric(4, 2)
    check (weight_change_last_14_days_kg between -3 and 3),
  add column if not exists nutrition_adherence text not null default 'moderate'
    check (nutrition_adherence in ('low', 'moderate', 'high')),
  add column if not exists protein_target_met boolean not null default false,
  add column if not exists recovery_status text not null default 'normal'
    check (recovery_status in ('low', 'normal', 'high'));

comment on column public.usr_athlete_profiles.current_body_weight_kg is '当前体重，用于计算相对体重变化率。';
comment on column public.usr_athlete_profiles.target_weight_change_kg_per_week is '用户设定的每周体重变化目标，减脂为负数。';
comment on column public.usr_athlete_profiles.weight_change_last_14_days_kg is '当前体重减去 14 天前体重，用于判断近期变化趋势。';
comment on column public.usr_athlete_profiles.nutrition_adherence is '用户自评饮食计划执行度。';
comment on column public.usr_athlete_profiles.protein_target_met is '用户自评近期是否大多数日子达到蛋白质目标。';
comment on column public.usr_athlete_profiles.recovery_status is '用户自评近期训练恢复状态。';
