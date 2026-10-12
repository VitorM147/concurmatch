# Correções técnicas (SEC-040)

Todos os achados das quatro rodadas e o que foi aplicado. Provas de conceito em `reports/phase2/evidence/` (rodadas 1–2: `baseline-poc.txt`/`post-remediation-poc.txt`; rodadas 3–4: `run3-baseline-poc.txt`/`run4-post-remediation-poc.txt`, reproduzíveis com `node supabase/tests/poc-run3.mjs`).

## BL-002 — Anti-automação ausente em fluxos críticos (HIGH)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Lista de espera aberta ao público (anon) só com limite global: um robô de um IP gravou 119 inscrições e travou o site para todos (PoC E2). RUN-0004: limite por IP (hash, apagado em 30 dias), campo-isca e disjuntor global alto. CAPTCHA do cadastro no app continua desligado até o app enviar o token.
- **Correção:** Implementar CAPTCHA (hCaptcha, Turnstile, reCAPTCHA v3) em endpoints críticos. Velocity checks per user (máximo N ações por janela). Device fingerprinting (FingerprintJS). Considerar proof-of-work para fluxos muito abusados. Monitorar comportamento anômalo e bloquear proativamente. | Aplicado: 0016: limite por IP + campo-isca
- **Onde:** `supabase/migrations/0005_security_hardening.sql:18`; `supabase/config.toml:34`; `supabase/migrations/0014_waitlist.sql:23`; `security/reports/phase2/evidence/run3-baseline-poc.txt:3`; `supabase/migrations/0016_security_run3.sql:9`; `supabase/migrations/0016_security_run3.sql:144`

