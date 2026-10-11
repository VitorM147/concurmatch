# Correções técnicas (SEC-040)

Achados do baseline e o que foi aplicado. Provas de conceito em `reports/phase2/evidence/`.

## AP-001 — Endpoints sem rate limit (HIGH)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: swipe_pass sem limite permitia varrer todos os perfis da região (PoC E7: 150 passes seguidos). RUN-0002: rate limit em passes (120/min, 2000/dia), curtidas (60/min, teto Premium 1000/dia), mensagens e denúncias. Leitura (discover/my_matches) continua sem limite próprio: depende do gateway do Supabase.
- **Correção:** Implementar rate limiting por IP e por user. Endpoints de auth: 5-10 req/min. APIs gerais: 100-1000 req/min conforme caso de uso. Retornar 429 com Retry-After header.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:77`; `security/reports/phase2/evidence/baseline-poc.txt:7`; `security/reports/phase2/evidence/post-remediation-poc.txt:7`

## BL-002 — Anti-automação ausente em fluxos críticos (HIGH)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: sem anti-automação (passes ilimitados, Premium sem teto, sem CAPTCHA). RUN-0002: rate limits e teto Premium; CAPTCHA configurado mas desligado até o app enviar o token.
- **Correção:** Implementar CAPTCHA (hCaptcha, Turnstile, reCAPTCHA v3) em endpoints críticos. Velocity checks per user (máximo N ações por janela). Device fingerprinting (FingerprintJS). Considerar proof-of-work para fluxos muito abusados. Monitorar comportamento anômalo e bloquear proativamente.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:18`; `supabase/config.toml:34`

