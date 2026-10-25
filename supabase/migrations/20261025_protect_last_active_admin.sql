create or replace function public.protect_last_active_admin()
returns trigger
language plpgsql
as $$
declare
  other_active_admins integer;
begin
  if old.role = 'admin'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'admin'
      or new.status <> 'active'
      or new.organization_id <> old.organization_id
    )
  then
    perform 1
    from public.organizations
    where id = old.organization_id
    for update;

    select count(*)
    into other_active_admins
    from public.profiles
    where organization_id = old.organization_id
      and id <> old.id
      and role = 'admin'
      and status = 'active';

    if other_active_admins = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'Cannot remove the last active Admin of the organization.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_last_active_admin on public.profiles;
create trigger profiles_protect_last_active_admin
before update or delete on public.profiles
for each row execute function public.protect_last_active_admin();
