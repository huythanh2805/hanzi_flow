-- Keep application profiles in step with Supabase Auth users.
begin;

create or replace function public.hanziflow_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 100)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.hanziflow_create_profile() from public, anon, authenticated;

drop trigger if exists hanziflow_create_profile on auth.users;
create trigger hanziflow_create_profile
  after insert on auth.users
  for each row execute function public.hanziflow_create_profile();

-- Preserve existing display names, preferences and progress during backfill.
insert into public.profiles (user_id, display_name)
select
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ), 100)
from auth.users u
on conflict (user_id) do nothing;

commit;
