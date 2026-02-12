-- Security hardening migration:
-- 1) One-time claim tokens for key reveal
-- 2) Replay-safe webhook idempotency event store

create table if not exists public.claim_tokens (
  token text primary key,
  provider text not null,
  session_id text not null,
  order_id uuid null references public.checkout_orders(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists claim_tokens_session_id_idx
  on public.claim_tokens(session_id);

create index if not exists claim_tokens_expires_at_idx
  on public.claim_tokens(expires_at);

create table if not exists public.processed_events (
  event_id text primary key,
  provider text not null,
  event_type text null,
  created_at timestamptz not null default now()
);