## DA-005 — Não conformidade com LGPD/GDPR (HIGH)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: consentimento só no app (PoC E5), sem portabilidade e arquivos de foto ficavam no Storage após a exclusão. RUN-0002: consentimento exigido no servidor, export_my_data(), app apaga as fotos antes de excluir a conta. Pendente: texto da política de privacidade/termos e encarregado (DPO) — não estão no repositório.
- **Correção:** Implementar consent management. Criar endpoints de portabilidade (export JSON/CSV). Implementar exclusão/anonimização. Documentar base legal por tratamento. Designar DPO.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:444`; `apps/mobile/src/lib/api.ts:197`; `security/reports/phase2/evidence/post-remediation-poc.txt:5`

## DS-001 — Dependências com vulnerabilidades conhecidas (HIGH)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** npm audit (apps/mobile). Baseline: 30 vulnerabilidades (19 HIGH, 11 MODERATE). RUN-0002: 22 (19 HIGH, 3 MODERATE) após override de uuid@11 no xcode e remoção do AsyncStorage. Os HIGH restantes (braces, micromatch, node-forge via metro/@expo/cli) são de ferramentas de build, não entram no bundle e não têm versão corrigida publicada; decode-uri-component (MODERATE, runtime via expo-router) tem correção só em ESM, que quebra o query-string (testado). Risco aceito com prazo em SECURITY.md; CI bloqueia CRITICAL.
- **Correção:** Atualizar dependências vulneráveis. Se update não possível, documentar mitigação. Configurar dependabot/renovate para updates automáticos. | Aplicado: overrides uuid@^11.1.1; job 'dependencies' no CI; Dependabot
- **Onde:** `security/reports/phase2/evidence/npm-audit-mobile-post.json:6`; `apps/mobile/package.json:37`

## FE-003 — Dependências JS vulneráveis (HIGH)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Ver DS-001.
- **Correção:** Atualizar dependências vulneráveis. Adicionar SRI em scripts de CDN. Configurar npm audit na CI.
- **Onde:** `security/reports/phase2/evidence/npm-audit-mobile-post.json:493`

## FU-001 — Uploads sem validação de tipo (HIGH)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** Bucket restringe MIME (image/jpeg|png|webp) pelo Content-Type declarado; RUN-0002 exige extensão de imagem. Não há verificação do conteúdo real (magic bytes) no servidor.
- **Correção:** Whitelist de extensões e MIME types permitidos. Validar magic bytes com library (file-type, python-magic). Rejeitar tudo que não está na whitelist.
- **Onde:** `supabase/migrations/0004_supabase_platform.sql:7`; `supabase/migrations/0006_platform_hardening.sql:13`

## IF-005 — Backups não configurados (HIGH)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** Backup depende do plano do Supabase e não é verificável no repo; exigência registrada em SECURITY.md.
- **Correção:** Configurar backups automatizados (diário DB, semanal full). Testar restore mensalmente. Armazenar off-site/cross-region. Criptografar backups.
- **Onde:** `SECURITY.md:31`

## AU-003 — Ausência de MFA (MEDIUM)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: sem MFA. RUN-0002: TOTP habilitado no servidor (config.toml); falta a tela de ativação no app.
- **Correção:** Implementar TOTP com speakeasy/pyotp. Exigir MFA para admin. Oferecer MFA opt-in para todos. Fornecer recovery codes.
- **Onde:** `supabase/config.toml:54`

## CR-005 — Falta de rotação de chaves (MEDIUM)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: sem processo de rotação. RUN-0002: runbook em SECURITY.md (manual, não automatizado).
- **Correção:** Implementar key versioning. Usar JWKS para JWT com kid header. Configurar auto-rotation em KMS. Documentar policy de rotação.
- **Onde:** `SECURITY.md:35`

## DO-001 — Ausência de code review (MEDIUM)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: sem CODEOWNERS nem template de PR. RUN-0002: ambos criados; proteção da branch é configuração do GitHub (fora do repo).
- **Correção:** Configurar branch protection. Exigir pelo menos 1 approval. CODEOWNERS para paths de segurança. Bloquear push direto para main.
- **Onde:** `.github/CODEOWNERS:3`; `.github/pull_request_template.md:3`

## DO-006 — Deploy sem auditoria (MEDIUM)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** Migrations aplicadas manualmente via CLI/painel, sem pipeline de deploy auditável.
- **Correção:** Implementar audit trail para deploys. Exigir approval para produção. Configurar rollback automático em caso de health check failure.

## FU-004 — Ausência de antivírus (MEDIUM)

- **Baseline:** FALHA · **Agora:** FALHA
- **Evidência:** Não há varredura de malware nem moderação automática de imagem (nudez, menores, rostos). Planejado: AWS Rekognition atualizando photos.approved antes do lançamento público.
- **Correção:** Integrar ClamAV ou serviço equivalente. Escanear antes de persistir. Quarentenar até scan completar. Rejeitar e alertar em caso de detecção.
- **Onde:** `supabase/migrations/0001_schema.sql:117`

## IF-006 — Proteção contra DDoS ausente (MEDIUM)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** Proteção de borda do provedor + rate limits de aplicação (RUN-0002); sem proteção dedicada.
- **Correção:** Implementar CDN com proteção DDoS (Cloudflare, AWS Shield). Rate limiting em nginx/load balancer. Não expor IP do origin server.

## LM-004 — Ausência de alertas de segurança (MEDIUM)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: nenhum alerta. RUN-0002: fila security_alerts (denúncia de menor, pico de denúncias, ocultação, rate limit). Falta canal de notificação (webhook/e-mail).
- **Correção:** Configurar alertas para: auth failures > threshold, error rate spikes, suspicious patterns. Integrar com Sentry/Datadog/PagerDuty.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:44`

## AP-005 — Falta de versionamento de API (LOW)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** RPCs sem versionamento; mudança incompatível exigiria nova função (ex.: discover_v2).
- **Correção:** Implementar versionamento por URL path (/api/v1/) ou header (Accept-Version). Documentar política de deprecation.
- **Onde:** `supabase/migrations/0002_functions.sql:157`

## DO-005 — DAST não implementado (LOW)

- **Baseline:** FALHA · **Agora:** FALHA
- **Evidência:** Sem DAST. Para app mobile + BaaS, recomendado ZAP contra um projeto Supabase de staging.
- **Correção:** Implementar OWASP ZAP ou Nuclei em CI contra staging. Scan antes de deploy para produção. Triage findings antes de release.

## DS-005 — Dependências externas não auditadas (LOW)

- **Baseline:** FALHA · **Agora:** parcial
- **Evidência:** Baseline: nenhum processo de revisão de dependências. RUN-0002: Dependabot (npm + actions). Actions referenciadas por tag, não por SHA.
- **Correção:** Auditar dependências diretas periodicamente. Usar ferramentas como socket.dev ou snyk para visibilidade de supply chain. | Aplicado: dependabot.yml; pendente: fixar actions por SHA
- **Onde:** `.github/dependabot.yml:4`