## DA-005 — Não conformidade com LGPD/GDPR (HIGH)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Baseline: consentimento só no app (PoC E5), sem portabilidade e arquivos de foto ficavam no Storage após a exclusão. RUN-0002: consentimento exigido no servidor, export_my_data(), app apaga as fotos antes de excluir a conta. Pendente: texto da política de privacidade/termos e encarregado (DPO) — não estão no repositório.
- **Correção:** Implementar consent management. Criar endpoints de portabilidade (export JSON/CSV). Implementar exclusão/anonimização. Documentar base legal por tratamento. Designar DPO.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:444`; `apps/mobile/src/lib/api.ts:247`; `security/reports/phase2/evidence/post-remediation-poc.txt:5`

## DS-001 — Dependências com vulnerabilidades conhecidas (HIGH)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** npm audit (apps/mobile). Baseline: 30 vulnerabilidades (19 HIGH, 11 MODERATE). RUN-0002: 22 (19 HIGH, 3 MODERATE) após override de uuid@11 no xcode e remoção do AsyncStorage. Os HIGH restantes (braces, micromatch, node-forge via metro/@expo/cli) são de ferramentas de build, não entram no bundle e não têm versão corrigida publicada; decode-uri-component (MODERATE, runtime via expo-router) tem correção só em ESM, que quebra o query-string (testado). Risco aceito com prazo em SECURITY.md; CI bloqueia CRITICAL.
- **Correção:** Atualizar dependências vulneráveis. Se update não possível, documentar mitigação. Configurar dependabot/renovate para updates automáticos. | Aplicado: overrides uuid@^11.1.1; job 'dependencies' no CI; Dependabot
- **Onde:** `security/reports/phase2/evidence/npm-audit-mobile-post.json:6`; `apps/mobile/package.json:41`

## FE-003 — Dependências JS vulneráveis (HIGH)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Ver DS-001.
- **Correção:** Atualizar dependências vulneráveis. Adicionar SRI em scripts de CDN. Configurar npm audit na CI.
- **Onde:** `security/reports/phase2/evidence/npm-audit-mobile-post.json:493`

## IF-005 — Backups não configurados (HIGH)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Backup depende do plano do Supabase e não é verificável no repo; exigência registrada em SECURITY.md.
- **Correção:** Configurar backups automatizados (diário DB, semanal full). Testar restore mensalmente. Armazenar off-site/cross-region. Criptografar backups.
- **Onde:** `SECURITY.md:31`

## AU-003 — Ausência de MFA (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** TOTP habilitado no servidor; o painel do suporte não pedia segundo fator. RUN-0004: segundo fator obrigatório para admins (aal2 no banco). Usuários do app ainda não têm tela de ativação de MFA (opcional para eles).
- **Correção:** Implementar TOTP com speakeasy/pyotp. Exigir MFA para admin. Oferecer MFA opt-in para todos. Fornecer recovery codes. | Aplicado: 0016 + painel
- **Onde:** `supabase/config.toml:54`; `security/reports/phase2/evidence/run3-static-findings.txt:14`; `supabase/migrations/0016_security_run3.sql:8`

## CR-005 — Falta de rotação de chaves (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Baseline: sem processo de rotação. RUN-0002: runbook em SECURITY.md (manual, não automatizado).
- **Correção:** Implementar key versioning. Usar JWKS para JWT com kid header. Configurar auto-rotation em KMS. Documentar policy de rotação.
- **Onde:** `SECURITY.md:35`

## DO-001 — Ausência de code review (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Baseline: sem CODEOWNERS nem template de PR. RUN-0002: ambos criados; proteção da branch é configuração do GitHub (fora do repo).
- **Correção:** Configurar branch protection. Exigir pelo menos 1 approval. CODEOWNERS para paths de segurança. Bloquear push direto para main.
- **Onde:** `.github/CODEOWNERS:3`; `.github/pull_request_template.md:3`

## DO-006 — Deploy sem auditoria (MEDIUM)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Migrations aplicadas manualmente via CLI/painel, sem pipeline de deploy auditável.
- **Correção:** Implementar audit trail para deploys. Exigir approval para produção. Configurar rollback automático em caso de health check failure.

## FU-004 — Ausência de antivírus (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: FALHA → R0003: FALHA → R0004: parcial
- **Evidência:** Nenhuma checagem do conteúdo das fotos. RUN-0004: o robô passa cada foto nova pela Moderation API (nudez, menor, violência) e reprova automaticamente; sinal de menor esconde o perfil e abre denúncia. Não há antivírus, mas os arquivos são só imagens servidas por URL assinada e nunca executadas.
- **Correção:** Integrar ClamAV ou serviço equivalente. Escanear antes de persistir. Quarentenar até scan completar. Rejeitar e alertar em caso de detecção. | Aplicado: moderação de fotos no robô
- **Onde:** `supabase/migrations/0001_schema.sql:117`; `security/reports/phase2/evidence/run3-static-findings.txt:40`; `supabase/functions/report-triage/index.ts:104`; `supabase/migrations/0016_security_run3.sql:192`

## IF-006 — Proteção contra DDoS ausente (MEDIUM)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Proteção de borda do provedor + rate limits de aplicação (RUN-0002); sem proteção dedicada.
- **Correção:** Implementar CDN com proteção DDoS (Cloudflare, AWS Shield). Rate limiting em nginx/load balancer. Não expor IP do origin server.

## AP-005 — Falta de versionamento de API (LOW)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** RPCs sem versionamento; mudança incompatível exigiria nova função (ex.: discover_v2).
- **Correção:** Implementar versionamento por URL path (/api/v1/) ou header (Accept-Version). Documentar política de deprecation.
- **Onde:** `supabase/migrations/0002_functions.sql:157`

## DO-005 — DAST não implementado (LOW)

- **Histórico:** R0001: FALHA → R0002: FALHA → R0003: FALHA → R0004: FALHA
- **Evidência:** Sem DAST. Para app mobile + BaaS, recomendado ZAP contra um projeto Supabase de staging.
- **Correção:** Implementar OWASP ZAP ou Nuclei em CI contra staging. Scan antes de deploy para produção. Triage findings antes de release.

## LM-003 — Logs não estruturados (LOW)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** audit_logs é estruturado (jsonb), mas o app não tem log/crash reporting estruturado.
- **Correção:** Usar logger estruturado (pino, winston JSON, structlog). Formato JSONL para facilitar parsing e análise.
- **Onde:** `supabase/migrations/0001_schema.sql:210`

## LM-005 — Ausência de correlação de requisições (LOW)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: parcial
- **Evidência:** Request ID existe só nos logs do Supabase; o app não propaga ID de correlação.
- **Correção:** Implementar middleware de correlation ID. Propagar via header (X-Request-ID). Incluir em todos os logs. Considerar OpenTelemetry.

## AZ-002 — IDOR (Insecure Direct Object Reference) (CRITICAL)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** IDOR confirmado por prova de conceito: (E1) usuário cadastrava em 'photos' o storage_path da foto de OUTRA pessoa e a exibia no próprio perfil (a policy de leitura do Storage aceitava); (E6) denúncia aceitava match_id de terceiros. RUN-0002: constraint photos_path_owner + validação do match em report_user. PoC agora bloqueada.
- **Correção:** Sempre filtrar queries por user_id/org_id do usuário autenticado. Implementar policy layer (ex: CASL, Pundit, Django Guardian). Usar UUIDs ao invés de IDs sequenciais.
- **Onde:** `supabase/migrations/0003_security.sql:53`; `supabase/migrations/0005_security_hardening.sql:29`; `supabase/migrations/0005_security_hardening.sql:398`; `security/reports/phase2/evidence/baseline-poc.txt:1`; `security/reports/phase2/evidence/post-remediation-poc.txt:1`

## AZ-003 — Verificação de permissão apenas no frontend (CRITICAL)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: consentimento LGPD e exigência de foto só no app (perfil podia ser criado direto na API sem consentimento, PoC E5). RUN-0002: trigger require_consents no servidor.
- **Correção:** Implementar toda lógica de autorização no backend. Frontend deve esconder UI por UX, não por segurança. Testar endpoints diretamente com curl/Postman.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:71`; `security/reports/phase2/evidence/baseline-poc.txt:5`

