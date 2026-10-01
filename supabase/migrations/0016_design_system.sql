-- Brand design tokens per user (Settings → Design system). The builder passes them to the model
-- so generated apps use the brand's colours, fonts and corner radius instead of the defaults.

alter table public.profiles add column if not exists design_tokens jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_design_tokens_size') then
    alter table public.profiles
      add constraint profiles_design_tokens_size check (design_tokens is null or pg_column_size(design_tokens) < 16384);
  end if;
end $$;

-- Profiles are update-protected column by column (credits must stay server-side); allow this one.
grant update (design_tokens) on public.profiles to authenticated;
