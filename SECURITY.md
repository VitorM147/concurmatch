# Segurança do Probatório / ConcurMatch

Este projeto é auditado com a metodologia **ESAA-Security** (108 checks em 17 domínios, modo static-first).
O relatório completo, a trilha de eventos e o score ficam em [`security/`](security/README.md).

## Como reportar uma vulnerabilidade

Envie para **seguranca@concurmatch.com.br** (troque pelo e-mail real antes de publicar).
Não abra issue pública. Respondemos em até 3 dias úteis.

## Controles em vigor

| Área | Controle | Onde |
|---|---|---|
| Autorização | RLS em todas as tabelas, grants por coluna, escrita só via RPC `security definer` | `supabase/migrations/0003`, `0005` |
| Privilégio mínimo | Nada herdado por padrão em tabelas/funções novas (`alter default privileges`) | `0005` |
| Fotos | Caminho preso à pasta do dono (constraint + policy do Storage), bucket privado, 5 MB, só imagem | `0005`, `0006` |
| Moderação | Ocultação em coluna que o usuário não altera; só denunciantes confiáveis disparam ocultação automática; banimento é humano | `0005` |
| Anti-abuso | Limite de curtidas (com lock por usuário), passes, mensagens e denúncias; alertas em `security_alerts` | `0005` |
| Sessão | Token no Keychain/Keystore (expo-secure-store); JWT de 1 h; refresh token rotativo | `apps/mobile/src/lib/secureStorage.ts`, `supabase/config.toml` |
| Transporte | App recusa URL sem HTTPS e recusa chave `service_role` | `apps/mobile/src/lib/supabase.ts` |
| LGPD | Consentimento exigido pelo servidor, exportação (`export_my_data`), exclusão total, retenção automática | `0005`, `0006` |
| CI | Testes de regressão de segurança, gitleaks, Semgrep, npm audit, Dependabot | `.github/` |

## Configuração manual obrigatória no painel do Supabase

O que está fora do repositório não é verificável pela auditoria estática. Antes do lançamento:

1. **Authentication → Settings:** conferir os valores de `supabase/config.toml` (JWT 1 h, rotação de refresh token, senha forte, confirmação de e-mail).
2. **Database → Extensions:** ativar `pg_cron` (retenção diária do `0006`).
3. **Database → Backups:** confirmar backup diário (plano Pro) e testar uma restauração.
4. **GitHub → Settings → Branches:** proteger `main` com review obrigatório e checks do CI.
5. **CAPTCHA:** criar o site no Cloudflare Turnstile, enviar o `captchaToken` no `signUp`/`signIn` do app, definir `SUPABASE_AUTH_CAPTCHA_SECRET` e ligar `[auth.captcha]`. Fazer isso **antes** da campanha de anúncios.

## Rotação de chaves

| Chave | Quando girar | Como |
|---|---|---|
| `anon`/publishable | Se vazar junto com falha de RLS, ou a cada 12 meses | Settings → API → gerar nova; publicar nova versão do app; revogar a antiga |
| `service_role`/secret | Imediatamente se exposta; a cada 6 meses | Settings → API; atualizar secrets do CI/Edge Functions |
| Segredo do CAPTCHA | Se exposto | Cloudflare → Turnstile → rotacionar; atualizar env |

## Riscos aceitos (revisar até 2027-01-31)

| Item | Motivo | Mitigação |
|---|---|---|
| `braces`, `micromatch`, `node-forge` (HIGH, npm audit) | Ferramentas de build do Expo/Metro; não vão para o app publicado; ainda não há versão corrigida | Dependabot semanal; CI bloqueia CRITICAL |
| `decode-uri-component` (MODERATE) | Dependência do `expo-router`; a versão corrigida é só ESM e quebra o `query-string` | Aguardar atualização do `expo-router` |
| Moderação automática de imagem | Ainda não implementada | Planejada com AWS Rekognition antes do lançamento público |
| MFA sem tela no app | TOTP habilitado no servidor, sem fluxo no app | Implementar na fase Beta |

## Resposta a incidentes (resumo)

1. Conter: ocultar a conta (`update profiles set moderation_hidden_at = now()`), banir se necessário (`banned_at`), girar chaves expostas.
2. Investigar: `audit_logs`, `security_alerts`, `reports`, logs do Supabase.
3. Notificar: incidente com dado pessoal → avaliar comunicação à ANPD e aos titulares (LGPD art. 48).
4. Corrigir e registrar: migration + teste de regressão em `supabase/tests/security.test.mjs` + nova rodada ESAA.