## BL-003 — Race conditions (TOCTOU) em operações sensíveis (CRITICAL)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: swipe_like contava a cota e inseria sob lock apenas do PAR; requisições paralelas do mesmo usuário para alvos diferentes furavam o limite de 20 (TOCTOU). RUN-0002: pg_advisory_xact_lock por usuário antes da contagem.
- **Correção:** Envolver operações críticas em transação explícita. Usar SELECT ... FOR UPDATE para lock pessimista OU version field para lock otimista. Atomic updates quando possível (UPDATE balance = balance - X WHERE balance >= X). Idempotency keys para retry seguro. Marcar cupom/voucher como usado na mesma transação que aplica o benefício.
- **Onde:** `supabase/migrations/0002_functions.sql:296`; `supabase/migrations/0005_security_hardening.sql:222`

## CR-001 — HTTPS não obrigatório (CRITICAL)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: o app aceitava qualquer URL, inclusive http://. RUN-0002: exige https:// fora do dev local.
- **Correção:** Configurar redirect 301 HTTP→HTTPS. Adicionar HSTS header (max-age=31536000; includeSubDomains; preload). Considerar HSTS preload list.
- **Onde:** `apps/mobile/src/lib/supabase.ts:15`

## AI-006 — Proveniência de modelos e dados de treino (HIGH)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: parcial → R0004: ok
- **Evidência:** Robô usava 'omni-moderation-latest' (o modelo muda sem aviso e os limites de decisão dependem dele). RUN-0004: modelo fixado na versão datada omni-moderation-2024-09-26; trocar passa por revisão.
- **Correção:** Pinar versão de modelos API (gpt-4-0613, claude-opus-4-6, etc.). Fixar revision em from_pretrained(). Validar checksum de modelos baixados. Documentar lineage de fine-tuning datasets. Versionar prompt templates no repo (git). Se prompts precisam ser dinâmicos, validar schema e assinatura. | Aplicado: modelo fixado
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:5`; `supabase/functions/report-triage/index.ts:18`

## AP-001 — Endpoints sem rate limit (HIGH)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: ok
- **Evidência:** Endpoint público da lista de espera sem limite por origem (PoC E2). RUN-0004: limite por IP; curtir e passar já têm teto diário (10/50/250, migrations 0008/0009) além do limite por minuto.
- **Correção:** Implementar rate limiting por IP e por user. Endpoints de auth: 5-10 req/min. APIs gerais: 100-1000 req/min conforme caso de uso. Retornar 429 com Retry-After header. | Aplicado: 0016 + 0008/0009
- **Onde:** `supabase/migrations/0005_security_hardening.sql:77`; `security/reports/phase2/evidence/baseline-poc.txt:7`; `security/reports/phase2/evidence/post-remediation-poc.txt:7`; `security/reports/phase2/evidence/run3-baseline-poc.txt:3`; `supabase/migrations/0008_verified_first_and_moderation.sql:219`; `supabase/migrations/0016_security_run3.sql:9`

## AP-009 — Consumo inseguro de APIs externas (HIGH)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: parcial → R0004: ok
- **Evidência:** Robôs chamam OpenAI e AWS sem timeout (uma chamada travada segura o robô inteiro). RUN-0004: AbortSignal.timeout de 15 s em toda chamada externa, resposta da Moderation API validada, falhas registradas sem o texto das conversas.
- **Correção:** Sempre configurar timeout (30s default, menor em paths críticos). Nunca desabilitar TLS verification em produção. Validar response com zod/pydantic/joi antes de usar. Implementar circuit breaker (opossum, resilience4j, polly) para dependências críticas. Sanitizar errors de upstream antes de propagar. Usar secrets manager para API keys. | Aplicado: timeouts nos robôs
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:6`; `security/reports/phase2/evidence/run3-static-findings.txt:9`; `supabase/functions/report-triage/index.ts:37`; `supabase/functions/selfie-check/index.ts:17`

