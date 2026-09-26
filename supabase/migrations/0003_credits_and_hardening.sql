-- 1) Credits can no longer be edited from the browser.
--    Clients may only update descriptive profile fields; the balance changes
--    exclusively through the security-definer functions below.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, role, experience_level, default_mode, onboarded)
  on public.profiles to authenticated;

-- 2) Daily allowance that actually refills.
alter table public.profiles
  add column if not exists credits_reset_on date not null default current_date;

create or replace function public.current_credits()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
begin
  update public.profiles
     set credits = 100, credits_reset_on = current_date
   where id = auth.uid() and credits_reset_on < current_date;
  select credits into balance from public.profiles where id = auth.uid();
  return coalesce(balance, 0);
end;
$$;

create or replace function public.spend_credit()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
begin
  perform public.current_credits();
  update public.profiles
     set credits = greatest(credits - 1, 0)
   where id = auth.uid()
  returning credits into balance;
  return coalesce(balance, 0);
end;
$$;

revoke execute on function public.current_credits() from public, anon;
revoke execute on function public.spend_credit() from public, anon;
grant execute on function public.current_credits() to authenticated;
grant execute on function public.spend_credit() to authenticated;

-- 3) Env var values are encrypted by the app before they are stored
--    (AES-256-GCM, key derived from ARCHITECT_SECRET). Nothing to change in SQL,
--    but make the intent explicit for readers of the schema.
comment on column public.env_vars.value is 'AES-256-GCM ciphertext (v1:iv:tag:data), encrypted server-side';
