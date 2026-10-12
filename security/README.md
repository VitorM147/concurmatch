# Auditoria de segurança — ESAA-Security

Este diretório aplica a metodologia [ESAA-Security](https://github.com/elzobrito/ESAA-Security) (Elzo Brito, licença MIT) ao ConMatch:
auditoria **static-first** com **108 checks em 17 domínios**, resultados com evidência, **eventos append-only encadeados por SHA-256** e
relatório final como **projeção determinística** desses eventos.

> O agente investiga, o orquestrador adjudica.

## Resultado

| Rodada | Quando | Score | Classificação |
|---|---|---|---|
| RUN-SEC-0001 | antes das correções | 62,6 | regular (teto de 70 por 2 falhas CRITICAL) |
| RUN-SEC-0002 | depois das migrations 0005/0006, app e CI | 90,9 | excelente |
| RUN-SEC-0003 | código novo: 0008–0015, robôs, painel do suporte e site | 83,4 | bom |
| RUN-SEC-0004 | depois das migrations 0016/0017, robôs, painel com MFA, cabeçalhos e CI | 93,6 | excelente |

Leia primeiro: [`reports/phase4/executive-summary.md`](reports/phase4/executive-summary.md) e
[`reports/final/security-audit-report.md`](reports/final/security-audit-report.md).

**O score mede o que está no repositório.** Configurações do painel do Supabase, proteção da branch no GitHub e backups não são
observáveis aqui; a lista do que precisa ser conferido manualmente está em [`../SECURITY.md`](../SECURITY.md).

## Estrutura

```
.roadmap/
  playbooks.security.json        contrato upstream: 108 checks (cópia, MIT)
  report-template.security.json  contrato upstream: fórmula do score e formato do relatório
  roadmap.security.json          contrato upstream: 27 tarefas em 4 fases
  activity.jsonl                 event store (fonte da verdade, encadeado por SHA-256)
  roadmap.json                   projeção da rodada mais recente + projection_hash_sha256
  UPSTREAM_COMMIT                commit do upstream usado
reports/
  phase1/  reconhecimento (stack, arquitetura, superfície de ataque, ferramentas)
  phase2/  results/SEC-0xx.json (rodada mais recente), results/RUN-SEC-000N/ (rodadas anteriores), evidence/ (provas de conceito e saídas de ferramentas)
  phase3/  inventário, classificação e matriz de riscos
  phase4/  correções técnicas, boas práticas, resumo executivo
  final/   relatório final (.md e .json)
tools/
  checks_data.py    saída do agente: status e evidência de cada check em cada rodada (UPDATES = rodadas 3 e 4)
  esaa_project.py   orquestrador: política de precisão, eventos, projeção, score, relatórios, verify
```

## Comandos

```bash
python3 security/tools/esaa_project.py verify   # confere a cadeia de eventos, os hashes dos arquivos e a projeção
python3 security/tools/esaa_project.py run      # regenera tudo a partir de checks_data.py (determinístico)
```

`verify` também roda no CI (job `audit-trail`). Se alguém editar um relatório ou resultado à mão, o CI acusa `mismatch`.

## Política de precisão (igual ao upstream)

O orquestrador recusa resultados com `PRECISION_POLICY_VIOLATION` quando:
- `fallback_applied=true` aparece junto com `status=fail`;
- um `fail` com confiança `high` não tem evidência forte (`code_snippet`, `tool_output` ou `runtime_probe`);
- um achado não tem evidência nenhuma.

## Como fazer a próxima rodada

1. Rode o agente (Claude Code, Codex ou Gemini) com os playbooks de `.roadmap/` contra o repositório.
2. Atualize `tools/checks_data.py` com os novos status e evidências e acrescente a rodada em `RUNS` no orquestrador.
3. Toda correção nova ganha um teste de regressão (`supabase/tests/security.test.mjs` e `security-run3.test.mjs`) e, quando der, uma prova de conceito reproduzível (`supabase/tests/poc-run3.mjs`, que roda contra o código antigo com `baseline`).
4. `run`, depois `verify`, e faça commit de `security/` junto com as correções.

Para a auditoria completa com o runtime oficial (`esaa-core`, `dispatch-context`, adaptadores de agente), use o repositório upstream
apontando `repo_path` para este projeto.