## AU-004 — Reset de senha inseguro (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: política de troca/reset de senha não versionada. RUN-0002: secure_password_change, otp_expiry 1h, max_frequency 1m.
- **Correção:** Gerar token com crypto.randomBytes(32). Expirar em 30-60min. Invalidar após uso. Enviar apenas link, nunca senha.
- **Onde:** `supabase/config.toml:45`

## AU-005 — Sessões sem expiração (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: expiração do JWT não versionada. RUN-0002: jwt_expiry = 3600.
- **Correção:** Configurar TTL para sessões (8-24h normal, 15min idle admin). JWT com exp obrigatório. Implementar refresh token rotation.
- **Onde:** `supabase/config.toml:14`

## AU-006 — Ausência de proteção contra brute force (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: limite de tentativas dependia de padrão não versionado; validação só no app. RUN-0002: [auth.rate_limit] versionado.
- **Correção:** Implementar rate limit (ex: 5 tentativas/min por IP+username). Lockout progressivo após 5 falhas. CAPTCHA após 3 falhas. Notificar usuário de tentativas.
- **Onde:** `supabase/config.toml:27`

## AU-007 — Tokens permanentes (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: rotação de refresh token não versionada. RUN-0002: rotação + reuse_interval 10s.
- **Correção:** Definir expiração em todos os tokens. Access token: 15-60min. Refresh token: 7-30 dias com rotação. API keys: revogáveis com auditoria.
- **Onde:** `supabase/config.toml:16`

## AZ-004 — Admin routes expostas (HIGH)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Painel do suporte (apps/admin + funções admin_*) aceitava sessão só com senha: quem roubasse a senha de um admin banía perfis e lia selfies (PoC E3). RUN-0004: is_admin()/require_admin() exigem sessão aal2 (segundo fator TOTP); o painel cadastra e pede o código; a policy de leitura de selfies no Storage usa is_admin().
- **Correção:** Proteger admin com auth + role admin. Mover para subdomain ou porta segregada. Implementar IP whitelist se possível. Adicionar MFA para admin. | Aplicado: 0016: is_admin() exige aal2; painel com TOTP
- **Onde:** `supabase/migrations/0012_admin_panel_and_rules.sql:23`; `security/reports/phase2/evidence/run3-static-findings.txt:13`; `security/reports/phase2/evidence/run3-baseline-poc.txt:4`; `supabase/migrations/0016_security_run3.sql:36`; `apps/admin/index.html:173`; `security/reports/phase2/evidence/run4-post-remediation-poc.txt:4`

## BL-001 — Bypass de workflow multi-step (HIGH)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: FALHA → R0004: ok
- **Evidência:** Verificação de perfil: submit_verification aceitava qualquer caminho na pasta do usuário — foto antiga da galeria renomeada (PoC E4) ou arquivo inexistente (PoC E5), furando o desafio do rosto. RUN-0004: o arquivo precisa existir no Storage e ter sido enviado depois do desafio; o robô recusa arquivo que não é imagem e selfie apagada.
- **Correção:** Implementar state machine server-side com transições explícitas. Cada endpoint de step valida status atual antes de permitir ação. Rejeitar transições inválidas (ex: de 'pending' direto para 'completed' sem passar por 'paid'). Considerar Temporal/XState para fluxos complexos. Log de audit para mudanças de state (cross-ref LM-002). | Aplicado: 0016: submit_verification confere storage.objects
- **Onde:** `supabase/migrations/0002_functions.sql:487`; `supabase/migrations/0005_security_hardening.sql:37`; `security/reports/phase2/evidence/baseline-poc.txt:2`; `security/reports/phase2/evidence/post-remediation-poc.txt:2`; `supabase/migrations/0008_verified_first_and_moderation.sql:407`; `security/reports/phase2/evidence/run3-baseline-poc.txt:5`

