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
- Não existem: servidor próprio, painel admin, uploads além de fotos, integrações externas, LLM.
