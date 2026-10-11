# Resumo executivo (SEC-042)

**Score de segurança: 62.6 (fair) → 90.9 (excellent)**

A auditoria ESAA-Security executou os 108 checks dos 17 domínios em modo static-first sobre o app Expo, as migrations do Supabase e o CI.
O baseline tinha 22 checks reprovados, incluindo falhas confirmadas por prova de conceito:
uso da foto de outra pessoa no próprio perfil, desfazer a ocultação feita pela moderação, derrubar qualquer perfil com uma denúncia falsa
de "menor de idade", descobrir bloqueios entre terceiros e varrer todos os perfis da região sem limite.

Todas essas falhas foram corrigidas nas migrations `0005`/`0006`, no app e no CI, e cada uma ganhou um teste de regressão
(`supabase/tests/security.test.mjs`). Restam 19 itens em aberto ou parciais, nenhum CRITICAL.

## Principais riscos restantes

| Check | Risco | Severidade | Status |
|---|---|---|---|
| AP-001 | Endpoints sem rate limit | HIGH | parcial |
| BL-002 | Anti-automação ausente em fluxos críticos | HIGH | parcial |
| DA-005 | Não conformidade com LGPD/GDPR | HIGH | parcial |
| DS-001 | Dependências com vulnerabilidades conhecidas | HIGH | parcial |
| FE-003 | Dependências JS vulneráveis | HIGH | parcial |

## Próximos passos

1. Moderação automática de fotos (FU-004) e CAPTCHA no cadastro (BL-002) antes da campanha de anúncios.
2. Canal de notificação para `security_alerts` (LM-004) e tela de MFA (AU-003).
3. Política de privacidade, termos e encarregado de dados publicados (DA-005).
4. Proteção da branch `main` e configuração do painel do Supabase conforme `SECURITY.md`.