## CR-003 — Dados sensíveis sem criptografia (HIGH)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: access e refresh token gravados no AsyncStorage (texto puro no aparelho). RUN-0002: Keychain/Keystore via expo-secure-store com acesso 'após o primeiro desbloqueio, só neste aparelho'. Dados no banco: criptografia em disco do provedor.
- **Correção:** Criptografar campos sensíveis a nível de aplicação (envelope encryption). Habilitar encryption at-rest no DB. Criptografar backups.
- **Onde:** `apps/mobile/src/lib/secureStorage.ts:10`

## DO-003 — Secrets scanning ausente (HIGH)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: sem secrets scanning. RUN-0002: gitleaks em todo o histórico no CI.
- **Correção:** Implementar gitleaks ou trufflehog na CI. Adicionar pre-commit hook com detect-secrets. Habilitar GitHub secret scanning se disponível.
- **Onde:** `.github/workflows/ci.yml:54`

## FE-001 — Tokens armazenados em localStorage (HIGH)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: parcial → R0004: ok
- **Evidência:** Painel do suporte guardava a sessão no localStorage (padrão do supabase-js), legível por qualquer script da página. RUN-0004: sessionStorage (some ao fechar a aba) + CSP estrita + SRI + segundo fator.
- **Correção:** Mover auth tokens para httpOnly cookies. Se SPA, usar BFF (Backend For Frontend) pattern com cookies httpOnly. localStorage apenas para preferências não-sensíveis. | Aplicado: sessionStorage no painel
- **Onde:** `apps/mobile/src/lib/supabase.ts:35`; `security/reports/phase2/evidence/run3-static-findings.txt:17`; `apps/admin/index.html:113`

## FU-001 — Uploads sem validação de tipo (HIGH)

- **Histórico:** R0001: parcial → R0002: parcial → R0003: parcial → R0004: ok
- **Evidência:** Tipo validado só pela extensão e pelo Content-Type declarado. RUN-0004: o robô confere o tipo real pelos primeiros bytes (JPEG/PNG/WebP) em fotos e selfies; arquivo que não é imagem sai do perfil.
- **Correção:** Whitelist de extensões e MIME types permitidos. Validar magic bytes com library (file-type, python-magic). Rejeitar tudo que não está na whitelist. | Aplicado: conferência de bytes no robô
- **Onde:** `supabase/migrations/0004_supabase_platform.sql:7`; `supabase/migrations/0006_platform_hardening.sql:13`; `security/reports/phase2/evidence/run3-static-findings.txt:40`; `supabase/functions/_shared/photo-decision.js:5`; `supabase/functions/report-triage/index.ts:99`; `supabase/tests/security-run3.test.mjs:97`

## FU-006 — Filenames não sanitizados (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: a policy só exigia a pasta do usuário; qualquer nome de arquivo era aceito. RUN-0002: regex de nome e extensão na policy do Storage e na tabela.
- **Correção:** Substituir filename por UUID + extensão validada. Armazenar nome original apenas em DB (sanitizado). Nunca usar filename original em path do filesystem.
- **Onde:** `supabase/migrations/0006_platform_hardening.sql:13`; `supabase/migrations/0005_security_hardening.sql:29`

## SS-005 — Sessões sem expiração (HIGH)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Ver AU-005: jwt_expiry 3600 versionado no RUN-0002.
- **Correção:** Configurar TTL máximo de sessão. Implementar idle timeout. Configurar cleanup de sessões expiradas no store.
- **Onde:** `supabase/config.toml:14`

## AP-003 — Enumeração de usuários (MEDIUM)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: tela de cadastro exibia a mensagem crua do servidor (podia revelar e-mail existente). RUN-0002: mensagem genérica + enable_confirmations.
- **Correção:** Retornar mesma mensagem independente de existência: 'Se a conta existir, enviaremos um email'. Usar timing constante. Considerar CAPTCHA após N tentativas.
- **Onde:** `apps/mobile/app/entrar.tsx:32`; `supabase/config.toml:42`

