-- Codebook AI Annotation Lab: run once in Supabase SQL Editor.
-- Blind phase exposes each coder's annotations only to that coder. Changing a
-- project's phase to discussion unlocks peer labels for reliability/review.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  phase text not null default 'blind' check (phase in ('blind','discussion')),
  created_at timestamptz not null default now()
);
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'coder' check (role in ('owner','coder')),
  joined_at timestamptz not null default now(), primary key (project_id,user_id)
);
create table if not exists public.sentences (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  external_id text not null, sentence text not null, created_at timestamptz not null default now(), unique(project_id,external_id)
);
-- Gold labels and source workbook columns are manager-only, separate from coder-visible sentences.
create table if not exists public.gold_labels (
  sentence_id uuid primary key references public.sentences(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  golden_labels jsonb not null default '{}'::jsonb, source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.sample_runs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  seed bigint not null, count_per_stratum integer not null check (count_per_stratum > 0),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  sentence_id uuid not null references public.sentences(id) on delete cascade,
  sample_run_id uuid not null references public.sample_runs(id) on delete cascade,
  dimension text not null check (dimension in ('Agency','Inevitability')),
  created_at timestamptz not null default now(), unique(project_id,sentence_id,dimension,sample_run_id)
);
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, presence boolean not null, high_low boolean,
  reasoning text, submitted_at timestamptz not null default now(), unique(assignment_id,user_id)
);
create table if not exists public.discussion_notes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000), created_at timestamptz not null default now()
);
create table if not exists public.consensus (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, presence boolean not null, high_low boolean,
  proposed_by uuid not null references auth.users(id), confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz, updated_at timestamptz not null default now()
);

create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.project_members m where m.project_id=p_project_id and m.user_id=(select auth.uid()));
$$;
create or replace function public.is_project_owner(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=(select auth.uid()));
$$;
create or replace function public.project_phase(p_project_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.phase from public.projects p where p.id=p_project_id;
$$;
create or replace function public.add_project_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members(project_id,user_id,role) values(new.id,new.owner_id,'owner') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects for each row execute function public.add_project_owner();
create or replace function public.join_project_with_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_project uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select p.id into found_project from public.projects p where upper(p.join_code)=upper(trim(p_code));
  if found_project is null then raise exception 'Invite code not found'; end if;
  insert into public.project_members(project_id,user_id,role) values(found_project,(select auth.uid()),'coder') on conflict do nothing;
  return found_project;
end;
$$;
grant execute on function public.join_project_with_code(text) to authenticated;
create or replace function public.open_project_review(p_project_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare assignment_total integer; member_total integer; complete_coders integer;
begin
  if not public.is_project_owner(p_project_id) then raise exception 'Only the project owner can open review'; end if;
  select count(*) into assignment_total from public.assignments a where a.project_id=p_project_id;
  select count(*) into member_total from public.project_members m where m.project_id=p_project_id;
  if assignment_total=0 then raise exception 'Draw the sample before opening review'; end if;
  if member_total <> 2 then raise exception 'This workspace expects exactly two coders'; end if;
  select count(*) into complete_coders
  from public.project_members m
  where m.project_id=p_project_id
    and (select count(*) from public.annotations n
         where n.project_id=p_project_id and n.user_id=m.user_id)=assignment_total;
  if complete_coders < 2 then raise exception 'Both coders must submit every assigned label before review opens'; end if;
  update public.projects set phase='discussion' where id=p_project_id;
end;
$$;
grant execute on function public.open_project_review(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sentences enable row level security;
alter table public.gold_labels enable row level security;
alter table public.sample_runs enable row level security;
alter table public.assignments enable row level security;
alter table public.annotations enable row level security;
alter table public.discussion_notes enable row level security;
alter table public.consensus enable row level security;

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects for select to authenticated using (public.is_project_member(id));
drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner on public.projects for insert to authenticated with check (owner_id=(select auth.uid()));
drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner on public.projects for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists members_select_member on public.project_members;
create policy members_select_member on public.project_members for select to authenticated using (public.is_project_member(project_id));
drop policy if exists sentences_select_member on public.sentences;
create policy sentences_select_member on public.sentences for select to authenticated using (public.is_project_member(project_id));
drop policy if exists sentences_insert_owner on public.sentences;
create policy sentences_insert_owner on public.sentences for insert to authenticated with check (public.is_project_owner(project_id));
drop policy if exists sentences_update_owner on public.sentences;
create policy sentences_update_owner on public.sentences for update to authenticated using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));
drop policy if exists gold_owner_only on public.gold_labels;
create policy gold_owner_only on public.gold_labels for all to authenticated using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));
drop policy if exists sample_runs_select_member on public.sample_runs;
create policy sample_runs_select_member on public.sample_runs for select to authenticated using (public.is_project_member(project_id));
drop policy if exists sample_runs_insert_owner on public.sample_runs;
create policy sample_runs_insert_owner on public.sample_runs for insert to authenticated with check (public.is_project_owner(project_id));
drop policy if exists assignments_select_member on public.assignments;
create policy assignments_select_member on public.assignments for select to authenticated using (public.is_project_member(project_id));
drop policy if exists assignments_insert_owner on public.assignments;
create policy assignments_insert_owner on public.assignments for insert to authenticated with check (public.is_project_owner(project_id));
drop policy if exists annotations_select_blind_or_review on public.annotations;
create policy annotations_select_blind_or_review on public.annotations for select to authenticated using (
  user_id=(select auth.uid()) or (public.is_project_member(project_id) and public.project_phase(project_id)='discussion'));
