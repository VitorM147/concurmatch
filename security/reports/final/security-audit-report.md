# Relatório final de auditoria — ESAA-Security

- **Relatório:** RPT-SEC-20261013-RUN-SEC-0004
- **Hash da projeção (SHA-256):** `827ad1a618cc93b9e32e03407378c4683d6d6d0147e6ef6b010a43c102173d7c`
- **Rodadas:** RUN-SEC-0001, RUN-SEC-0002, RUN-SEC-0003, RUN-SEC-0004
- **Modo:** static-first, sem endpoint runtime. Checks híbridos executaram só a parte estática; provas de conceito no Postgres embarcado (PGlite).

## Score

| Rodada | Escopo | Score | Classificação | Penalidades |
|---|---|---|---|---|
| RUN-SEC-0001 | Baseline (antes das correções) | 62.6 | fair | any_check_critical_fail |
| RUN-SEC-0002 | Após remediação (0005/0006, app, CI) | 90.9 | excellent | — |
| RUN-SEC-0003 | Código novo 0008–0015, robôs, painel e site (antes das correções) | 83.4 | good | — |
| RUN-SEC-0004 | Após remediação (0016/0017, robôs, painel com MFA, cabeçalhos, CI) | 93.6 | excellent | — |

## Score por domínio (rodadas 1 → 4; ok/parcial/falha/n-a na rodada atual)

| Domínio | Prioridade | R0001 | R0002 | R0003 | R0004 | Checks |
|---|---|---|---|---|---|---|
| secrets_config | critical | 100.0 | 100.0 | 100.0 | 100.0 | 7/0/0/1 |
| dependencies_supply_chain | high | 65.5 | 84.5 | 84.5 | 87.9 | 5/1/0/0 |
| authentication | critical | 69.5 | 96.6 | 96.6 | 96.6 | 7/1/0/1 |
| authorization | critical | 47.2 | 100.0 | 83.7 | 100.0 | 6/0/0/0 |
| api_security | high | 69.2 | 88.5 | 82.6 | 97.8 | 8/1/0/0 |
| input_validation | critical | 92.0 | 100.0 | 100.0 | 100.0 | 4/0/0/6 |
| file_upload | high | 69.4 | 79.2 | 79.2 | 94.4 | 5/1/0/0 |
| session_security | high | 50.0 | 100.0 | 100.0 | 100.0 | 2/0/0/4 |
| cryptography | high | 57.9 | 94.7 | 94.7 | 94.7 | 4/1/0/0 |
| security_headers | medium | n/a | n/a | 0.0 | 100.0 | 5/0/0/0 |
| logging_monitoring | medium | 68.4 | 78.9 | 78.9 | 89.5 | 3/2/0/0 |
| infrastructure | high | 73.8 | 73.8 | 73.8 | 73.8 | 1/2/0/4 |
| devsecops | medium | 16.0 | 76.0 | 76.0 | 76.0 | 3/2/1/0 |
| data_security | critical | 62.1 | 87.9 | 81.0 | 87.9 | 4/1/0/0 |
| frontend_security | medium | 33.3 | 83.3 | 66.7 | 83.3 | 2/1/0/1 |
| ai_llm_security | high | n/a | n/a | 93.3 | 100.0 | 7/0/0/0 |
| business_logic | high | 0.0 | 87.5 | 48.2 | 87.5 | 3/1/0/0 |

## Corrigidos nesta rodada (16)

| Check | Achado | Severidade | RUN-SEC-0003 | RUN-SEC-0004 |
|---|---|---|---|---|
| AI-006 | Proveniência de modelos e dados de treino | HIGH | parcial | ok |
| AP-001 | Endpoints sem rate limit | HIGH | parcial | ok |
| AP-009 | Consumo inseguro de APIs externas | HIGH | parcial | ok |
| AZ-004 | Admin routes expostas | HIGH | FALHA | ok |
| BL-001 | Bypass de workflow multi-step | HIGH | FALHA | ok |
| FE-001 | Tokens armazenados em localStorage | HIGH | parcial | ok |
| FU-001 | Uploads sem validação de tipo | HIGH | parcial | ok |
| BL-004 | Abuso de fluxo de negócio permitido | MEDIUM | FALHA | ok |
| DA-003 | Ausência de política de retenção | MEDIUM | parcial | ok |
| LM-004 | Ausência de alertas de segurança | MEDIUM | parcial | ok |
| SH-001 | Content-Security-Policy ausente | MEDIUM | FALHA | ok |
| SH-002 | Strict-Transport-Security ausente | MEDIUM | FALHA | ok |
| SH-003 | X-Frame-Options ausente | MEDIUM | FALHA | ok |
| DS-005 | Dependências externas não auditadas | LOW | parcial | ok |
| SH-004 | X-Content-Type-Options ausente | LOW | FALHA | ok |
| SH-005 | Referrer-Policy ausente | LOW | FALHA | ok |

## Corrigidos nas rodadas anteriores (20)

