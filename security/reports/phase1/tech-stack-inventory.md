# SEC-001 — Stack tecnológica

| Camada | Tecnologia | Versão | Observação |
|---|---|---|---|
| App mobile | Expo SDK + React Native + expo-router | 57 / 0.86.3 / 57.0.24 | Android e iOS; TypeScript strict |
| Cliente de backend | @supabase/supabase-js | 2.117.x | Única porta de entrada: `src/lib/api.ts` |
| Backend (BaaS) | Supabase: Postgres 15+, Auth (GoTrue), Storage, Realtime | gerenciado | Lógica em funções PL/pgSQL `security definer` |
| Banco | PostgreSQL com RLS | — | 17 migrations append-only (`supabase/migrations`) |
| Funções serverless | Supabase Edge Functions (Deno) | 2.x | `report-triage` (OpenAI Moderation) e `selfie-check` (AWS Rekognition) |
| Web | HTML estático + supabase-js 2.45.4 (CDN com SRI) | — | site com lista de espera e painel do suporte |
| Testes | node:test + PGlite (Postgres em WASM) | 0.5.8 | 94 testes, incl. regressões de segurança das 4 rodadas |
| CI | GitHub Actions (actions fixadas por SHA) | — | testes, typecheck, bundle, deno check, cabeçalhos, gitleaks, Semgrep, npm audit |
| IA / ML | OpenAI omni-moderation-2024-09-26; AWS Rekognition | API | classificadores (sem LLM generativo nem ferramentas); domínio AI-* aplicável desde a RUN-SEC-0003 |
| Containers / IaC | nenhum | — | infraestrutura 100% gerenciada |

Ferramentas disponíveis nesta execução: ver `tool-capabilities.json`.
