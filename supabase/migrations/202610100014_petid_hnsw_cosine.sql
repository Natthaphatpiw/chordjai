begin;
-- Match the current 1536-dimensional, single-vector enrollment representation.
-- HNSW is approximate; eligibility remains enforced by live joins in the API.
-- Queries must use these literal predicates plus ORDER BY embedding <=> vector ASC.
create index enrollments_embedding_hnsw_lost_ready_idx
  on biometric.enrollments using hnsw (embedding extensions.vector_cosine_ops)
  with (m=16,ef_construction=64)
  where status='ready' and search_mode='lost_only' and embedding is not null;
comment on index biometric.enrollments_embedding_hnsw_lost_ready_idx is
  'ANN cosine candidate search; filter active lost cases, species and ready media at query time. Use exact filtered fallback for incomplete candidates.';
commit;
