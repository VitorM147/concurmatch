# SEC-001 — Stack tecnológica

| Camada | Tecnologia | Versão | Observação |
|---|---|---|---|
| App mobile | Expo SDK + React Native + expo-router | 57 / 0.86.3 / 57.0.24 | Android e iOS; TypeScript strict |
| Cliente de backend | @supabase/supabase-js | 2.117.x | Única porta de entrada: `src/lib/api.ts` |
| Backend (BaaS) | Supabase: Postgres 15+, Auth (GoTrue), Storage, Realtime | gerenciado | Lógica em funções PL/pgSQL `security definer` |
| Banco | PostgreSQL com RLS | — | 6 migrations append-only (`supabase/migrations`) |
| Testes | node:test + PGlite (Postgres em WASM) | 0.5.8 | 31 testes, incl. regressões de segurança |
| CI | GitHub Actions | — | testes, typecheck, bundle, gitleaks, Semgrep, npm audit |
| IA/LLM | nenhuma | — | domínio AI-* não aplicável |
| Containers / IaC | nenhum | — | infraestrutura 100% gerenciada |

Ferramentas disponíveis nesta execução: ver `tool-capabilities.json`.
