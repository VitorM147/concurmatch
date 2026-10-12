# Resumo executivo (SEC-042)

**Score de segurança atual: 93.6 (excellent)**

| Rodada | O que foi auditado | Score | Classificação |
|---|---|---|---|
| RUN-SEC-0001 | Baseline (antes das correções) | 62.6 | fair |
| RUN-SEC-0002 | Após remediação (0005/0006, app, CI) | 90.9 | excellent |
| RUN-SEC-0003 | Código novo 0008–0015, robôs, painel e site (antes das correções) | 83.4 | good |
| RUN-SEC-0004 | Após remediação (0016/0017, robôs, painel com MFA, cabeçalhos, CI) | 93.6 | excellent |

A auditoria ESAA-Security executa os 108 checks dos 17 domínios em modo static-first sobre o app Expo, as migrations do Supabase,
as Edge Functions, o painel do suporte, o site e o CI.

**Rodadas 1–2 (07/10):** falhas confirmadas por prova de conceito, como usar a foto de outra pessoa no próprio perfil, desfazer a
ocultação da moderação e derrubar qualquer perfil com uma denúncia falsa de "menor de idade". Todas corrigidas em `0005`/`0006`.

**Rodadas 3–4 (12–13/10):** o código novo (verificação, triagem automática, painel do suporte, robôs, site e lista de espera) caiu
para 83.4 (good). Cinco ataques foram confirmados no banco embarcado: trocar a inscrição de outra pessoa na
lista de espera, travar a lista com um robô, banir perfis com uma sessão sem segundo fator, e furar a verificação com foto antiga ou
com arquivo inexistente. Também faltavam cabeçalhos de segurança no site e no painel, timeout nas chamadas à OpenAI e à AWS, modelo de IA
fixado, conferência do conteúdo das fotos e canal de alertas. Tudo foi corrigido em `0016`/`0017`, nos robôs, no painel e no CI; cada
correção tem teste em `supabase/tests/security-run3.test.mjs`.

Restam 15 itens em aberto ou parciais, nenhum CRITICAL.

## Principais riscos restantes

| Check | Risco | Severidade | Status |
|---|---|---|---|
| BL-002 | Anti-automação ausente em fluxos críticos | HIGH | parcial |
| DA-005 | Não conformidade com LGPD/GDPR | HIGH | parcial |
| DS-001 | Dependências com vulnerabilidades conhecidas | HIGH | parcial |
| FE-003 | Dependências JS vulneráveis | HIGH | parcial |
| IF-005 | Backups não configurados | HIGH | parcial |

## Próximos passos

1. Ligar o CAPTCHA no cadastro do app (BL-002) antes da campanha de anúncios.
2. Publicar a Política de Privacidade revisada pelo advogado e nomear o encarregado (DA-005).
3. Tela de MFA opcional para usuários do app (AU-003) e DAST contra um projeto de staging (DO-005).
4. Publicar site e painel em hospedagem que respeite o arquivo `_headers` (Cloudflare Pages ou Netlify) e configurar `ALERT_WEBHOOK_URL`.
5. Proteção da branch `main` e configuração do painel do Supabase conforme `SECURITY.md`.
