# Relatório final de auditoria — ESAA-Security

- **Relatório:** RPT-SEC-20261007-RUN-SEC-0002
- **Hash da projeção (SHA-256):** `b5bfff0b17958b6701d0fac6c0aeb996075e1e712c802c21f6054e6549dc3744`
- **Rodadas:** RUN-SEC-0001 (baseline) e RUN-SEC-0002 (após remediação)
- **Modo:** static-first, sem endpoint runtime. Checks híbridos executaram só a parte estática.

## Score

| Rodada | Score | Classificação | Penalidades |
|---|---|---|---|
| RUN-SEC-0001 | 62.6 | fair | any_check_critical_fail |
| RUN-SEC-0002 | 90.9 | excellent | — |

## Score por domínio (baseline → atual; ok/parcial/falha/n-a)

| Domínio | Prioridade | Baseline | Atual | Checks |
|---|---|---|---|---|
| secrets_config | critical | 100.0 | 100.0 | 7/0/0/1 |
| dependencies_supply_chain | high | 65.5 | 84.5 | 4/2/0/0 |
| authentication | critical | 69.5 | 96.6 | 7/1/0/1 |
| authorization | critical | 47.2 | 100.0 | 5/0/0/1 |
| api_security | high | 69.2 | 88.5 | 6/2/0/1 |
| input_validation | critical | 92.0 | 100.0 | 4/0/0/6 |
| file_upload | high | 69.4 | 79.2 | 4/1/1/0 |
| session_security | high | 50.0 | 100.0 | 2/0/0/4 |
| cryptography | high | 57.9 | 94.7 | 4/1/0/0 |
| security_headers | medium | n/a | n/a | 0/0/0/5 |
| logging_monitoring | medium | 68.4 | 78.9 | 2/3/0/0 |
| infrastructure | high | 73.8 | 73.8 | 1/2/0/4 |
| devsecops | medium | 16.0 | 76.0 | 3/2/1/0 |
| data_security | critical | 62.1 | 87.9 | 4/1/0/0 |
| frontend_security | medium | 33.3 | 83.3 | 2/1/0/1 |
| ai_llm_security | high | n/a | n/a | 0/0/0/7 |
| business_logic | high | 0.0 | 87.5 | 3/1/0/0 |

## Achados corrigidos (24)

| Check | Achado | Severidade | Antes | Agora |
|---|---|---|---|---|
| AZ-002 | IDOR (Insecure Direct Object Reference) | CRITICAL | FALHA | ok |
| AZ-003 | Verificação de permissão apenas no frontend | CRITICAL | parcial | ok |
| BL-003 | Race conditions (TOCTOU) em operações sensíveis | CRITICAL | FALHA | ok |
| CR-001 | HTTPS não obrigatório | CRITICAL | parcial | ok |
| AU-004 | Reset de senha inseguro | HIGH | parcial | ok |
| AU-005 | Sessões sem expiração | HIGH | parcial | ok |
| AU-006 | Ausência de proteção contra brute force | HIGH | parcial | ok |
| AU-007 | Tokens permanentes | HIGH | parcial | ok |
| BL-001 | Bypass de workflow multi-step | HIGH | FALHA | ok |
| CR-003 | Dados sensíveis sem criptografia | HIGH | FALHA | ok |
| DO-003 | Secrets scanning ausente | HIGH | FALHA | ok |
| FE-001 | Tokens armazenados em localStorage | HIGH | FALHA | ok |
| FU-006 | Filenames não sanitizados | HIGH | parcial | ok |
| SS-005 | Sessões sem expiração | HIGH | parcial | ok |
| AP-003 | Enumeração de usuários | MEDIUM | parcial | ok |
| AP-006 | Ausência de paginação | MEDIUM | parcial | ok |
| AZ-005 | Escopo de permissões mal definido | MEDIUM | FALHA | ok |
| BL-004 | Abuso de fluxo de negócio permitido | MEDIUM | FALHA | ok |
| DA-003 | Ausência de política de retenção | MEDIUM | FALHA | ok |
| DO-002 | Pipeline sem análise de segurança | MEDIUM | parcial | ok |
| DO-004 | SAST não implementado | MEDIUM | FALHA | ok |
| IV-006 | Inputs não validados | MEDIUM | parcial | ok |
| SS-006 | Tokens reutilizáveis | MEDIUM | parcial | ok |
| DS-006 | Build não reproduzível | LOW | parcial | ok |

