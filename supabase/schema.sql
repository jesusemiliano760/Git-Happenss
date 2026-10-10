-- Esquema de Supabase para Git Happens (What Should Happen Next?).
-- Correr completo en Supabase > SQL Editor > New query > Run.
-- Es seguro correrlo varias veces (usa IF NOT EXISTS).

-- 1) Eventos tal cual llegan del JSONL. event_id es la llave primaria:
--    la propia base de datos impide duplicados.
create table if not exists public.events (
  event_id     text primary key,
  case_id      text        not null,
  event_type   text        not null check (event_type in (
                 'case.opened', 'proposal.viewed', 'message.received',
                 'action.executed', 'constraint.updated', 'case.closed')),
  occurred_at  timestamptz not null,
  data         jsonb       not null default '{}'::jsonb,
  ingested_at  timestamptz not null default now()
);
create index if not exists events_case_idx on public.events (case_id, occurred_at);

-- 2) Interpretacion de la IA por mensaje (cache: no se paga dos veces el
--    mismo mensaje a Gemini).
create table if not exists public.interpretations (
  event_id        text primary key references public.events (event_id) on delete cascade,
  source          text        not null,          -- 'llm' | 'heuristic'
  intent          text        not null,
  interpretation  jsonb       not null,
  created_at      timestamptz not null default now()
);

-- 3) Historial de decisiones. La ultima por case_id es la vigente; la
--    anterior sirve para mostrar "que cambio".
create table if not exists public.decisions (
  id               bigint generated always as identity primary key,
  case_id          text        not null,
  evaluated_at     timestamptz not null,           -- hora del manifest usada como "ahora"
  action           text        not null,
  timing           text        not null,
  confidence       text        not null,
  risk_level       text        not null,
  requires_human_review boolean not null,
  mode             text        not null,           -- 'live' | 'fallback'
  recommendation   jsonb       not null,           -- contrato de la seccion 6 completo
  proposed         jsonb,
  rule_checks      jsonb       not null,
  trace            jsonb       not null,
  event_count      integer     not null,
  created_at       timestamptz not null default now()
);
create index if not exists decisions_case_idx on public.decisions (case_id, created_at);

-- 4) Lineas del JSONL con error de formato (para mostrarlas en la UI).
create table if not exists public.ingest_errors (
  id          bigint generated always as identity primary key,
  line        integer     not null,
  case_id     text,
  event_id    text,
  error       text        not null,
  raw         text        not null,
  created_at  timestamptz not null default now()
);

-- 5) Estado general (ej. evaluation_at del manifest).
create table if not exists public.app_state (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- Vista util para revisar en el panel de Supabase: decision vigente por caso.
create or replace view public.current_decisions as
select distinct on (case_id) case_id, action, timing, confidence, risk_level,
       requires_human_review, mode, evaluated_at, created_at, recommendation
from public.decisions
order by case_id, created_at desc;

-- Seguridad: RLS activado y SIN politicas publicas. Solo el servidor de la
-- app (con la llave secreta / service_role, que nunca llega al navegador)
-- puede leer y escribir. Nadie con la llave publica puede ver los datos.
alter table public.events          enable row level security;
alter table public.interpretations enable row level security;
alter table public.decisions       enable row level security;
alter table public.ingest_errors   enable row level security;
alter table public.app_state       enable row level security;
alter view  public.current_decisions set (security_invoker = true);
