-- CallFlow demo seed data
-- Safe for an existing Supabase project after at least one user has signed up.
-- This script uses the first existing CallFlow profile and organization instead
-- of placeholder auth.users IDs, so foreign-key constraints remain valid.
-- Re-running the script is safe because all demo rows use fixed IDs and
-- ON CONFLICT clauses.

do $$
declare
  seed_user_id uuid;
  seed_org_id uuid;
begin
  select p.id, p.organization_id
  into seed_user_id, seed_org_id
  from public.profiles as p
  where exists (
    select 1
    from auth.users as u
    where u.id = p.id
  )
  order by p.created_at
  limit 1;

  if seed_user_id is null or seed_org_id is null then
    raise exception
      'No CallFlow user profile exists. Sign up through the application first, confirm that the profile bootstrap trigger created a profile, then run seed.sql again.';
  end if;

  insert into public.contacts (
    id,
    organization_id,
    first_name,
    last_name,
    email,
    phone,
    company,
    title,
    status,
    metadata,
    created_by
  )
  values
    (
      '99999999-9999-9999-9999-999999999999',
      seed_org_id,
      'Noah',
      'Bennett',
      'noah.bennett@acme.example',
      '+1-415-555-0180',
      'Acme Innovations',
      'CTO',
      'active',
      '{"source":"website","region":"US"}'::jsonb,
      seed_user_id
    ),
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      seed_org_id,
      'Zoe',
      'Patel',
      'zoe.patel@horizon.example',
      '+1-415-555-0113',
      'Horizon Ventures',
      'Investor',
      'active',
      '{"source":"referral","segment":"enterprise"}'::jsonb,
      seed_user_id
    )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    company = excluded.company,
    title = excluded.title,
    status = excluded.status,
    metadata = excluded.metadata,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.campaigns (
    id,
    organization_id,
    name,
    description,
    status,
    start_date,
    end_date,
    created_by
  )
  values (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    seed_org_id,
    'Demo Outreach',
    'Demo outbound follow-up campaign for qualified leads.',
    'active',
    current_date,
    current_date + 30,
    seed_user_id
  )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.calls (
    id,
    organization_id,
    campaign_id,
    contact_id,
    direction,
    status,
    started_at,
    duration_seconds,
    recording_available,
    notes,
    metadata,
    created_by
  )
  values
    (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      seed_org_id,
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '99999999-9999-9999-9999-999999999999',
      'outbound',
      'completed',
      now() - interval '1 day',
      420,
      true,
      'Introductory demo scheduled.',
      '{"score":85}'::jsonb,
      seed_user_id
    ),
    (
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      seed_org_id,
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'inbound',
      'completed',
      now() - interval '2 hours',
      180,
      true,
      'Investor follow-up call.',
      '{"sentiment":"positive"}'::jsonb,
      seed_user_id
    )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    campaign_id = excluded.campaign_id,
    contact_id = excluded.contact_id,
    direction = excluded.direction,
    status = excluded.status,
    started_at = excluded.started_at,
    duration_seconds = excluded.duration_seconds,
    recording_available = excluded.recording_available,
    notes = excluded.notes,
    metadata = excluded.metadata,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.recordings (
    id,
    organization_id,
    call_id,
    bucket_name,
    storage_path,
    duration_seconds,
    mime_type,
    size_bytes,
    created_by
  )
  values
    (
      '11111111-1111-1111-1111-111111111112',
      seed_org_id,
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'recordings',
      seed_org_id::text || '/' || seed_user_id::text || '/demo-call-1.mp3',
      420,
      'audio/mpeg',
      5824000,
      seed_user_id
    ),
    (
      '22222222-2222-2222-2222-222222222223',
      seed_org_id,
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'recordings',
      seed_org_id::text || '/' || seed_user_id::text || '/demo-call-2.mp3',
      180,
      'audio/mpeg',
      2496000,
      seed_user_id
    )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    call_id = excluded.call_id,
    bucket_name = excluded.bucket_name,
    storage_path = excluded.storage_path,
    duration_seconds = excluded.duration_seconds,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.transcripts (
    id,
    organization_id,
    recording_id,
    language,
    content,
    provider,
    created_by
  )
  values
    (
      '33333333-3333-3333-3333-333333333334',
      seed_org_id,
      '11111111-1111-1111-1111-111111111112',
      'en',
      'Thank you for your time today. We will follow up with the proposal by Friday.',
      'openai',
      seed_user_id
    ),
    (
      '44444444-4444-4444-4444-444444444445',
      seed_org_id,
      '22222222-2222-2222-2222-222222222223',
      'en',
      'Great to hear your interest in the pilot program. I will share next steps via email.',
      'openai',
      seed_user_id
    )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    recording_id = excluded.recording_id,
    language = excluded.language,
    content = excluded.content,
    provider = excluded.provider,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.notes (
    id,
    organization_id,
    contact_id,
    call_id,
    campaign_id,
    recording_id,
    content,
    created_by
  )
  values
    (
      '55555555-5555-5555-5555-555555555556',
      seed_org_id,
      '99999999-9999-9999-9999-999999999999',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '11111111-1111-1111-1111-111111111112',
      'Demo scheduled for next Wednesday. Confirmed budget and decision timeline.',
      seed_user_id
    ),
    (
      '66666666-6666-6666-6666-666666666667',
      seed_org_id,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      null,
      null,
      null,
      'Investor is interested in a second call after the quarter close.',
      seed_user_id
    )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    contact_id = excluded.contact_id,
    call_id = excluded.call_id,
    campaign_id = excluded.campaign_id,
    recording_id = excluded.recording_id,
    content = excluded.content,
    created_by = excluded.created_by,
    updated_at = now();

  raise notice 'CallFlow demo data created for organization % and user %.', seed_org_id, seed_user_id;
end
$$;