## AP-006 — Ausência de paginação (MEDIUM)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: my_matches() sem limite. RUN-0002: limit 200; discover limitado a 50; mensagens por cursor.
- **Correção:** Implementar paginação em todos os endpoints de listagem. Default: 20-50 items. Max: 100. Retornar metadata de paginação (total, next, prev).
- **Onde:** `supabase/migrations/0005_security_hardening.sql:320`

## AZ-005 — Escopo de permissões mal definido (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: is_blocked_pair liberada ao papel authenticated permitia a qualquer usuário descobrir se A bloqueou B (PoC E4); tabelas/funções futuras herdariam grants padrão do Supabase. RUN-0002: revoke + alter default privileges.
- **Correção:** Implementar RBAC ou ABAC granular. Definir permissões por recurso e ação. Auditar roles periodicamente. Documentar matriz de permissões.
- **Onde:** `supabase/migrations/0003_security.sql:99`; `supabase/migrations/0005_security_hardening.sql:511`; `supabase/migrations/0005_security_hardening.sql:527`

## BL-004 — Abuso de fluxo de negócio permitido (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: FALHA → R0004: ok
- **Evidência:** Lista de espera: join_waitlist fazia upsert pelo e-mail, então qualquer pessoa trocava a cidade e o gênero de outra (PoC E1). RUN-0004: e-mail repetido não altera nada e a resposta é a mesma (não revela quem está na lista).
- **Correção:** Definir limits por usuário para fluxos de alto valor (N compras de produto limitado, M cupons por mês). Implementar detecção de múltiplas contas (mesmo device, mesmo IP, mesmo CPF). Soft-approval para ações de alto valor. Rate limit mais agressivo em endpoints de busca/catálogo. Considerar impact analysis no threat model. | Aplicado: 0016: on conflict do nothing
- **Onde:** `supabase/migrations/0002_functions.sql:484`; `supabase/migrations/0005_security_hardening.sql:364`; `security/reports/phase2/evidence/baseline-poc.txt:3`; `security/reports/phase2/evidence/post-remediation-poc.txt:3`; `supabase/migrations/0014_waitlist.sql:55`; `security/reports/phase2/evidence/run3-baseline-poc.txt:2`

## DA-003 — Ausência de política de retenção (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: parcial → R0004: ok
- **Evidência:** Lista de espera sem retenção. RUN-0004: inscrições apagadas em 365 dias, hash de IP em 30, pedidos de verificação recusados em 90; selfies apagadas depois da decisão.
- **Correção:** Definir política de retenção por tipo de dado. Implementar cleanup automático. Documentar e auditar compliance. | Aplicado: 0016: purge_expired_data
- **Onde:** `supabase/migrations/0005_security_hardening.sql:474`; `supabase/migrations/0006_platform_hardening.sql:32`; `security/reports/phase2/evidence/run3-static-findings.txt:47`; `supabase/migrations/0016_security_run3.sql:12`

## DO-002 — Pipeline sem análise de segurança (MEDIUM)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: CI só com testes funcionais. RUN-0002: jobs de secrets, SAST, dependências e regressões de segurança.
- **Correção:** Integrar SAST (Semgrep, SonarQube) na CI. Configurar para bloquear em findings high/critical. Adicionar dependency scanning.
- **Onde:** `.github/workflows/ci.yml:49`; `.github/workflows/ci.yml:76`

## DO-004 — SAST não implementado (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: sem SAST. RUN-0002: Semgrep (typescript, react, secrets) no CI. Não executado localmente.
- **Correção:** Implementar Semgrep (open source, multi-linguagem) ou SonarQube. Configurar na CI. Triage findings regularmente.
- **Onde:** `.github/workflows/ci.yml:81`

## IV-006 — Inputs não validados (MEDIUM)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: storage_path sem validação de formato. RUN-0002: regex de caminho/extensão.
- **Correção:** Validar todos os inputs no ponto de entrada. Definir schemas com tipos, limites e formatos. Rejeitar input malformado com 400.
- **Onde:** `supabase/migrations/0005_security_hardening.sql:30`