drop policy if exists annotations_insert_own_blind on public.annotations;
create policy annotations_insert_own_blind on public.annotations for insert to authenticated with check (
  user_id=(select auth.uid()) and public.is_project_member(project_id) and public.project_phase(project_id)='blind');
drop policy if exists notes_select_review on public.discussion_notes;
create policy notes_select_review on public.discussion_notes for select to authenticated using (
  public.is_project_member(project_id) and public.project_phase(project_id)='discussion');
drop policy if exists notes_insert_review on public.discussion_notes;
create policy notes_insert_review on public.discussion_notes for insert to authenticated with check (
  user_id=(select auth.uid()) and public.is_project_member(project_id) and public.project_phase(project_id)='discussion');
drop policy if exists consensus_select_review on public.consensus;
create policy consensus_select_review on public.consensus for select to authenticated using (
  public.is_project_member(project_id) and public.project_phase(project_id)='discussion');
drop policy if exists consensus_insert_review on public.consensus;
create policy consensus_insert_review on public.consensus for insert to authenticated with check (
  public.is_project_member(project_id) and public.project_phase(project_id)='discussion');
drop policy if exists consensus_update_review on public.consensus;
create policy consensus_update_review on public.consensus for update to authenticated using (
  public.is_project_member(project_id) and public.project_phase(project_id)='discussion') with check (
  public.is_project_member(project_id) and public.project_phase(project_id)='discussion');

grant select,insert,update on public.projects to authenticated;
grant select on public.project_members to authenticated;
grant select,insert,update on public.sentences to authenticated;
grant select,insert,update on public.gold_labels to authenticated;
grant select,insert on public.sample_runs to authenticated;
grant select,insert on public.assignments to authenticated;
grant select,insert on public.annotations to authenticated;
grant select,insert on public.discussion_notes to authenticated;
grant select,insert,update on public.consensus to authenticated;

-- Enable realtime events. Supabase recommends Broadcast for large deployments;
-- Postgres Changes is sufficient for this small two-coder project.
do $$
declare tbl text;
begin
  foreach tbl in array array['projects','annotations','discussion_notes','consensus'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then
      execute format('alter publication supabase_realtime add table public.%I',tbl);
    end if;
  end loop;
end $$;