## LM-003 — Logs não estruturados (LOW)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** audit_logs é estruturado (jsonb), mas o app não tem log/crash reporting estruturado.
- **Correção:** Usar logger estruturado (pino, winston JSON, structlog). Formato JSONL para facilitar parsing e análise.
- **Onde:** `supabase/migrations/0001_schema.sql:210`

## LM-005 — Ausência de correlação de requisições (LOW)

- **Baseline:** parcial · **Agora:** parcial
- **Evidência:** Request ID existe só nos logs do Supabase; o app não propaga ID de correlação.
- **Correção:** Implementar middleware de correlation ID. Propagar via header (X-Request-ID). Incluir em todos os logs. Considerar OpenTelemetry.

## AZ-002 — IDOR (Insecure Direct Object Reference) (CRITICAL)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** IDOR confirmado por prova de conceito: (E1) usuário cadastrava em 'photos' o storage_path da foto de OUTRA pessoa e a exibia no próprio perfil (a policy de leitura do Storage aceitava); (E6) denúncia aceitava match_id de terceiros. RUN-0002: constraint photos_path_owner + validação do match em report_user. PoC agora bloqueada.
- **Correção:** Sempre filtrar queries por user_id/org_id do usuário autenticado. Implementar policy layer (ex: CASL, Pundit, Django Guardian). Usar UUIDs ao invés de IDs sequenciais.
- **Onde:** `supabase/migrations/0003_security.sql:53`; `supabase/migrations/0005_security_hardening.sql:29`; `supabase/migrations/0005_security_hardening.sql:398`; `security/reports/phase2/evidence/baseline-poc.txt:1`

