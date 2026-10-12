# SEC-003 — Superfície de ataque

## RPCs expostas ao papel `authenticated`

| Função | Efeito | Proteções |
|---|---|---|
| `discover(p_limit)` | lista candidatos | usuário ativo, limite 50, filtros de bloqueio/moderação |
| `remaining_likes()` | consulta cota | — |
| `swipe_like(p_target)` | curtida / match | cota diária, lock por usuário e por par, rate limit, alvo disponível |
| `swipe_pass(p_target)` | passar | rate limit por minuto/dia |
| `my_matches()` | lista conversas | limite 200, filtra bloqueio/moderação |
| `mark_read`, `unmatch` | conversa | participante do match |
| `block_user`, `report_user` | segurança | rate limit de denúncias, validação do match, regras de confiança |
| `export_my_data()` | portabilidade LGPD | só os dados do próprio titular |
| `delete_my_account()` | exclusão LGPD | só a própria conta |

## Escrita direta em tabela (RLS + grants por coluna)

`profiles` (colunas liberadas), `photos` (caminho validado), `consents`, `messages` (trigger valida participante, bloqueio, moderação e rate limit).

## Outras entradas

- Storage `photos`: upload na pasta do próprio usuário, nome validado, 5 MB, só imagem.
- Supabase Auth: cadastro, login, refresh (config em `supabase/config.toml`).
- Realtime: canal por match, filtrado por RLS.
- Deep link `probatorio://` (sem redirecionamento, `detectSessionInUrl: false`).
- Até a RUN-SEC-0002 não existiam: servidor próprio, painel admin, uploads além de fotos, integrações externas, LLM.

## Superfícies novas (RUN-SEC-0003, migrations 0008–0017)

| Superfície | Quem acessa | Proteção (RUN-SEC-0004) |
|---|---|---|
| `my_limits`, `verification_challenge`, `submit_verification`, `my_moderation_status`, `submit_appeal` | usuário logado | regras no servidor; selfie precisa existir e ser posterior ao desafio |
| `join_waitlist()` | **público (anon)** pelo site | e-mail repetido não altera nada, campo-isca, limite por IP (hash), disjuntor global |
| `admin_*` (fila, caso, decidir, selfie, lista de espera, números) | admins (`public.admins`) | **segundo fator obrigatório (aal2)**, motivo obrigatório, `audit_logs` com o id do admin |
| Edge Function `report-triage` | pg_cron (cabeçalho `x-worker-secret`) | denúncias, fotos e alertas; chama a Moderation API da OpenAI com timeout e modelo fixado |
| Edge Function `selfie-check` | pg_cron (cabeçalho `x-worker-secret`) | AWS Rekognition (DetectFaces/CompareFaces), desligada até haver chaves; timeout; apaga a selfie depois |
| Funções do robô (`report_triage_pending`, `apply_*`, `photo_check_pending`, `alerts_to_notify`) | só `service_role` | sem grant para `anon`/`authenticated` |
| Painel do suporte (`apps/admin`, página estática) | admins | CSP com hash, SRI no supabase-js, sessão em sessionStorage, `X-Frame-Options: DENY`, `noindex` |
| Site (`apps/site`, conmatch.com.br) | público | CSP com hash, HSTS, nosniff, Referrer-Policy; só chama `join_waitlist` |
| Webhook de alertas (`ALERT_WEBHOOK_URL`) | saída | só tipo e horário dos alertas, nunca conteúdo |
| Storage `photos/<uid>/verificacao-*.jpg` | dono envia; só admin (aal2) e `service_role` leem | fora de `public.photos`; apagada depois da decisão |
