-- Supabase schema for HB Livestock PWA
-- Execute in the Supabase SQL Editor for the target project.
--
-- Design notes:
-- 1. The backend syncs each table independently, so this schema avoids foreign
--    keys that could reject valid offline-first writes arriving out of order.
-- 2. Business date fields stay as text because the app currently sends empty
--    strings for optional dates.
-- 3. The backend uses the service role key, so writes bypass RLS. The only
--    policy below is the public read policy for the public photo bucket.

create extension if not exists pgcrypto;

create table if not exists public.animals (
    animal_id text primary key,
    arete_id text not null default '',
    nombre text not null default '',
    tipo text not null default '',
    sexo text not null default '',
    fecha_nacimiento text not null default '',
    raza text not null default '',
    madre_id text not null default '',
    padre_id text not null default '',
    temperamento text not null default '',
    estado text not null default '',
    peso_actual double precision null,
    notas text not null default '',
    foto_url text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.health (
    salud_id text primary key,
    animal_id text not null default '',
    fecha text not null default '',
    tipo_evento text not null default '',
    producto text not null default '',
    dosis text not null default '',
    estado_general text not null default '',
    proxima_aplicacion text not null default '',
    notas text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.reproduction (
    reproduccion_id text primary key,
    vaca_id text not null default '',
    semental_id text not null default '',
    fecha_monta text not null default '',
    fecha_posible_parto text not null default '',
    prenez_confirmada text not null default '',
    fecha_parto_real text not null default '',
    cria_id text not null default '',
    peso_destete_cria double precision null,
    notas text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.observations (
    observacion_id text primary key,
    fecha text not null default '',
    animal_id text not null default '',
    notas text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.sales (
    venta_id text primary key,
    animal_id text not null default '',
    fecha_venta text not null default '',
    motivo_venta text not null default '',
    peso double precision null,
    precio_total double precision null,
    precio_kg double precision null,
    comprador text not null default '',
    notas text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.recorridos (
    entry_id text primary key,
    recorrido_id text not null default '',
    fecha text not null default '',
    animal_id text not null default '',
    notas text not null default '',
    created_by text not null default '',
    updated_at timestamptz not null,
    created_at timestamptz not null
);

create table if not exists public.users (
    user_id text primary key,
    nombre text not null default '',
    pin_hash text not null default '',
    created_at timestamptz not null
);

create index if not exists animals_arete_id_idx on public.animals (arete_id);
create index if not exists animals_nombre_idx on public.animals (nombre);
create index if not exists animals_estado_idx on public.animals (estado);
create index if not exists animals_updated_at_idx on public.animals (updated_at desc);

create index if not exists health_animal_id_idx on public.health (animal_id);
create index if not exists health_fecha_idx on public.health (fecha);
create index if not exists health_updated_at_idx on public.health (updated_at desc);

create index if not exists reproduction_vaca_id_idx on public.reproduction (vaca_id);
create index if not exists reproduction_semental_id_idx on public.reproduction (semental_id);
create index if not exists reproduction_fecha_monta_idx on public.reproduction (fecha_monta);
create index if not exists reproduction_updated_at_idx on public.reproduction (updated_at desc);

create index if not exists observations_animal_id_idx on public.observations (animal_id);
create index if not exists observations_fecha_idx on public.observations (fecha);
create index if not exists observations_updated_at_idx on public.observations (updated_at desc);

create index if not exists sales_animal_id_idx on public.sales (animal_id);
create index if not exists sales_fecha_venta_idx on public.sales (fecha_venta);
create index if not exists sales_updated_at_idx on public.sales (updated_at desc);

create index if not exists recorridos_recorrido_id_idx on public.recorridos (recorrido_id);
create index if not exists recorridos_animal_id_idx on public.recorridos (animal_id);
create index if not exists recorridos_fecha_idx on public.recorridos (fecha);
create index if not exists recorridos_updated_at_idx on public.recorridos (updated_at desc);

create index if not exists users_nombre_idx on public.users (nombre);

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'livestock',
    'livestock',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read livestock bucket" on storage.objects;
create policy "Public read livestock bucket"
on storage.objects
for select
to public
using (bucket_id = 'livestock');

comment on table public.animals is 'Synced livestock registry rows from the PWA.';
comment on table public.health is 'Synced health-event rows from the PWA.';
comment on table public.reproduction is 'Synced breeding and calving rows from the PWA.';
comment on table public.observations is 'Synced field observation rows from the PWA.';
comment on table public.sales is 'Synced sale rows from the PWA.';
comment on table public.recorridos is 'Synced recorrido entry rows from the PWA.';
comment on table public.users is 'Optional user directory mirrored from the legacy template.';