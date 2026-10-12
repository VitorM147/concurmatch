"""Resultados dos 108 checks do playbook ESAA-Security para o Probatório/ConcurMatch.

Este arquivo é a SAÍDA DO AGENTE (o que foi investigado). O orquestrador
(`esaa_project.py`) valida, grava os eventos, projeta o estado e calcula o score.

Cada check tem dois estados:
  base  -> RUN-SEC-0001 (código antes das correções)
  final -> RUN-SEC-0002 (depois das migrations 0005/0006, app e CI)

Evidência: (arquivo, regex). O orquestrador resolve a linha e o trecho.
Migrations são append-only, então o código vulnerável do baseline continua
em 0002/0003 e a correção fica em 0005/0006.
"""

PASS, FAIL, PARTIAL, NA = "pass", "fail", "partial", "not_applicable"

M2 = "supabase/migrations/0002_functions.sql"
M3 = "supabase/migrations/0003_security.sql"
M4 = "supabase/migrations/0004_supabase_platform.sql"
M5 = "supabase/migrations/0005_security_hardening.sql"
M6 = "supabase/migrations/0006_platform_hardening.sql"
CFG = "supabase/config.toml"
CI = ".github/workflows/ci.yml"
SUPA = "apps/mobile/src/lib/supabase.ts"
SEC_TEST = "supabase/tests/security.test.mjs"
POC_B = "security/reports/phase2/evidence/baseline-poc.txt"
POC_A = "security/reports/phase2/evidence/post-remediation-poc.txt"

NO_ENDPOINT = "endpoint_not_provided: porção runtime não executada (static-first)"


def C(check_id, base, final, conf, desc, ev=(), types=("code_snippet",), src=("static_analysis",),
      fix=None, refs=(), tool=None, fallback=None, conf_base=None):
    return dict(check_id=check_id, base=base, final=final, confidence=conf, confidence_base=conf_base or conf,
                description=desc, evidence=list(ev), evidence_types=list(types), evidence_sources=list(src),
                fix=fix, cross_refs=list(refs), tool=tool, fallback=fallback)