## AZ-003 — Verificação de permissão apenas no frontend (CRITICAL)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: consentimento LGPD e exigência de foto só no app (perfil podia ser criado direto na API sem consentimento, PoC E5). RUN-0002: trigger require_consents no servidor.
- **Correção:** Implementar toda lógica de autorização no backend. Frontend deve esconder UI por UX, não por segurança. Testar endpoints diretamente com curl/Postman.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:71`; `security/reports/phase2/evidence/baseline-poc.txt:5`

## BL-003 — Race conditions (TOCTOU) em operações sensíveis (CRITICAL)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: swipe_like contava a cota e inseria sob lock apenas do PAR; requisições paralelas do mesmo usuário para alvos diferentes furavam o limite de 20 (TOCTOU). RUN-0002: pg_advisory_xact_lock por usuário antes da contagem.
- **Correção:** Envolver operações críticas em transação explícita. Usar SELECT ... FOR UPDATE para lock pessimista OU version field para lock otimista. Atomic updates quando possível (UPDATE balance = balance - X WHERE balance >= X). Idempotency keys para retry seguro. Marcar cupom/voucher como usado na mesma transação que aplica o benefício.
- **Onde:** `supabase/migrations/0002_functions.sql:296`; `supabase/migrations/0005_security_hardening.sql:222`

## CR-001 — HTTPS não obrigatório (CRITICAL)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: o app aceitava qualquer URL, inclusive http://. RUN-0002: exige https:// fora do dev local.
- **Correção:** Configurar redirect 301 HTTP→HTTPS. Adicionar HSTS header (max-age=31536000; includeSubDomains; preload). Considerar HSTS preload list.
- **Onde:** `apps/mobile/src/lib/supabase.ts:15`

## AU-004 — Reset de senha inseguro (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: política de troca/reset de senha não versionada. RUN-0002: secure_password_change, otp_expiry 1h, max_frequency 1m.
- **Correção:** Gerar token com crypto.randomBytes(32). Expirar em 30-60min. Invalidar após uso. Enviar apenas link, nunca senha.
- **Onde:** `supabase/config.toml:45`

## AU-005 — Sessões sem expiração (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: expiração do JWT não versionada. RUN-0002: jwt_expiry = 3600.
- **Correção:** Configurar TTL para sessões (8-24h normal, 15min idle admin). JWT com exp obrigatório. Implementar refresh token rotation.
- **Onde:** `supabase/config.toml:14`

## AU-006 — Ausência de proteção contra brute force (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: limite de tentativas dependia de padrão não versionado; validação só no app. RUN-0002: [auth.rate_limit] versionado.
- **Correção:** Implementar rate limit (ex: 5 tentativas/min por IP+username). Lockout progressivo após 5 falhas. CAPTCHA após 3 falhas. Notificar usuário de tentativas.
- **Onde:** `supabase/config.toml:27`

## AU-007 — Tokens permanentes (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: rotação de refresh token não versionada. RUN-0002: rotação + reuse_interval 10s.
- **Correção:** Definir expiração em todos os tokens. Access token: 15-60min. Refresh token: 7-30 dias com rotação. API keys: revogáveis com auditoria.
- **Onde:** `supabase/config.toml:16`

## BL-001 — Bypass de workflow multi-step (HIGH)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: a ocultação automática usava is_visible, que o próprio usuário religava no app (PoC E2). RUN-0002: coluna moderation_hidden_at sem grant; discover/like/chat respeitam.
- **Correção:** Implementar state machine server-side com transições explícitas. Cada endpoint de step valida status atual antes de permitir ação. Rejeitar transições inválidas (ex: de 'pending' direto para 'completed' sem passar por 'paid'). Considerar Temporal/XState para fluxos complexos. Log de audit para mudanças de state (cross-ref LM-002).
- **Onde:** `supabase/migrations/0002_functions.sql:487`; `supabase/migrations/0005_security_hardening.sql:37`; `security/reports/phase2/evidence/baseline-poc.txt:2`; `security/reports/phase2/evidence/post-remediation-poc.txt:2`

## CR-003 — Dados sensíveis sem criptografia (HIGH)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: access e refresh token gravados no AsyncStorage (texto puro no aparelho). RUN-0002: Keychain/Keystore via expo-secure-store com acesso 'após o primeiro desbloqueio, só neste aparelho'. Dados no banco: criptografia em disco do provedor.
- **Correção:** Criptografar campos sensíveis a nível de aplicação (envelope encryption). Habilitar encryption at-rest no DB. Criptografar backups.
- **Onde:** `apps/mobile/src/lib/secureStorage.ts:10`

## DO-003 — Secrets scanning ausente (HIGH)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: sem secrets scanning. RUN-0002: gitleaks em todo o histórico no CI.
- **Correção:** Implementar gitleaks ou trufflehog na CI. Adicionar pre-commit hook com detect-secrets. Habilitar GitHub secret scanning se disponível.
- **Onde:** `.github/workflows/ci.yml:52`

## FE-001 — Tokens armazenados em localStorage (HIGH)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: sessão no AsyncStorage (equivalente mobile do localStorage, texto puro). RUN-0002: secureStorage em pedaços no Keychain/Keystore.
- **Correção:** Mover auth tokens para httpOnly cookies. Se SPA, usar BFF (Backend For Frontend) pattern com cookies httpOnly. localStorage apenas para preferências não-sensíveis.
- **Onde:** `apps/mobile/src/lib/supabase.ts:35`

## FU-006 — Filenames não sanitizados (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: a policy só exigia a pasta do usuário; qualquer nome de arquivo era aceito. RUN-0002: regex de nome e extensão na policy do Storage e na tabela.
- **Correção:** Substituir filename por UUID + extensão validada. Armazenar nome original apenas em DB (sanitizado). Nunca usar filename original em path do filesystem.
- **Onde:** `supabase/migrations/0006_platform_hardening.sql:13`; `supabase/migrations/0005_security_hardening.sql:29`

## SS-005 — Sessões sem expiração (HIGH)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Ver AU-005: jwt_expiry 3600 versionado no RUN-0002.
- **Correção:** Configurar TTL máximo de sessão. Implementar idle timeout. Configurar cleanup de sessões expiradas no store.
- **Onde:** `supabase/config.toml:14`

## AP-003 — Enumeração de usuários (MEDIUM)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: tela de cadastro exibia a mensagem crua do servidor (podia revelar e-mail existente). RUN-0002: mensagem genérica + enable_confirmations.
- **Correção:** Retornar mesma mensagem independente de existência: 'Se a conta existir, enviaremos um email'. Usar timing constante. Considerar CAPTCHA após N tentativas.
- **Onde:** `apps/mobile/app/entrar.tsx:31`; `supabase/config.toml:42`

## AP-006 — Ausência de paginação (MEDIUM)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: my_matches() sem limite. RUN-0002: limit 200; discover limitado a 50; mensagens por cursor.
- **Correção:** Implementar paginação em todos os endpoints de listagem. Default: 20-50 items. Max: 100. Retornar metadata de paginação (total, next, prev).
- **Onde:** `supabase/migrations/0005_security_hardening.sql:320`

## AZ-005 — Escopo de permissões mal definido (MEDIUM)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: is_blocked_pair liberada ao papel authenticated permitia a qualquer usuário descobrir se A bloqueou B (PoC E4); tabelas/funções futuras herdariam grants padrão do Supabase. RUN-0002: revoke + alter default privileges.
- **Correção:** Implementar RBAC ou ABAC granular. Definir permissões por recurso e ação. Auditar roles periodicamente. Documentar matriz de permissões.
- **Onde:** `supabase/migrations/0003_security.sql:99`; `supabase/migrations/0005_security_hardening.sql:511`; `supabase/migrations/0005_security_hardening.sql:527`

## BL-004 — Abuso de fluxo de negócio permitido (MEDIUM)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: uma denúncia de 'menor de idade' de qualquer conta, mesmo criada no minuto anterior e sem foto, ocultava qualquer perfil (PoC E3) — arma para derrubar concorrentes. RUN-0002: só denunciantes confiáveis (conta 24h+, com foto, fora de revisão) contam; 2 para 'menor', 3 para os demais; toda denúncia gera alerta para revisão humana.
- **Correção:** Definir limits por usuário para fluxos de alto valor (N compras de produto limitado, M cupons por mês). Implementar detecção de múltiplas contas (mesmo device, mesmo IP, mesmo CPF). Soft-approval para ações de alto valor. Rate limit mais agressivo em endpoints de busca/catálogo. Considerar impact analysis no threat model.
- **Onde:** `supabase/migrations/0002_functions.sql:484`; `supabase/migrations/0005_security_hardening.sql:364`; `security/reports/phase2/evidence/baseline-poc.txt:3`; `security/reports/phase2/evidence/post-remediation-poc.txt:3`

## DA-003 — Ausência de política de retenção (MEDIUM)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: nenhuma retenção (mensagens, passes e logs para sempre). RUN-0002: purge_expired_data() diária via pg_cron, preservando conversas com denúncia aberta (teste dedicado).
- **Correção:** Definir política de retenção por tipo de dado. Implementar cleanup automático. Documentar e auditar compliance.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:474`; `supabase/migrations/0006_platform_hardening.sql:32`