## LM-004 — Ausência de alertas de segurança (MEDIUM)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: ok
- **Evidência:** Alertas ficavam só na tabela security_alerts. RUN-0004: o robô manda um resumo (tipo e horário, sem conteúdo) para o webhook do suporte (Slack/Discord/Google Chat) e marca cada alerta como avisado.
- **Correção:** Configurar alertas para: auth failures > threshold, error rate spikes, suspicious patterns. Integrar com Sentry/Datadog/PagerDuty. | Aplicado: alerts_to_notify + webhook
- **Onde:** `supabase/migrations/0005_security_hardening.sql:44`; `security/reports/phase2/evidence/run3-static-findings.txt:43`; `supabase/migrations/0016_security_run3.sql:229`; `supabase/functions/report-triage/index.ts:9`

## SH-001 — Content-Security-Policy ausente (MEDIUM)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Site (apps/site) e painel (apps/admin) sem Content-Security-Policy. RUN-0004: CSP default-src 'none' com hash dos scripts inline (apps/security-headers.py), em _headers e em <meta>; o CI falha se ficar desatualizada; script do CDN com SRI.
- **Correção:** Implementar CSP restritivo. Usar nonce ou hash para inline scripts. Reportar violations com report-uri. | Aplicado: _headers + meta CSP + SRI
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:21`; `apps/site/_headers:3`; `apps/admin/index.html:80`

## SH-002 — Strict-Transport-Security ausente (MEDIUM)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Sem HSTS no site e no painel. RUN-0004: Strict-Transport-Security de 2 anos com preload em _headers.
- **Correção:** Adicionar Strict-Transport-Security: max-age=31536000; includeSubDomains; preload. | Aplicado: _headers
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:23`; `apps/site/_headers:4`

## SH-003 — X-Frame-Options ausente (MEDIUM)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Páginas podiam ser carregadas em iframe (clickjacking no painel). RUN-0004: X-Frame-Options DENY e frame-ancestors 'none'.
- **Correção:** Adicionar X-Frame-Options: DENY (ou SAMEORIGIN se iframe necessário). Preferir CSP frame-ancestors. | Aplicado: _headers
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:23`; `apps/admin/_headers:5`

## SS-006 — Tokens reutilizáveis (MEDIUM)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Ver AU-007: refresh token rotativo no RUN-0002.
- **Correção:** Invalidar tokens de uso único imediatamente após consumo. Implementar refresh token rotation. Detectar reuso de refresh token como sinal de comprometimento.
- **Onde:** `supabase/config.toml:17`

## DS-005 — Dependências externas não auditadas (LOW)

- **Histórico:** R0001: FALHA → R0002: parcial → R0003: parcial → R0004: ok
- **Evidência:** Actions do CI referenciadas por tag móvel (@v4). RUN-0004: fixadas por SHA de commit; Dependabot segue propondo updates; deno check das Edge Functions no CI.
- **Correção:** Auditar dependências diretas periodicamente. Usar ferramentas como socket.dev ou snyk para visibilidade de supply chain. | Aplicado: dependabot.yml; pendente: fixar actions por SHA; actions por SHA
- **Onde:** `.github/dependabot.yml:4`; `security/reports/phase2/evidence/run3-static-findings.txt:27`; `.github/workflows/ci.yml:20`

## DS-006 — Build não reproduzível (LOW)

- **Histórico:** R0001: parcial → R0002: ok → R0003: ok → R0004: ok
- **Evidência:** Baseline: CI usava 'npm install'. RUN-0002: 'npm ci' com lockfile.
- **Correção:** Pinar todas as versões de base images. Usar npm ci / pip install --require-hashes. Documentar processo de build reproduzível.
- **Onde:** `.github/workflows/ci.yml:23`

## SH-004 — X-Content-Type-Options ausente (LOW)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Sem X-Content-Type-Options. RUN-0004: nosniff em _headers.
- **Correção:** Adicionar X-Content-Type-Options: nosniff em todas as respostas. | Aplicado: _headers
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:23`; `apps/site/_headers:6`

## SH-005 — Referrer-Policy ausente (LOW)

- **Histórico:** R0001: n/a → R0002: n/a → R0003: FALHA → R0004: ok
- **Evidência:** Sem Referrer-Policy. RUN-0004: strict-origin-when-cross-origin em _headers.
- **Correção:** Adicionar Referrer-Policy: strict-origin-when-cross-origin (ou no-referrer para máxima privacidade). | Aplicado: _headers
- **Onde:** `security/reports/phase2/evidence/run3-static-findings.txt:23`; `apps/site/_headers:7`