## Em aberto ou parciais (19)

| Check | Achado | Severidade | Status | Situação |
|---|---|---|---|---|
| AP-001 | Endpoints sem rate limit | HIGH | parcial | Baseline: swipe_pass sem limite permitia varrer todos os perfis da região (PoC E7: 150 passes seguidos). RUN-0002: rate limit em passes (120/min, 2000/dia), cur |
| BL-002 | Anti-automação ausente em fluxos críticos | HIGH | parcial | Baseline: sem anti-automação (passes ilimitados, Premium sem teto, sem CAPTCHA). RUN-0002: rate limits e teto Premium; CAPTCHA configurado mas desligado até o a |
| DA-005 | Não conformidade com LGPD/GDPR | HIGH | parcial | Baseline: consentimento só no app (PoC E5), sem portabilidade e arquivos de foto ficavam no Storage após a exclusão. RUN-0002: consentimento exigido no servidor |
| DS-001 | Dependências com vulnerabilidades conhecidas | HIGH | parcial | npm audit (apps/mobile). Baseline: 30 vulnerabilidades (19 HIGH, 11 MODERATE). RUN-0002: 22 (19 HIGH, 3 MODERATE) após override de uuid@11 no xcode e remoção do |
| FE-003 | Dependências JS vulneráveis | HIGH | parcial | Ver DS-001. |
| FU-001 | Uploads sem validação de tipo | HIGH | parcial | Bucket restringe MIME (image/jpeg\|png\|webp) pelo Content-Type declarado; RUN-0002 exige extensão de imagem. Não há verificação do conteúdo real (magic bytes) no |
| IF-005 | Backups não configurados | HIGH | parcial | Backup depende do plano do Supabase e não é verificável no repo; exigência registrada em SECURITY.md. |
| AU-003 | Ausência de MFA | MEDIUM | parcial | Baseline: sem MFA. RUN-0002: TOTP habilitado no servidor (config.toml); falta a tela de ativação no app. |
| CR-005 | Falta de rotação de chaves | MEDIUM | parcial | Baseline: sem processo de rotação. RUN-0002: runbook em SECURITY.md (manual, não automatizado). |
| DO-001 | Ausência de code review | MEDIUM | parcial | Baseline: sem CODEOWNERS nem template de PR. RUN-0002: ambos criados; proteção da branch é configuração do GitHub (fora do repo). |
| DO-006 | Deploy sem auditoria | MEDIUM | parcial | Migrations aplicadas manualmente via CLI/painel, sem pipeline de deploy auditável. |
| FU-004 | Ausência de antivírus | MEDIUM | FALHA | Não há varredura de malware nem moderação automática de imagem (nudez, menores, rostos). Planejado: AWS Rekognition atualizando photos.approved antes do lançame |
| IF-006 | Proteção contra DDoS ausente | MEDIUM | parcial | Proteção de borda do provedor + rate limits de aplicação (RUN-0002); sem proteção dedicada. |
| LM-004 | Ausência de alertas de segurança | MEDIUM | parcial | Baseline: nenhum alerta. RUN-0002: fila security_alerts (denúncia de menor, pico de denúncias, ocultação, rate limit). Falta canal de notificação (webhook/e-mai |
| AP-005 | Falta de versionamento de API | LOW | parcial | RPCs sem versionamento; mudança incompatível exigiria nova função (ex.: discover_v2). |
| DO-005 | DAST não implementado | LOW | FALHA | Sem DAST. Para app mobile + BaaS, recomendado ZAP contra um projeto Supabase de staging. |
| DS-005 | Dependências externas não auditadas | LOW | parcial | Baseline: nenhum processo de revisão de dependências. RUN-0002: Dependabot (npm + actions). Actions referenciadas por tag, não por SHA. |
| LM-003 | Logs não estruturados | LOW | parcial | audit_logs é estruturado (jsonb), mas o app não tem log/crash reporting estruturado. |
| LM-005 | Ausência de correlação de requisições | LOW | parcial | Request ID existe só nos logs do Supabase; o app não propaga ID de correlação. |

## Rastreabilidade

Cada resultado está em `reports/phase2/results/` (RUN-SEC-0002) e `reports/phase2/results/RUN-SEC-0001/` (baseline).
Cada arquivo gerado tem seu SHA-256 registrado em `.roadmap/activity.jsonl`. Para conferir que nada foi alterado:

```bash
python3 security/tools/esaa_project.py verify
```