| Check | Achado | Severidade | Histórico (R1 → R4) |
|---|---|---|---|
| AZ-002 | IDOR (Insecure Direct Object Reference) | CRITICAL | FALHA → ok → ok → ok |
| AZ-003 | Verificação de permissão apenas no frontend | CRITICAL | parcial → ok → ok → ok |
| BL-003 | Race conditions (TOCTOU) em operações sensíveis | CRITICAL | FALHA → ok → ok → ok |
| CR-001 | HTTPS não obrigatório | CRITICAL | parcial → ok → ok → ok |
| AU-004 | Reset de senha inseguro | HIGH | parcial → ok → ok → ok |
| AU-005 | Sessões sem expiração | HIGH | parcial → ok → ok → ok |
| AU-006 | Ausência de proteção contra brute force | HIGH | parcial → ok → ok → ok |
| AU-007 | Tokens permanentes | HIGH | parcial → ok → ok → ok |
| CR-003 | Dados sensíveis sem criptografia | HIGH | FALHA → ok → ok → ok |
| DO-003 | Secrets scanning ausente | HIGH | FALHA → ok → ok → ok |
| FU-006 | Filenames não sanitizados | HIGH | parcial → ok → ok → ok |
| SS-005 | Sessões sem expiração | HIGH | parcial → ok → ok → ok |
| AP-003 | Enumeração de usuários | MEDIUM | parcial → ok → ok → ok |
| AP-006 | Ausência de paginação | MEDIUM | parcial → ok → ok → ok |
| AZ-005 | Escopo de permissões mal definido | MEDIUM | FALHA → ok → ok → ok |
| DO-002 | Pipeline sem análise de segurança | MEDIUM | parcial → ok → ok → ok |
| DO-004 | SAST não implementado | MEDIUM | FALHA → ok → ok → ok |
| IV-006 | Inputs não validados | MEDIUM | parcial → ok → ok → ok |
| SS-006 | Tokens reutilizáveis | MEDIUM | parcial → ok → ok → ok |
| DS-006 | Build não reproduzível | LOW | parcial → ok → ok → ok |

## Em aberto ou parciais (15)

| Check | Achado | Severidade | Status | Situação |
|---|---|---|---|---|
| BL-002 | Anti-automação ausente em fluxos críticos | HIGH | parcial | Lista de espera aberta ao público (anon) só com limite global: um robô de um IP gravou 119 inscrições e travou o site para todos (PoC E2). RUN-0004: limite por  |
| DA-005 | Não conformidade com LGPD/GDPR | HIGH | parcial | Baseline: consentimento só no app (PoC E5), sem portabilidade e arquivos de foto ficavam no Storage após a exclusão. RUN-0002: consentimento exigido no servidor |
| DS-001 | Dependências com vulnerabilidades conhecidas | HIGH | parcial | npm audit (apps/mobile). Baseline: 30 vulnerabilidades (19 HIGH, 11 MODERATE). RUN-0002: 22 (19 HIGH, 3 MODERATE) após override de uuid@11 no xcode e remoção do |
| FE-003 | Dependências JS vulneráveis | HIGH | parcial | Ver DS-001. |
| IF-005 | Backups não configurados | HIGH | parcial | Backup depende do plano do Supabase e não é verificável no repo; exigência registrada em SECURITY.md. |
| AU-003 | Ausência de MFA | MEDIUM | parcial | TOTP habilitado no servidor; o painel do suporte não pedia segundo fator. RUN-0004: segundo fator obrigatório para admins (aal2 no banco). Usuários do app ainda |
| CR-005 | Falta de rotação de chaves | MEDIUM | parcial | Baseline: sem processo de rotação. RUN-0002: runbook em SECURITY.md (manual, não automatizado). |
| DO-001 | Ausência de code review | MEDIUM | parcial | Baseline: sem CODEOWNERS nem template de PR. RUN-0002: ambos criados; proteção da branch é configuração do GitHub (fora do repo). |
| DO-006 | Deploy sem auditoria | MEDIUM | parcial | Migrations aplicadas manualmente via CLI/painel, sem pipeline de deploy auditável. |
| FU-004 | Ausência de antivírus | MEDIUM | parcial | Nenhuma checagem do conteúdo das fotos. RUN-0004: o robô passa cada foto nova pela Moderation API (nudez, menor, violência) e reprova automaticamente; sinal de  |
| IF-006 | Proteção contra DDoS ausente | MEDIUM | parcial | Proteção de borda do provedor + rate limits de aplicação (RUN-0002); sem proteção dedicada. |
| AP-005 | Falta de versionamento de API | LOW | parcial | RPCs sem versionamento; mudança incompatível exigiria nova função (ex.: discover_v2). |
| DO-005 | DAST não implementado | LOW | FALHA | Sem DAST. Para app mobile + BaaS, recomendado ZAP contra um projeto Supabase de staging. |
| LM-003 | Logs não estruturados | LOW | parcial | audit_logs é estruturado (jsonb), mas o app não tem log/crash reporting estruturado. |
| LM-005 | Ausência de correlação de requisições | LOW | parcial | Request ID existe só nos logs do Supabase; o app não propaga ID de correlação. |

## Rastreabilidade

Resultados por rodada em `reports/phase2/results/` (a mais recente na raiz; as anteriores em `RUN-SEC-000N/`).
Cada arquivo gerado tem seu SHA-256 registrado em `.roadmap/activity.jsonl`. Para conferir que nada foi alterado:

```bash
python3 security/tools/esaa_project.py verify
```
