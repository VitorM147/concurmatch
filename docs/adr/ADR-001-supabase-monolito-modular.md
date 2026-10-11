# ADR-001 — Backend do MVP: Supabase + regras no Postgres (monólito modular)

**Status:** aceito · **Data:** 2026-10-06

## Contexto

- O orçamento total é de R$ 3.000 por mês, sendo cerca de R$ 400 para infraestrutura.
- O lançamento será em 8 estados.
- O MVP precisa validar se concurseiros dão match e conversam.
- Há 1 desenvolvedor, com perfil DevOps.

## Alternativas avaliadas

| Opção | Custo/mês | Prós | Contras |
|---|---|---|---|
| 13 microsserviços em EKS + Kafka (MSK) | R$ 2.600+ | Escala e isolamento máximos | Estoura o orçamento; operação pesada para 1 pessoa; escala que não existe |
| API Node própria (Railway) + Postgres + Redis | R$ 150–250 | Controle total | Exige construir do zero auth, upload, realtime e RLS |
| **Supabase (Auth + Postgres + Storage + Realtime) com regras em SQL** | **R$ 135–300** | Auth, chat em tempo real e fotos prontos; RLS dá segurança por linha; região São Paulo (LGPD) | Lógica no banco exige disciplina de testes; dependência de fornecedor |

## Decisão

Supabase Pro, com a lógica crítica em funções `SECURITY DEFINER`:
- discovery, like/match, limite, bloqueio e denúncia;
- todas testadas com PGlite no CI.

O app acessa o backend só pela camada `src/lib/api.ts`.

## Isolamento de falhas (requisito do projeto)

- **Chat** usa a tabela `messages` + Realtime, e não depende de `discover()`. Se o Discovery falhar, quem já deu match continua conversando.
- **Notificações e analytics** (próxima fase) são assíncronos, via Database Webhooks ou filas. Uma falha neles não bloqueia like, match nem mensagem.

## Quando evoluir (gatilhos)

| Sinal | Ação |
|---|---|
| Realtime perto do limite do plano ou mais de ~1.000 conexões simultâneas | Extrair o **Chat Service** (Node + WebSocket + Redis pub/sub) |
| `discover()` com p95 acima de 300 ms | Pré-computar candidatos (job) e cache Redis |
| Pagamentos, moderação e regras com segredos | **BFF Node** (Railway/Fly) na frente; o app passa a falar só com ele |
| Mais de 50 mil usuários ativos por mês ou receita acima de R$ 10 mil/mês | Reavaliar ECS/Fargate e separar serviços por domínio |

Como o app usa apenas `api.ts`, trocar o backend não exige reescrever telas.