## DO-002 — Pipeline sem análise de segurança (MEDIUM)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: CI só com testes funcionais. RUN-0002: jobs de secrets, SAST, dependências e regressões de segurança.
- **Correção:** Integrar SAST (Semgrep, SonarQube) na CI. Configurar para bloquear em findings high/critical. Adicionar dependency scanning.
- **Onde:** `.github/workflows/ci.yml:47`; `.github/workflows/ci.yml:57`

## DO-004 — SAST não implementado (MEDIUM)

- **Baseline:** FALHA · **Agora:** ok
- **Evidência:** Baseline: sem SAST. RUN-0002: Semgrep (typescript, react, secrets) no CI. Não executado localmente.
- **Correção:** Implementar Semgrep (open source, multi-linguagem) ou SonarQube. Configurar na CI. Triage findings regularmente.
- **Onde:** `.github/workflows/ci.yml:62`

## IV-006 — Inputs não validados (MEDIUM)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: storage_path sem validação de formato. RUN-0002: regex de caminho/extensão.
- **Correção:** Validar todos os inputs no ponto de entrada. Definir schemas com tipos, limites e formatos. Rejeitar input malformado com 400.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:30`

## SS-006 — Tokens reutilizáveis (MEDIUM)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Ver AU-007: refresh token rotativo no RUN-0002.
- **Correção:** Invalidar tokens de uso único imediatamente após consumo. Implementar refresh token rotation. Detectar reuso de refresh token como sinal de comprometimento.
- **Onde:** `supabase/config.toml:17`

## DS-006 — Build não reproduzível (LOW)

- **Baseline:** parcial · **Agora:** ok
- **Evidência:** Baseline: CI usava 'npm install'. RUN-0002: 'npm ci' com lockfile.
- **Correção:** Pinar todas as versões de base images. Usar npm ci / pip install --require-hashes. Documentar processo de build reproduzível.
- **Onde:** `.github/workflows/ci.yml:21`