CHECKS = [
    # ------------------------------------------------------------ SEC-010 secrets_config
    C("SC-001", PASS, PASS, "high",
      "detect-secrets 1.5.0 em todo o repo: 3 ocorrências, todas falso-positivas (palavras-chave 'password_requirements', "
      "'secure_password_change' e a referência env(SUPABASE_AUTH_CAPTCHA_SECRET)). Nenhum segredo real.",
      ev=[("security/reports/phase2/evidence/detect-secrets.json", "Secret Keyword")],
      types=("tool_output",), src=("static_analysis", "detect-secrets"), tool="detect-secrets"),
    C("SC-002", PASS, PASS, "high",
      "O app só recebe EXPO_PUBLIC_SUPABASE_URL e a chave anon (pública por design, protegida por RLS). "
      "RUN-0002 acrescenta trava que recusa chave sb_secret_ ou JWT com role service_role.",
      ev=[(SUPA, r"service_role no app")], fix="assertPublicKey() em supabase.ts"),
    C("SC-003", PASS, PASS, "high", ".env está no .gitignore; só existe .env.example com placeholders.",
      ev=[("apps/mobile/.gitignore", r"^\.env"), ("apps/mobile/.env.example", r"SEU-PROJETO")], types=("config_artifact",)),
    C("SC-004", NA, NA, "medium",
      "CORS é gerenciado pelo Supabase; não há servidor HTTP próprio nem cliente web no escopo.",
      types=("doc_reference",), fallback=NO_ENDPOINT),
    C("SC-005", PASS, PASS, "high", "Sem flags de debug. __DEV__ só libera HTTP para Supabase local em desenvolvimento.",
      ev=[(SUPA, r"__DEV__")]),
    C("SC-006", PASS, PASS, "high", "Nenhuma credencial padrão; autenticação inteira no Supabase Auth.",
      ev=[("security/reports/phase2/evidence/grep-dangerous-patterns.txt", r".*")], types=("tool_output",)),
    C("SC-007", PASS, PASS, "high", ".env.example e o CI usam valores de exemplo que não autenticam em nada.",
      ev=[(CI, r"ci-placeholder")], types=("config_artifact",)),
    C("SC-008", PASS, PASS, "high", "Zero chamadas console.* em src/ e app/ (grep).",
      ev=[("security/reports/phase2/evidence/grep-dangerous-patterns.txt", r".*")], types=("tool_output",), refs=("LM-001",)),

    # ------------------------------------------------------------ SEC-011 dependencies
    C("DS-001", FAIL, PARTIAL, "medium",
      "npm audit (apps/mobile). Baseline: 30 vulnerabilidades (19 HIGH, 11 MODERATE). RUN-0002: 22 (19 HIGH, 3 MODERATE) após "
      "override de uuid@11 no xcode e remoção do AsyncStorage. Os HIGH restantes (braces, micromatch, node-forge via metro/@expo/cli) "
      "são de ferramentas de build, não entram no bundle e não têm versão corrigida publicada; decode-uri-component (MODERATE, runtime "
      "via expo-router) tem correção só em ESM, que quebra o query-string (testado). Risco aceito com prazo em SECURITY.md; CI bloqueia CRITICAL.",
      ev=[("security/reports/phase2/evidence/npm-audit-mobile-post.json", r'"high"'), ("apps/mobile/package.json", r'"overrides"')],
      types=("tool_output", "config_artifact"), src=("static_analysis", "npm_audit"), tool="npm audit", refs=("FE-003",),
      fix="overrides uuid@^11.1.1; job 'dependencies' no CI; Dependabot"),
    C("DS-002", PASS, PASS, "medium", "Dependências diretas mantidas (Expo SDK 57, supabase-js 2.117, PGlite 0.5).",
      ev=[("apps/mobile/package.json", r'"expo":')], types=("config_artifact",)),
    C("DS-003", PASS, PASS, "high", "Nomes conferidos contra os pacotes oficiais (@supabase/*, expo-*, react-native-*, @electric-sql/pglite).",
      ev=[("apps/mobile/package.json", r"@supabase/supabase-js")], types=("config_artifact",)),
    C("DS-004", PASS, PASS, "high", "package-lock.json versionado em apps/mobile e supabase/tests.",
      ev=[("apps/mobile/package-lock.json", r'"lockfileVersion"'), ("supabase/tests/package-lock.json", r'"lockfileVersion"')],
      types=("config_artifact",)),
    C("DS-005", FAIL, PARTIAL, "medium",
      "Baseline: nenhum processo de revisão de dependências. RUN-0002: Dependabot (npm + actions). Actions referenciadas por tag, não por SHA.",
      ev=[(".github/dependabot.yml", r"package-ecosystem")], types=("config_artifact",),
      fix="dependabot.yml; pendente: fixar actions por SHA"),
    C("DS-006", PARTIAL, PASS, "high", "Baseline: CI usava 'npm install'. RUN-0002: 'npm ci' com lockfile.",
      ev=[(CI, r"npm ci")], types=("config_artifact",)),

    # ------------------------------------------------------------ SEC-012 authentication
    C("AU-001", PASS, PASS, "medium", "Senhas só no Supabase Auth (bcrypt); o app nunca persiste senha.",
      ev=[("apps/mobile/app/entrar.tsx", r"signInWithPassword")], types=("code_snippet", "doc_reference")),
    C("AU-002", PASS, PASS, "medium", "Hash gerenciado pelo GoTrue (bcrypt).", types=("doc_reference",)),
    C("AU-003", FAIL, PARTIAL, "high",
      "Baseline: sem MFA. RUN-0002: TOTP habilitado no servidor (config.toml); falta a tela de ativação no app.",
      ev=[(CFG, r"\[auth\.mfa\.totp\]")], types=("config_artifact",), conf_base="medium"),
    C("AU-004", PARTIAL, PASS, "medium",
      "Baseline: política de troca/reset de senha não versionada. RUN-0002: secure_password_change, otp_expiry 1h, max_frequency 1m.",
      ev=[(CFG, r"secure_password_change")], types=("config_artifact",)),
    C("AU-005", PARTIAL, PASS, "medium", "Baseline: expiração do JWT não versionada. RUN-0002: jwt_expiry = 3600.",
      ev=[(CFG, r"jwt_expiry")], types=("config_artifact",), refs=("SS-005",)),
    C("AU-006", PARTIAL, PASS, "medium",
      "Baseline: limite de tentativas dependia de padrão não versionado; validação só no app. RUN-0002: [auth.rate_limit] versionado.",
      ev=[(CFG, r"sign_in_sign_ups")], types=("config_artifact",), fallback=NO_ENDPOINT, refs=("BL-002",)),
    C("AU-007", PARTIAL, PASS, "medium", "Baseline: rotação de refresh token não versionada. RUN-0002: rotação + reuse_interval 10s.",
      ev=[(CFG, r"enable_refresh_token_rotation")], types=("config_artifact",), refs=("SS-006",)),
    C("AU-008", NA, NA, "high", "Sem sessão de servidor nem cookies: autenticação por bearer token.", types=("doc_reference",)),
    C("AU-009", PASS, PASS, "medium", "O app não emite nem valida JWT; quem valida é o Supabase. Nenhum uso de alg none.",
      types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-013 authorization
    C("AZ-001", PASS, PASS, "high", "RLS ligado em todas as tabelas; app sem grant em likes/passes/blocks/reports (teste 'RLS: não lê...').",
      ev=[(M3, r"enable row level security")], types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_test")),
    C("AZ-002", FAIL, PASS, "high",
      "IDOR confirmado por prova de conceito: (E1) usuário cadastrava em 'photos' o storage_path da foto de OUTRA pessoa e a exibia "
      "no próprio perfil (a policy de leitura do Storage aceitava); (E6) denúncia aceitava match_id de terceiros. "
      "RUN-0002: constraint photos_path_owner + validação do match em report_user. PoC agora bloqueada.",
      ev=[(M3, r"grant insert \(user_id, storage_path, position\)"), (M5, r"photos_path_owner"), (M5, r"INVALID_MATCH"), (POC_B, r"^E1"), (POC_A, r"^E1")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc"), refs=("FU-006",), conf_base="high"),
    C("AZ-003", PARTIAL, PASS, "high",
      "Baseline: consentimento LGPD e exigência de foto só no app (perfil podia ser criado direto na API sem consentimento, PoC E5). "
      "RUN-0002: trigger require_consents no servidor.",
      ev=[(M5, r"create trigger profiles_require_consents"), (POC_B, r"^E5")], types=("code_snippet", "tool_output"),
      src=("static_analysis", "pglite_poc"), refs=("DA-005",)),
    C("AZ-004", NA, NA, "high", "Não existe painel nem rota administrativa no repositório.", fallback=NO_ENDPOINT, types=("doc_reference",)),
    C("AZ-005", FAIL, PASS, "high",
      "Baseline: is_blocked_pair liberada ao papel authenticated permitia a qualquer usuário descobrir se A bloqueou B (PoC E4); "
      "tabelas/funções futuras herdariam grants padrão do Supabase. RUN-0002: revoke + alter default privileges.",
      ev=[(M3, r"grant execute on function public\.is_blocked_pair"), (M5, r"revoke execute on function public\.is_blocked_pair"),
          (M5, r"alter default privileges in schema public revoke all on functions")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc")),
    C("AZ-006", PASS, PASS, "high", "Excluir conta exige confirmação; bloquear/denunciar passam por folha de confirmação.",
      ev=[("apps/mobile/app/(tabs)/perfil.tsx", r"Excluir tudo")]),

    # ------------------------------------------------------------ SEC-014 api_security
    C("AP-001", FAIL, PARTIAL, "high",
      "Baseline: swipe_pass sem limite permitia varrer todos os perfis da região (PoC E7: 150 passes seguidos). "
      "RUN-0002: rate limit em passes (120/min, 2000/dia), curtidas (60/min, teto Premium 1000/dia), mensagens e denúncias. "
      "Leitura (discover/my_matches) continua sem limite próprio: depende do gateway do Supabase.",
      ev=[(M5, r"create function public\.enforce_rate_limit"), (POC_B, r"^E7"), (POC_A, r"^E7")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc"), fallback=NO_ENDPOINT, refs=("BL-002",)),
    C("AP-002", PASS, PASS, "high", "discover() não devolve data de nascimento nem coordenadas: só idade e faixa de distância.",
      ev=[(M5, r"public\.distance_label\(l\.dist\)")]),
    C("AP-003", PARTIAL, PASS, "medium",
      "Baseline: tela de cadastro exibia a mensagem crua do servidor (podia revelar e-mail existente). "
      "RUN-0002: mensagem genérica + enable_confirmations.",
      ev=[("apps/mobile/app/entrar.tsx", r"não revela se o e-mail existe"), (CFG, r"enable_confirmations")],
      types=("code_snippet", "config_artifact"), fallback=NO_ENDPOINT),
    C("AP-004", PASS, PASS, "high", "Parâmetros tipados nas RPCs, enums e check constraints em todas as colunas de entrada.",
      ev=[("supabase/migrations/0001_schema.sql", r"check \(char_length\(display_name\)")]),
    C("AP-005", PARTIAL, PARTIAL, "medium", "RPCs sem versionamento; mudança incompatível exigiria nova função (ex.: discover_v2).",
      ev=[(M2, r"create function public\.discover")]),
    C("AP-006", PARTIAL, PASS, "high", "Baseline: my_matches() sem limite. RUN-0002: limit 200; discover limitado a 50; mensagens por cursor.",
      ev=[(M5, r"limit 200")]),
    C("AP-007", PASS, PASS, "high", "Curtida repetida é idempotente e não consome cota; inserts com on conflict.",
      ev=[(M5, r"like repetido|duplicate")]),
    C("AP-008", PASS, PASS, "high", "Grants por coluna: usuário não altera verified, banned_at, birthdate, gender, approved (teste dedicado).",
      ev=[(M3, r"grant update \(display_name")], types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_test")),
    C("AP-009", NA, NA, "high", "Sem consumo de API externa no backend (pagamentos ainda não integrados).", types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-015 input_validation
    C("IV-001", PASS, PASS, "high", "Nenhum SQL dinâmico (grep por EXECUTE/format: zero). Todas as funções usam parâmetros.",
      ev=[("security/reports/phase2/evidence/grep-dangerous-patterns.txt", r".*")], types=("tool_output",)),
    C("IV-002", NA, NA, "high", "Nenhuma execução de comando de sistema.", types=("doc_reference",)),
    C("IV-003", NA, NA, "high", "Sem templates renderizados no servidor.", types=("doc_reference",)),
    C("IV-004", NA, NA, "high", "O backend não busca URLs fornecidas pelo usuário.", types=("doc_reference",)),
    C("IV-005", PASS, PASS, "high", "React Native renderiza texto puro (<Text>); sem WebView nem innerHTML.",
      ev=[("apps/mobile/app/chat/[id].tsx", r"\{item\.body\}")], fallback=NO_ENDPOINT),
    C("IV-006", PARTIAL, PASS, "high", "Baseline: storage_path sem validação de formato. RUN-0002: regex de caminho/extensão.",
      ev=[(M5, r"storage_path ~")], refs=("FU-006",)),
    C("IV-007", PASS, PASS, "high", "Textos aparados (btrim) e exibidos como texto puro.", ev=[(M5, r"new\.body := btrim")]),
    C("IV-008", NA, NA, "high", "Sem desserialização de objetos não confiáveis.", types=("doc_reference",)),
    C("IV-009", NA, NA, "high", "Sem XML.", types=("doc_reference",)),
    C("IV-010", NA, NA, "high", "Sem redirecionamentos; deep link sem destino variável e detectSessionInUrl: false.",
      ev=[(SUPA, r"detectSessionInUrl: false")]),

    # ------------------------------------------------------------ SEC-016 file_upload
    C("FU-001", PARTIAL, PARTIAL, "medium",
      "Bucket restringe MIME (image/jpeg|png|webp) pelo Content-Type declarado; RUN-0002 exige extensão de imagem. "
      "Não há verificação do conteúdo real (magic bytes) no servidor.",
      ev=[(M4, r"allowed_mime_types"), (M6, r"name ~")], types=("code_snippet", "config_artifact")),
    C("FU-002", PASS, PASS, "high", "Limite de 5 MB no bucket e redimensionamento para 1080 px no app.",
      ev=[(M4, r"5242880")], types=("config_artifact",)),
    C("FU-003", PASS, PASS, "high", "Arquivos no Storage (objeto), nunca no servidor da aplicação.", ev=[(M4, r"storage\.buckets")]),
    C("FU-004", FAIL, FAIL, "high",
      "Não há varredura de malware nem moderação automática de imagem (nudez, menores, rostos). Planejado: AWS Rekognition "
      "atualizando photos.approved antes do lançamento público.",
      ev=[("supabase/migrations/0001_schema.sql", r"approved\s+boolean not null default true")]),
    C("FU-005", PASS, PASS, "high", "Bucket privado, só MIME de imagem, entregue por URL assinada; nada é executado.",
      ev=[(M4, r"'photos', 'photos', false")], types=("config_artifact",)),
    C("FU-006", PARTIAL, PASS, "high",
      "Baseline: a policy só exigia a pasta do usuário; qualquer nome de arquivo era aceito. RUN-0002: regex de nome e extensão "
      "na policy do Storage e na tabela.",
      ev=[(M6, r"\[A-Za-z0-9_-\]\{1,64\}"), (M5, r"photos_path_owner")], refs=("AZ-002",)),

    # ------------------------------------------------------------ SEC-017 session_security
    C("SS-001", NA, NA, "high", "App mobile sem cookies (bearer token).", types=("doc_reference",), fallback=NO_ENDPOINT),
    C("SS-002", NA, NA, "high", "App mobile sem cookies.", types=("doc_reference",), fallback=NO_ENDPOINT),
    C("SS-003", NA, NA, "high", "App mobile sem cookies.", types=("doc_reference",), fallback=NO_ENDPOINT),
    C("SS-004", NA, NA, "high", "Token vai no header Authorization, não em cookie: CSRF não se aplica.", types=("doc_reference",)),
    C("SS-005", PARTIAL, PASS, "medium", "Ver AU-005: jwt_expiry 3600 versionado no RUN-0002.",
      ev=[(CFG, r"jwt_expiry")], types=("config_artifact",), refs=("AU-005",)),
    C("SS-006", PARTIAL, PASS, "medium", "Ver AU-007: refresh token rotativo no RUN-0002.",
      ev=[(CFG, r"refresh_token_reuse_interval")], types=("config_artifact",), refs=("AU-007",)),

    # ------------------------------------------------------------ SEC-018 cryptography
    C("CR-001", PARTIAL, PASS, "high", "Baseline: o app aceitava qualquer URL, inclusive http://. RUN-0002: exige https:// fora do dev local.",
      ev=[(SUPA, r"precisa usar https")], fallback=NO_ENDPOINT, refs=("IF-001",)),
    C("CR-002", PASS, PASS, "high", "Nenhuma criptografia própria; TLS e bcrypt gerenciados.", types=("doc_reference",)),
    C("CR-003", FAIL, PASS, "high",
      "Baseline: access e refresh token gravados no AsyncStorage (texto puro no aparelho). RUN-0002: Keychain/Keystore via "
      "expo-secure-store com acesso 'após o primeiro desbloqueio, só neste aparelho'. Dados no banco: criptografia em disco do provedor.",
      ev=[("apps/mobile/src/lib/secureStorage.ts", r"AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY")], refs=("FE-001",)),
    C("CR-004", PASS, PASS, "high", "Nenhuma chave criptográfica no repositório (detect-secrets).",
      ev=[("security/reports/phase2/evidence/detect-secrets.json", r'"results"')], types=("tool_output",), tool="detect-secrets"),
    C("CR-005", FAIL, PARTIAL, "medium", "Baseline: sem processo de rotação. RUN-0002: runbook em SECURITY.md (manual, não automatizado).",
      ev=[("SECURITY.md", r"## Rotação de chaves")], types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-019 security_headers
    *[C(cid, NA, NA, "medium", "Sem servidor web nem app web no escopo; headers da API são do Supabase.",
        types=("doc_reference",), fallback=NO_ENDPOINT) for cid in ("SH-001", "SH-002", "SH-003", "SH-004", "SH-005")],

    # ------------------------------------------------------------ SEC-020 logging_monitoring
    C("LM-001", PASS, PASS, "high", "Nenhum log com dado pessoal; audit_logs guarda IDs, não conteúdo.",
      ev=[(M2, r"insert into public\.audit_logs \(actor_id, action\)")], refs=("SC-008",)),
    C("LM-002", PASS, PASS, "high", "audit_logs registra bloqueio, ocultação automática, exclusão de conta e (RUN-0002) expurgo de retenção.",
      ev=[(M5, r"'retention_purge'")]),
    C("LM-003", PARTIAL, PARTIAL, "medium", "audit_logs é estruturado (jsonb), mas o app não tem log/crash reporting estruturado.",
      ev=[("supabase/migrations/0001_schema.sql", r"create table public\.audit_logs")]),
    C("LM-004", FAIL, PARTIAL, "high",
      "Baseline: nenhum alerta. RUN-0002: fila security_alerts (denúncia de menor, pico de denúncias, ocultação, rate limit). "
      "Falta canal de notificação (webhook/e-mail).",
      ev=[(M5, r"create table public\.security_alerts")]),
    C("LM-005", PARTIAL, PARTIAL, "low", "Request ID existe só nos logs do Supabase; o app não propaga ID de correlação.",
      types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-021 infrastructure
    C("IF-001", PASS, PASS, "medium", "Endpoints do Supabase são HTTPS; RUN-0002 também força no cliente.",
      ev=[(SUPA, r"https://")], fallback=NO_ENDPOINT, refs=("CR-001",)),
    C("IF-002", NA, NA, "low", "BaaS gerenciado: sem servidores nem regras de firewall no repositório.", types=("doc_reference",)),
    C("IF-003", NA, NA, "low", "Sem origem web própria a proteger com WAF.", types=("doc_reference",)),
    C("IF-004", NA, NA, "low", "Sem rede própria; isolamento é do provedor.", types=("doc_reference",)),
    C("IF-005", PARTIAL, PARTIAL, "low", "Backup depende do plano do Supabase e não é verificável no repo; exigência registrada em SECURITY.md.",
      ev=[("SECURITY.md", r"Database → Backups")], types=("doc_reference",)),
    C("IF-006", PARTIAL, PARTIAL, "low", "Proteção de borda do provedor + rate limits de aplicação (RUN-0002); sem proteção dedicada.",
      types=("doc_reference",)),
    C("IF-007", NA, NA, "high", "Sem containers.", types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-022 devsecops
    C("DO-001", FAIL, PARTIAL, "medium",
      "Baseline: sem CODEOWNERS nem template de PR. RUN-0002: ambos criados; proteção da branch é configuração do GitHub (fora do repo).",
      ev=[(".github/CODEOWNERS", r"\*"), (".github/pull_request_template.md", r"Checklist de segurança")], types=("config_artifact",)),
    C("DO-002", PARTIAL, PASS, "high", "Baseline: CI só com testes funcionais. RUN-0002: jobs de secrets, SAST, dependências e regressões de segurança.",
      ev=[(CI, r"name: Secrets scanning"), (CI, r"name: SAST")], types=("config_artifact",)),
    C("DO-003", FAIL, PASS, "high", "Baseline: sem secrets scanning. RUN-0002: gitleaks em todo o histórico no CI.",
      ev=[(CI, r"gitleaks/gitleaks-action")], types=("config_artifact",), conf_base="medium"),
    C("DO-004", FAIL, PASS, "medium", "Baseline: sem SAST. RUN-0002: Semgrep (typescript, react, secrets) no CI. Não executado localmente.",
      ev=[(CI, r"semgrep scan")], types=("config_artifact",), fallback="semgrep indisponível no ambiente local; validado só por configuração"),
    C("DO-005", FAIL, FAIL, "medium", "Sem DAST. Para app mobile + BaaS, recomendado ZAP contra um projeto Supabase de staging.",
      types=("doc_reference",)),
    C("DO-006", PARTIAL, PARTIAL, "medium", "Migrations aplicadas manualmente via CLI/painel, sem pipeline de deploy auditável.",
      types=("doc_reference",)),

    # ------------------------------------------------------------ SEC-023 data_security
    C("DA-001", PASS, PASS, "medium", "Dado sensível (gênero/interesse) protegido por RLS; só o dono lê; usado apenas no filtro.",
      ev=[(M3, r"profiles_own_select")]),
    C("DA-002", PASS, PASS, "high", "Coordenadas arredondadas no servidor (~1 km); sem endereço; data de nascimento necessária para idade.",
      ev=[("supabase/migrations/0001_schema.sql", r"round\(new\.lat_approx, 2\)")]),
    C("DA-003", FAIL, PASS, "high",
      "Baseline: nenhuma retenção (mensagens, passes e logs para sempre). RUN-0002: purge_expired_data() diária via pg_cron, "
      "preservando conversas com denúncia aberta (teste dedicado).",
      ev=[(M5, r"create function public\.purge_expired_data"), (M6, r"cron\.schedule")], types=("code_snippet", "tool_output"),
      src=("static_analysis", "pglite_test")),
    C("DA-004", PASS, PASS, "high", "Exclusão em cascata; denúncias feitas pelo usuário ficam anônimas (reporter_id set null).",
      ev=[("supabase/migrations/0001_schema.sql", r"reporter_id uuid references public\.profiles\(id\) on delete set null")]),
    C("DA-005", FAIL, PARTIAL, "high",
      "Baseline: consentimento só no app (PoC E5), sem portabilidade e arquivos de foto ficavam no Storage após a exclusão. "
      "RUN-0002: consentimento exigido no servidor, export_my_data(), app apaga as fotos antes de excluir a conta. "
      "Pendente: texto da política de privacidade/termos e encarregado (DPO) — não estão no repositório.",
      ev=[(M5, r"create function public\.export_my_data"), ("apps/mobile/src/lib/api.ts", r"apaga os arquivos de foto"), (POC_A, r"^E5")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc"), refs=("AZ-003",)),

    # ------------------------------------------------------------ SEC-024 frontend_security
    C("FE-001", FAIL, PASS, "high",
      "Baseline: sessão no AsyncStorage (equivalente mobile do localStorage, texto puro). RUN-0002: secureStorage em pedaços no Keychain/Keystore.",
      ev=[(SUPA, r"storage: Platform\.OS === 'web' \? undefined : secureStorage")], refs=("CR-003",)),
    C("FE-002", NA, NA, "high", "React Native não renderiza HTML.", types=("doc_reference",)),
    C("FE-003", FAIL, PARTIAL, "medium", "Ver DS-001.", ev=[("security/reports/phase2/evidence/npm-audit-mobile-post.json", r'"total"')],
      types=("tool_output",), src=("static_analysis", "npm_audit"), tool="npm audit", refs=("DS-001",)),
    C("FE-004", PASS, PASS, "high", "Limite de curtidas, Premium, match, moderação e consentimento (RUN-0002) decididos no banco.",
      ev=[(M5, r"LIKE_LIMIT_REACHED")]),

    # ------------------------------------------------------------ SEC-025 ai_llm_security
    *[C(cid, NA, NA, "high", "O projeto não usa LLM.", types=("doc_reference",))
      for cid in ("AI-001", "AI-002", "AI-003", "AI-004", "AI-005", "AI-006", "AI-007")],

    # ------------------------------------------------------------ SEC-026 business_logic
    C("BL-001", FAIL, PASS, "high",
      "Baseline: a ocultação automática usava is_visible, que o próprio usuário religava no app (PoC E2). "
      "RUN-0002: coluna moderation_hidden_at sem grant; discover/like/chat respeitam.",
      ev=[(M2, r"update public\.profiles set is_visible = false where id = p_target"), (M5, r"add column moderation_hidden_at"),
          (POC_B, r"^E2"), (POC_A, r"^E2")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc")),
    C("BL-002", FAIL, PARTIAL, "high",
      "Baseline: sem anti-automação (passes ilimitados, Premium sem teto, sem CAPTCHA). RUN-0002: rate limits e teto Premium; "
      "CAPTCHA configurado mas desligado até o app enviar o token.",
      ev=[(M5, r"likes_per_day_premium"), (CFG, r"\[auth\.captcha\]")], types=("code_snippet", "config_artifact"),
      fallback=NO_ENDPOINT, refs=("AP-001", "AU-006")),
    C("BL-003", FAIL, PASS, "medium",
      "Baseline: swipe_like contava a cota e inseria sob lock apenas do PAR; requisições paralelas do mesmo usuário para alvos "
      "diferentes furavam o limite de 20 (TOCTOU). RUN-0002: pg_advisory_xact_lock por usuário antes da contagem.",
      ev=[(M2, r"v_left := public\.remaining_likes\(\)"), (M5, r"hashtextextended\('likes:'")],
      conf_base="medium"),
    C("BL-004", FAIL, PASS, "high",
      "Baseline: uma denúncia de 'menor de idade' de qualquer conta, mesmo criada no minuto anterior e sem foto, ocultava "
      "qualquer perfil (PoC E3) — arma para derrubar concorrentes. RUN-0002: só denunciantes confiáveis (conta 24h+, com foto, "
      "fora de revisão) contam; 2 para 'menor', 3 para os demais; toda denúncia gera alerta para revisão humana.",
      ev=[(M2, r"if p_reason = 'menor_de_idade'"), (M5, r"create function public\.is_trusted_reporter"), (POC_B, r"^E3"), (POC_A, r"^E3")],
      types=("code_snippet", "tool_output"), src=("static_analysis", "pglite_poc")),
]


# =====================================================================
# Rodadas 3 e 4 (12–13/10/2026): código novo das migrations 0008–0015,
# robôs (Edge Functions), painel do suporte e site.
#   r3 -> RUN-SEC-0003 (antes das correções; evidência do código antigo em
#         run3-static-findings.txt, tirada do commit 2aca6d1, e PoC run3-baseline-poc.txt)
#   r4 -> RUN-SEC-0004 (depois das migrations 0016/0017, robôs, painel, site e CI)
# Checks sem entrada aqui seguem com o status da RUN-SEC-0002 nas duas rodadas.
# Na descrição, o trecho depois de " RUN-0004:" só aparece na rodada 4.
# =====================================================================
M8 = "supabase/migrations/0008_verified_first_and_moderation.sql"
M12 = "supabase/migrations/0012_admin_panel_and_rules.sql"
M14 = "supabase/migrations/0014_waitlist.sql"
M16 = "supabase/migrations/0016_security_run3.sql"
M17 = "supabase/migrations/0017_platform_run3.sql"
ADMIN = "apps/admin/index.html"
HDR_SITE = "apps/site/_headers"
HDR_ADMIN = "apps/admin/_headers"
TRIAGE = "supabase/functions/report-triage/index.ts"
SELFIE = "supabase/functions/selfie-check/index.ts"
PHOTO = "supabase/functions/_shared/photo-decision.js"
T3 = "supabase/tests/security-run3.test.mjs"
POC3 = "security/reports/phase2/evidence/run3-baseline-poc.txt"
POC4 = "security/reports/phase2/evidence/run4-post-remediation-poc.txt"
STATIC3 = "security/reports/phase2/evidence/run3-static-findings.txt"
POC_SRC = ("static_analysis", "pglite_poc")


def U(check_id, r3, r4, desc, ev=(), fix=None, types=("code_snippet", "tool_output"), src=("static_analysis",), conf=None):
    return check_id, dict(r3=r3, r4=r4, desc=desc, ev=list(ev), fix=fix, types=list(types), src=list(src), conf=conf)


UPDATES = dict([
    U("AZ-004", FAIL, PASS,
      "Painel do suporte (apps/admin + funções admin_*) aceitava sessão só com senha: quem roubasse a senha de um admin banía "
      "perfis e lia selfies (PoC E3). RUN-0004: is_admin()/require_admin() exigem sessão aal2 (segundo fator TOTP); o painel "
      "cadastra e pede o código; a policy de leitura de selfies no Storage usa is_admin().",
      ev=[(M12, r"create function public\.require_admin"), (STATIC3, r"signInWithPassword"), (POC3, r"^E3"),
          (M16, r"MFA_REQUIRED"), (ADMIN, r"challengeAndVerify"), (POC4, r"^E3"), (T3, r"E3:")],
      src=POC_SRC, fix="0016: is_admin() exige aal2; painel com TOTP"),
    U("AU-003", PARTIAL, PARTIAL,
      "TOTP habilitado no servidor; o painel do suporte não pedia segundo fator. RUN-0004: segundo fator obrigatório para "
      "admins (aal2 no banco). Usuários do app ainda não têm tela de ativação de MFA (opcional para eles).",
      ev=[(STATIC3, r"ocorrências de 'mfa'"), (M16, r"admin_requires_mfa")], fix="0016 + painel"),
    U("BL-001", FAIL, PASS,
      "Verificação de perfil: submit_verification aceitava qualquer caminho na pasta do usuário — foto antiga da galeria "
      "renomeada (PoC E4) ou arquivo inexistente (PoC E5), furando o desafio do rosto. RUN-0004: o arquivo precisa existir no "
      "Storage e ter sido enviado depois do desafio; o robô recusa arquivo que não é imagem e selfie apagada.",
      ev=[(M8, r"create function public\.submit_verification"), (POC3, r"^E4"), (POC3, r"^E5"),
          (M16, r"SELFIE_TOO_OLD"), (SELFIE, r"not_image"), (POC4, r"^E4"), (POC4, r"^E5"), (T3, r"E4:")],
      src=POC_SRC, fix="0016: submit_verification confere storage.objects"),
    U("BL-004", FAIL, PASS,
      "Lista de espera: join_waitlist fazia upsert pelo e-mail, então qualquer pessoa trocava a cidade e o gênero de outra "
      "(PoC E1). RUN-0004: e-mail repetido não altera nada e a resposta é a mesma (não revela quem está na lista).",
      ev=[(M14, r"on conflict \(lower\(email\)\) do update"), (POC3, r"^E1"),
          (M16, r"on conflict \(lower\(email\)\) do nothing"), (POC4, r"^E1"), (T3, r"E1:")],
      src=POC_SRC, fix="0016: on conflict do nothing"),
    U("BL-002", PARTIAL, PARTIAL,
      "Lista de espera aberta ao público (anon) só com limite global: um robô de um IP gravou 119 inscrições e travou o site "
      "para todos (PoC E2). RUN-0004: limite por IP (hash, apagado em 30 dias), campo-isca e disjuntor global alto. "
      "CAPTCHA do cadastro no app continua desligado até o app enviar o token.",
      ev=[(M14, r"waitlist_per_minute"), (POC3, r"^E2"), (M16, r"waitlist_per_ip_hour"), (M16, r"Campo-isca"),
          (POC4, r"^E2"), (T3, r"E2:")],
      src=POC_SRC, fix="0016: limite por IP + campo-isca"),
    U("AP-001", PARTIAL, PASS,
      "Endpoint público da lista de espera sem limite por origem (PoC E2). RUN-0004: limite por IP; curtir e passar já têm "
      "teto diário (10/50/250, migrations 0008/0009) além do limite por minuto.",
      ev=[(POC3, r"^E2"), (M8, r"ACTION_LIMIT_REACHED"), (M16, r"waitlist_per_ip_hour")], src=POC_SRC,
      fix="0016 + 0008/0009"),
    U("AP-009", PARTIAL, PASS,
      "Robôs chamam OpenAI e AWS sem timeout (uma chamada travada segura o robô inteiro). RUN-0004: AbortSignal.timeout de 15 s "
      "em toda chamada externa, resposta da Moderation API validada, falhas registradas sem o texto das conversas.",
      ev=[(STATIC3, r"await fetch\("), (STATIC3, r"aws\.send\("), (TRIAGE, r"AbortSignal\.timeout"), (SELFIE, r"abortSignal")],
      fix="timeouts nos robôs"),
    U("AI-001", PASS, PASS,
      "A Moderation API é um classificador: devolve só notas por categoria, não segue instruções do texto. A decisão sai de "
      "limites fixos no código, e o filtro de programa/cobrança do banco vale mais que a nota.",
      ev=[("supabase/functions/_shared/report-decision.js", r"export function decideReport"),
          ("supabase/migrations/0010_report_auto_triage.sql", r"sexual_service_signal_strict")],
      types=("code_snippet",), conf="medium"),
    U("AI-002", PASS, PASS,
      "Nenhum modelo tem acesso a ferramentas: o robô aplica a decisão por funções fixas (apply_report_triage com gravidade "
      "validada contra uma lista fechada).",
      ev=[("supabase/migrations/0010_report_auto_triage.sql", r"INVALID_SEVERITY")], types=("code_snippet",)),
    U("AI-003", PASS, PASS,
      "Entrada limitada ao que a pessoa denunciada escreveu, até 50 textos de 4.000 caracteres; fotos só depois de conferir os bytes.",
      ev=[(TRIAGE, r"slice\(0, 4000\)")], types=("code_snippet",)),
    U("AI-004", PASS, PASS,
      "Vai para a API só o texto da conversa denunciada (sem nomes, e-mails ou ids) e a foto em questão; a transferência "
      "internacional está descrita na Política de Privacidade (ver DA-005).",
      ev=[("supabase/migrations/0010_report_auto_triage.sql", r"where m->>'from' = 'denunciado'")], types=("code_snippet",)),
    U("AI-005", PASS, PASS,
      "Toda decisão automática guarda modelo, notas e motivo (reports.auto_scores, photos.auto_scores, "
      "verification_requests.auto_result) e entra em audit_logs.",
      ev=[("supabase/migrations/0010_report_auto_triage.sql", r"'auto_triage'"), (M16, r"'auto_photo_flag'")], types=("code_snippet",)),
    U("AI-006", PARTIAL, PASS,
      "Robô usava 'omni-moderation-latest' (o modelo muda sem aviso e os limites de decisão dependem dele). RUN-0004: modelo "
      "fixado na versão datada omni-moderation-2024-09-26; trocar passa por revisão.",
      ev=[(STATIC3, r"omni-moderation-latest"), (TRIAGE, r"omni-moderation-2024-09-26")], fix="modelo fixado"),
    U("AI-007", PASS, PASS,
      "Lotes pequenos por minuto (20 denúncias, 10 fotos, 5 selfies), entrada truncada e no máximo 3 pedidos de verificação "
      "por pessoa por dia; a Moderation API é gratuita.",
      ev=[(TRIAGE, r"REPORT_BATCH = 20"), (SELFIE, r"BATCH = 5")], types=("code_snippet",)),
    U("FU-001", PARTIAL, PASS,
      "Tipo validado só pela extensão e pelo Content-Type declarado. RUN-0004: o robô confere o tipo real pelos primeiros "
      "bytes (JPEG/PNG/WebP) em fotos e selfies; arquivo que não é imagem sai do perfil.",
      ev=[(STATIC3, r"magic number"), (PHOTO, r"export function sniffImage"), (TRIAGE, r"nao_e_imagem"), (T3, r"tipo real")],
      fix="conferência de bytes no robô"),
    U("FU-004", FAIL, PARTIAL,
      "Nenhuma checagem do conteúdo das fotos. RUN-0004: o robô passa cada foto nova pela Moderation API (nudez, menor, "
      "violência) e reprova automaticamente; sinal de menor esconde o perfil e abre denúncia. Não há antivírus, mas os "
      "arquivos são só imagens servidas por URL assinada e nunca executadas.",
      ev=[(STATIC3, r"moderação de imagem"), (TRIAGE, r"image_url"), (M16, r"create function public\.apply_photo_check")],
      fix="moderação de fotos no robô"),
    U("LM-004", PARTIAL, PASS,
      "Alertas ficavam só na tabela security_alerts. RUN-0004: o robô manda um resumo (tipo e horário, sem conteúdo) para o "
      "webhook do suporte (Slack/Discord/Google Chat) e marca cada alerta como avisado.",
      ev=[(STATIC3, r"webhook de alerta"), (M16, r"create function public\.alerts_to_notify"), (TRIAGE, r"ALERT_WEBHOOK_URL")],
      fix="alerts_to_notify + webhook"),
    U("DA-003", PARTIAL, PASS,
      "Lista de espera sem retenção. RUN-0004: inscrições apagadas em 365 dias, hash de IP em 30, pedidos de verificação "
      "recusados em 90; selfies apagadas depois da decisão.",
      ev=[(STATIC3, r"retenção da lista de espera"), (M16, r"retention_waitlist_days")], fix="0016: purge_expired_data"),
    U("FE-001", PARTIAL, PASS,
      "Painel do suporte guardava a sessão no localStorage (padrão do supabase-js), legível por qualquer script da página. "
      "RUN-0004: sessionStorage (some ao fechar a aba) + CSP estrita + SRI + segundo fator.",
      ev=[(STATIC3, r"supabase\.createClient\("), (ADMIN, r"storage: window\.sessionStorage")], fix="sessionStorage no painel"),
    U("SH-001", FAIL, PASS,
      "Site (apps/site) e painel (apps/admin) sem Content-Security-Policy. RUN-0004: CSP default-src 'none' com hash dos "
      "scripts inline (apps/security-headers.py), em _headers e em <meta>; o CI falha se ficar desatualizada; script do CDN com SRI.",
      ev=[(STATIC3, r"Content-Security-Policy = 0"), (HDR_SITE, r"Content-Security-Policy"), (ADMIN, r'integrity="sha384-')],
      fix="_headers + meta CSP + SRI"),
    U("SH-002", FAIL, PASS, "Sem HSTS no site e no painel. RUN-0004: Strict-Transport-Security de 2 anos com preload em _headers.",
      ev=[(STATIC3, r"_headers: ausente"), (HDR_SITE, r"Strict-Transport-Security")], fix="_headers"),
    U("SH-003", FAIL, PASS, "Páginas podiam ser carregadas em iframe (clickjacking no painel). RUN-0004: X-Frame-Options DENY e frame-ancestors 'none'.",
      ev=[(STATIC3, r"_headers: ausente"), (HDR_ADMIN, r"X-Frame-Options: DENY")], fix="_headers"),
    U("SH-004", FAIL, PASS, "Sem X-Content-Type-Options. RUN-0004: nosniff em _headers.",
      ev=[(STATIC3, r"_headers: ausente"), (HDR_SITE, r"X-Content-Type-Options")], fix="_headers"),
    U("SH-005", FAIL, PASS, "Sem Referrer-Policy. RUN-0004: strict-origin-when-cross-origin em _headers.",
      ev=[(STATIC3, r"_headers: ausente"), (HDR_SITE, r"Referrer-Policy")], fix="_headers"),
    U("DS-005", PARTIAL, PASS,
      "Actions do CI referenciadas por tag móvel (@v4). RUN-0004: fixadas por SHA de commit; Dependabot segue propondo updates; "
      "deno check das Edge Functions no CI.",
      ev=[(STATIC3, r"uses: actions/checkout@v4"), (CI, r"actions/checkout@11d5960a")], fix="actions por SHA"),
])

for _c in CHECKS:
    _u = UPDATES.get(_c["check_id"])
    _c["r3"] = _u["r3"] if _u else _c["final"]
    _c["r4"] = _u["r4"] if _u else _c["final"]
    _c["update"] = _u
assert set(UPDATES) <= {c["check_id"] for c in CHECKS}, "check desconhecido em UPDATES"
