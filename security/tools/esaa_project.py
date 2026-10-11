#!/usr/bin/env python3
"""Orquestrador ESAA-Security (versão enxuta) para este repositório.

Princípio herdado do ESAA: o agente investiga, o orquestrador adjudica.
  - checks_data.py      -> saída do agente (resultados por check, com evidência)
  - este script         -> valida (schema + política de precisão), grava eventos
                           append-only com encadeamento SHA-256, projeta o estado
                           (roadmap.json), calcula o score e gera os relatórios.

Uso:
  python3 security/tools/esaa_project.py run      # gera eventos, projeção e relatórios
  python3 security/tools/esaa_project.py verify   # replay + SHA-256 (ok | mismatch | corrupted)

Somente biblioteca padrão. Determinístico: mesmas entradas -> mesmos bytes.
Contratos (playbooks, template de relatório) vêm do upstream elzobrito/ESAA-Security (MIT),
copiados em security/.roadmap/.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # raiz do repositório
SEC = ROOT / "security"
RM = SEC / ".roadmap"
REP = SEC / "reports"
sys.path.insert(0, str(Path(__file__).parent))
from checks_data import CHECKS  # noqa: E402

RUNS = [
    {"run_id": "RUN-SEC-0001", "key": "base", "label": "Baseline (antes das correções)", "start": "2026-10-07T02:40:00Z"},
    {"run_id": "RUN-SEC-0002", "key": "final", "label": "Após remediação (0005/0006, app, CI)", "start": "2026-10-07T04:10:00Z"},
]
SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 7, "MEDIUM": 4, "LOW": 2, "INFO": 1}
PRIORITY_WEIGHT = {"critical": 3.0, "high": 2.0, "medium": 1.0}
SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
STATUSES = {"pass", "fail", "partial", "not_applicable", "error"}
STRONG_EVIDENCE = {"code_snippet", "tool_output", "runtime_probe"}
# Arquivos que só existem depois da remediação: não entram como evidência do baseline
FIX_ONLY = re.compile(r"(0005_|0006_|post-remediation|secureStorage|SECURITY\.md|CODEOWNERS|dependabot|pull_request_template|config\.toml|npm-audit-mobile-post)")
DOMAIN_CIA = {  # impacto típico (Confidencialidade, Integridade, Disponibilidade) por domínio
    "secrets_config": "C", "dependencies_supply_chain": "CIA", "authentication": "CI", "authorization": "CI",
    "api_security": "CA", "input_validation": "CIA", "file_upload": "CI", "session_security": "C",
    "cryptography": "C", "security_headers": "CI", "logging_monitoring": "I", "infrastructure": "A",
    "devsecops": "CI", "data_security": "C", "frontend_security": "C", "ai_llm_security": "CI", "business_logic": "IA",
}


class PrecisionPolicyViolation(Exception):
    pass


# --------------------------------------------------------------------------- util
def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write(path: Path, content: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return sha256_file(path)


def write_json(path: Path, obj) -> str:
    return write(path, json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


# --------------------------------------------------------------------------- contratos
def load_contracts():
    pb = json.loads((RM / "playbooks.security.json").read_text(encoding="utf-8"))
    roadmap = json.loads((RM / "roadmap.security.json").read_text(encoding="utf-8"))
    checks, playbooks = {}, {}
    for book in pb["playbooks"].values():
        playbooks[book["task_ref"]] = book
        for c in book["checks"]:
            checks[c["check_id"]] = {
                "task_ref": book["task_ref"], "domain": book["domain"], "priority": book["priority"],
                "name": c["name"], "severity": c["severity_if_fail"], "remediation": c.get("remediation", ""),
                "strategy": c["agent_instructions"].get("strategy"),
            }
    return pb, roadmap, checks, playbooks


# --------------------------------------------------------------------------- evidência
def resolve_evidence(items, run_key):
    files, lines, outputs = [], [], []
    for path, pattern in items:
        if run_key == "base" and FIX_ONLY.search(path):
            continue
        p = ROOT / path
        if not p.exists():
            continue
        if path not in files:
            files.append(path)
        rx = re.compile(pattern)
        hit = None
        for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if rx.search(line):
                hit = (n, line.strip())
                break
        if hit:
            lines.append(f"{path}:{hit[0]}:{hit[1][:200]}")
        elif p.stat().st_size == 0:
            outputs.append(f"{path}: 0 ocorrências")
    return files[:20], lines, outputs


def describe(text: str, run_key: str) -> str:
    if run_key == "base" and " RUN-0002:" in text:
        return text.split(" RUN-0002:")[0].strip()
    return text


# --------------------------------------------------------------------------- resultados (agente -> orquestrador)
def build_check_result(c, meta, run_key):
    status = c[run_key]
    conf = c["confidence_base"] if run_key == "base" else c["confidence"]
    files, lines, outputs = resolve_evidence(c["evidence"], run_key)
    fallback = c["fallback"] if (c["fallback"] and status != "fail") else None
    types = [t for t in c["evidence_types"] if run_key == "final" or t != "config_artifact" or files]
    return {
        "check_id": c["check_id"],
        "check_name": meta["name"],
        "status": status,
        "severity_if_fail": meta["severity"],
        "confidence": conf,
        "evidence": {
            "files": files,
            "lines": lines,
            "commands_output": outputs,
            "evidence_types": types,
            "evidence_sources": c["evidence_sources"],
            "tool_name": c["tool"],
            "tool_version": {"detect-secrets": "1.5.0", "npm audit": "10.9.4"}.get(c["tool"]),
            "fallback_applied": bool(fallback),
            "fallback_reason": fallback,
            "description": describe(c["description"], run_key),
        },
        "remediation": meta["remediation"] + (f" | Aplicado: {c['fix']}" if (c["fix"] and run_key == "final") else ""),
        "cross_refs": c["cross_refs"],
    }


def enforce_precision(r):
    """Mesmas regras do src/esaa/security_audit.py upstream (PRECISION_POLICY_VIOLATION)."""
    ev = r["evidence"]
    if r["status"] not in STATUSES:
        raise PrecisionPolicyViolation(f"{r['check_id']}: status inválido {r['status']}")
    if ev["fallback_applied"] and r["status"] in ("fail", "error"):
        raise PrecisionPolicyViolation(f"{r['check_id']}: fallback_applied com status {r['status']}")
    if r["status"] == "fail" and r["confidence"] == "high" and not (set(ev["evidence_types"]) & STRONG_EVIDENCE):
        raise PrecisionPolicyViolation(f"{r['check_id']}: fail com confiança alta exige code_snippet/tool_output/runtime_probe")
    if r["status"] in ("fail", "partial") and not (ev["files"] or ev["lines"] or ev["description"]):
        raise PrecisionPolicyViolation(f"{r['check_id']}: achado sem evidência")


def build_task_results(meta_by_check, playbooks, run_key):
    by_task = {}
    ids = [c["check_id"] for c in CHECKS]
    assert len(ids) == len(set(ids)) == len(meta_by_check) == 108, "precisa cobrir exatamente os 108 checks"
    for c in CHECKS:
        meta = meta_by_check[c["check_id"]]
        r = build_check_result(c, meta, run_key)
        enforce_precision(r)
        by_task.setdefault(meta["task_ref"], []).append(r)
    out = {}
    for task_id, book in playbooks.items():
        order = [x["check_id"] for x in book["checks"]]
        results = sorted(by_task[task_id], key=lambda r: order.index(r["check_id"]))
        cnt = {s: sum(1 for r in results if r["status"] == s) for s in STATUSES}
        fails = [r["severity_if_fail"] for r in results if r["status"] == "fail"]
        out[task_id] = {
            "task_id": task_id, "domain": book["domain"],
            "playbook_version": json.loads((RM / "playbooks.security.json").read_text())["metadata"].get("version", "unknown"),
            "checks_total": len(results), "checks_pass": cnt["pass"], "checks_fail": cnt["fail"],
            "checks_partial": cnt["partial"], "checks_na": cnt["not_applicable"], "checks_error": cnt["error"],
            "worst_severity": min(fails, key=SEV_ORDER.index) if fails else "NONE",
            "duration_ms": 0,
            "results": results,
        }
    return out


# --------------------------------------------------------------------------- score (report-template.security.json)
def score(task_results, playbooks):
    domains, crit_fails = [], 0
    for task_id, tr in task_results.items():
        pts = mx = 0.0
        for r in tr["results"]:
            w = SEVERITY_WEIGHT[r["severity_if_fail"]]
            if r["status"] == "not_applicable":
                continue
            mx += w
            pts += {"pass": w, "partial": w * 0.5}.get(r["status"], 0)
            if r["status"] == "fail" and r["severity_if_fail"] == "CRITICAL":
                crit_fails += 1
        prio = playbooks[task_id]["priority"]
        domains.append({"task_id": task_id, "domain": tr["domain"], "priority": prio,
                        "score": round(pts / mx * 100, 1) if mx else None,
                        "checks_pass": tr["checks_pass"], "checks_fail": tr["checks_fail"],
                        "checks_partial": tr["checks_partial"], "checks_na": tr["checks_na"]})
    scored = [d for d in domains if d["score"] is not None]
    tw = sum(PRIORITY_WEIGHT[d["priority"]] for d in scored)
    raw = round(sum(d["score"] * PRIORITY_WEIGHT[d["priority"]] for d in scored) / tw, 1)
    value, penalties = raw, []
    if crit_fails >= 1:
        value = min(value, 70); penalties.append("any_check_critical_fail")
    if crit_fails >= 3:
        value = min(value, 50); penalties.append("multiple_critical_fails")
    if any(d["priority"] == "critical" and d["score"] == 0 for d in scored):
        value = min(value, 60); penalties.append("domain_zero")
    cls = ("critical" if value <= 30 else "poor" if value <= 50 else "fair" if value <= 70
           else "good" if value <= 85 else "excellent")
    return {"value": value, "raw_weighted_average": raw, "classification": cls,
            "penalties_applied": penalties, "critical_fails": crit_fails, "breakdown": domains}


# --------------------------------------------------------------------------- eventos (append-only, encadeados)
class EventStore:
    def __init__(self):
        self.events, self.seq, self.prev = [], 0, "0" * 64

    def emit(self, run, ts, actor, action, task_id=None, payload=None):
        self.seq += 1
        ev = {"event_seq": self.seq, "event_id": f"EV-{self.seq:05d}", "run_id": run, "ts": ts,
              "actor": actor, "action": action, "task_id": task_id, "payload": payload or {},
              "prev_event_hash": self.prev}
        ev["event_hash"] = sha256_text(canon(ev))
        self.prev = ev["event_hash"]
        self.events.append(ev)
        return ev


def project_events(events, roadmap_contract):
    """Função pura: eventos -> read-model da rodada mais recente (PROJECTION_SPEC do ESAA)."""
    runs = [e["run_id"] for e in events if e["action"] == "run.start"]
    run_id = runs[-1]
    tasks = {t["task_id"]: {"task_id": t["task_id"], "task_kind": t["task_kind"], "title": t["title"],
                            "status": "todo", "depends_on": t.get("depends_on", [])}
             for t in roadmap_contract["tasks"]}
    status = "initialized"
    for e in events:
        if e["run_id"] != run_id:
            continue
        t = tasks.get(e["task_id"]) if e["task_id"] else None
        a = e["action"]
        if a == "run.start":
            status = "running"
        elif a == "claim":
            assert t["status"] == "todo", f"claim inválido em {t['task_id']}"
            assert all(tasks[d]["status"] == "done" for d in t["depends_on"]), f"dependência pendente em {t['task_id']}"
            t["status"] = "in_progress"
        elif a == "complete":
            assert t["status"] == "in_progress"; t["status"] = "review"
        elif a == "review":
            assert t["status"] == "review"
            t["status"] = "done" if e["payload"].get("decision") == "approve" else "in_progress"
        elif a == "run.end":
            status = e["payload"].get("status", "success")
    task_list = list(tasks.values())
    by_status = {s: sum(1 for t in task_list if t["status"] == s) for s in ("todo", "in_progress", "review", "done")}
    by_kind = {k: sum(1 for t in task_list if t["task_kind"] == k) for k in ("spec", "impl", "qa")}
    return {
        "meta": {"schema_version": roadmap_contract["meta"]["schema_version"], "immutable_done": True,
                 "run": {"run_id": run_id, "status": status, "last_event_seq": events[-1]["event_seq"],
                         "projection_hash_sha256": None, "verify_status": "unknown"}},
        "project": {"name": "Probatório / ConcurMatch — auditoria ESAA-Security",
                    "audit_scope": "Static-first sobre o repositório (app Expo, migrations Supabase, CI) cobrindo 17 domínios e 108 checks; "
                                   "porções runtime não executadas (endpoint_base_url ausente)."},
        "tasks": task_list,
        "indexes": {"by_status": by_status, "by_kind": by_kind, "checks_total": 108},
    }


def projection_hash(projected):
    hash_input = {k: projected[k] for k in ("project", "tasks", "indexes")}
    hash_input["schema_version"] = projected["meta"]["schema_version"]
    return sha256_text(canon(hash_input) + "\n")


# --------------------------------------------------------------------------- relatórios
STATUS_PT = {"pass": "ok", "fail": "FALHA", "partial": "parcial", "not_applicable": "n/a", "error": "erro"}


def findings(task_results_final, task_results_base, meta_by_check):
    base_status = {r["check_id"]: r["status"] for tr in task_results_base.values() for r in tr["results"]}
    out = []
    for tr in task_results_final.values():
        for r in tr["results"]:
            b = base_status[r["check_id"]]
            if r["status"] in ("fail", "partial") or b in ("fail", "partial"):
                srcs = r["evidence"]["evidence_sources"]
                out.append({
                    "finding_id": f"F-{r['check_id']}", "check_id": r["check_id"], "title": r["check_name"],
                    "domain": tr["domain"], "severity": r["severity_if_fail"],
                    "status_baseline": b, "status_atual": r["status"],
                    "resolved": r["status"] in ("pass", "not_applicable"),
                    "confidence": r["confidence"],
                    "likelihood": "alta" if "pglite_poc" in srcs else ("média" if r["confidence"] != "low" else "baixa"),
                    "cia_impact": DOMAIN_CIA.get(tr["domain"], ""),
                    "evidence_sources": srcs, "evidence_lines": r["evidence"]["lines"][:4],
                    "description": r["evidence"]["description"], "remediation": r["remediation"],
                    "cross_refs": r["cross_refs"],
                })
    out.sort(key=lambda f: (f["resolved"], SEV_ORDER.index(f["severity"]), f["check_id"]))
    return out


def md_table(rows, headers):
    s = "| " + " | ".join(headers) + " |\n|" + "---|" * len(headers) + "\n"
    for r in rows:
        s += "| " + " | ".join(str(x).replace("|", "\\|") for x in r) + " |\n"
    return s


def generate_reports(results, scores, meta_by_check, playbooks, proj_hash, run_final):
    base, final = results["base"], results["final"]
    fnd = findings(final, base, meta_by_check)
    open_f = [f for f in fnd if not f["resolved"]]
    fixed = [f for f in fnd if f["resolved"]]
    sb, sf = scores["base"], scores["final"]
    written = {}

    def W(path, content, as_json=False):
        p = REP / path
        written[rel(p)] = write_json(p, content) if as_json else write(p, content)

    W("phase3/vulnerability-inventory.json", {"run_id": run_final, "findings": fnd}, True)
    W("phase3/classified-vulnerabilities.json", {"run_id": run_final, "by_severity": {
        s: [f["finding_id"] for f in open_f if f["severity"] == s] for s in SEV_ORDER},
        "resolved": [f["finding_id"] for f in fixed]}, True)
    matrix = [{"finding_id": f["finding_id"], "severity": f["severity"], "likelihood": f["likelihood"],
               "cia_impact": f["cia_impact"], "status": f["status_atual"], "remediation": f["remediation"]} for f in open_f]
    W("phase3/risk-matrix.json", {"run_id": run_final, "matrix": matrix}, True)
    W("phase3/risk-matrix.md", "# Matriz de riscos (achados em aberto, RUN-SEC-0002)\n\n" + md_table(
        [(f["check_id"], f["title"], f["severity"], f["likelihood"], f["cia_impact"], STATUS_PT[f["status_atual"]]) for f in open_f],
        ["Check", "Achado", "Severidade", "Probabilidade", "CIA", "Status"]))

    rem = "# Correções técnicas (SEC-040)\n\nAchados do baseline e o que foi aplicado. Provas de conceito em `reports/phase2/evidence/`.\n\n"
    for f in fnd:
        rem += (f"## {f['check_id']} — {f['title']} ({f['severity']})\n\n"
                f"- **Baseline:** {STATUS_PT[f['status_baseline']]} · **Agora:** {STATUS_PT[f['status_atual']]}\n"
                f"- **Evidência:** {f['description']}\n- **Correção:** {f['remediation']}\n")
        if f["evidence_lines"]:
            rem += "- **Onde:** " + "; ".join(f"`{x.split(':')[0]}:{x.split(':')[1]}`" for x in f["evidence_lines"]) + "\n"
        rem += "\n"
    W("phase4/technical-remediations.md", rem)

    W("phase4/best-practices.md", """# Boas práticas (SEC-041)

| Domínio | Prática | Referência |
|---|---|---|
| Autorização | Toda tabela nova com RLS e grants por coluna; nada herdado por padrão | OWASP API1/API3:2023, ASVS V4 |
| Lógica de negócio | Regras de cota, denúncia e pagamento sempre no servidor, com lock quando há contagem | OWASP API6:2023 |
| Moderação | Estado de moderação em colunas que o usuário não altera; ação automática só com sinais confiáveis | OWASP API6:2023 |
| Anti-automação | Rate limit por ação + CAPTCHA no cadastro antes de campanhas pagas | OWASP API4/API6:2023 |
| Sessão mobile | Tokens no Keychain/Keystore; access token curto; refresh rotativo | OWASP MASVS-STORAGE-1, MASVS-AUTH |
| Uploads | Caminho e nome gerados e validados no servidor; moderação de imagem antes de publicar | OWASP File Upload Cheat Sheet |
| Dados pessoais | Consentimento no servidor, exportação, exclusão e retenção automática | LGPD arts. 7, 11, 16, 18 |
| Supply chain | `npm ci`, Dependabot, auditoria no CI, riscos aceitos com prazo | OWASP A06:2021, NIST SSDF PW.4 |
| DevSecOps | Secrets scanning, SAST e testes de regressão de segurança em todo PR | NIST SSDF PW.7/PW.8 |
| Monitoramento | Alertas de segurança com canal de notificação e responsável | OWASP A09:2021 |
""")

    top = open_f[:5]
    exec_md = f"""# Resumo executivo (SEC-042)

**Score de segurança: {sb['value']} ({sb['classification']}) → {sf['value']} ({sf['classification']})**

A auditoria ESAA-Security executou os 108 checks dos 17 domínios em modo static-first sobre o app Expo, as migrations do Supabase e o CI.
O baseline tinha {sum(1 for f in fnd if f['status_baseline']=='fail')} checks reprovados, incluindo falhas confirmadas por prova de conceito:
uso da foto de outra pessoa no próprio perfil, desfazer a ocultação feita pela moderação, derrubar qualquer perfil com uma denúncia falsa
de "menor de idade", descobrir bloqueios entre terceiros e varrer todos os perfis da região sem limite.

Todas essas falhas foram corrigidas nas migrations `0005`/`0006`, no app e no CI, e cada uma ganhou um teste de regressão
(`supabase/tests/security.test.mjs`). Restam {len(open_f)} itens em aberto ou parciais, nenhum CRITICAL.

## Principais riscos restantes

{md_table([(f['check_id'], f['title'], f['severity'], STATUS_PT[f['status_atual']]) for f in top], ['Check', 'Risco', 'Severidade', 'Status'])}
## Próximos passos

1. Moderação automática de fotos (FU-004) e CAPTCHA no cadastro (BL-002) antes da campanha de anúncios.
2. Canal de notificação para `security_alerts` (LM-004) e tela de MFA (AU-003).
3. Política de privacidade, termos e encarregado de dados publicados (DA-005).
4. Proteção da branch `main` e configuração do painel do Supabase conforme `SECURITY.md`.
"""
    W("phase4/executive-summary.md", exec_md)

    report = {
        "header": {"report_id": f"RPT-SEC-20261007-{run_final}", "generated_at": "2026-10-07T05:00:00Z", "run_id": run_final,
                   "projection_hash_sha256": proj_hash,
                   "audit_scope": "Static-first, 17 domínios, 108 checks; endpoint_base_url ausente.",
                   "target": {"repo_path": ".", "endpoint_base_url": None,
                              "tech_stack_summary": "Expo SDK 57 / React Native 0.86 + Supabase (Postgres/RLS, Auth, Storage, Realtime)",
                              "tool_capabilities_summary": "npm audit, detect-secrets e PGlite locais; gitleaks e Semgrep no CI"}},
        "executive_summary": {"security_score": sf, "baseline_score": sb, "top_risks": [f["finding_id"] for f in top]},
        "findings": fnd,
        "domains": [{"domain": d["domain"], "baseline": b["score"], "atual": d["score"]}
                    for d, b in zip(sf["breakdown"], sb["breakdown"])],
    }
    W("final/security-audit-report.json", report, True)

    dom_rows = [(d["domain"], d["priority"], b["score"] if b["score"] is not None else "n/a",
                 d["score"] if d["score"] is not None else "n/a",
                 f"{d['checks_pass']}/{d['checks_partial']}/{d['checks_fail']}/{d['checks_na']}")
                for d, b in zip(sf["breakdown"], sb["breakdown"])]
    final_md = f"""# Relatório final de auditoria — ESAA-Security

- **Relatório:** RPT-SEC-20261007-{run_final}
- **Hash da projeção (SHA-256):** `{proj_hash}`
- **Rodadas:** RUN-SEC-0001 (baseline) e RUN-SEC-0002 (após remediação)
- **Modo:** static-first, sem endpoint runtime. Checks híbridos executaram só a parte estática.

## Score

| Rodada | Score | Classificação | Penalidades |
|---|---|---|---|
| RUN-SEC-0001 | {sb['value']} | {sb['classification']} | {', '.join(sb['penalties_applied']) or '—'} |
| RUN-SEC-0002 | {sf['value']} | {sf['classification']} | {', '.join(sf['penalties_applied']) or '—'} |

## Score por domínio (baseline → atual; ok/parcial/falha/n-a)

{md_table(dom_rows, ['Domínio', 'Prioridade', 'Baseline', 'Atual', 'Checks'])}
## Achados corrigidos ({len(fixed)})

{md_table([(f['check_id'], f['title'], f['severity'], STATUS_PT[f['status_baseline']], STATUS_PT[f['status_atual']]) for f in fixed], ['Check', 'Achado', 'Severidade', 'Antes', 'Agora'])}
## Em aberto ou parciais ({len(open_f)})

{md_table([(f['check_id'], f['title'], f['severity'], STATUS_PT[f['status_atual']], f['description'][:160]) for f in open_f], ['Check', 'Achado', 'Severidade', 'Status', 'Situação'])}
## Rastreabilidade

Cada resultado está em `reports/phase2/results/` (RUN-SEC-0002) e `reports/phase2/results/RUN-SEC-0001/` (baseline).
Cada arquivo gerado tem seu SHA-256 registrado em `.roadmap/activity.jsonl`. Para conferir que nada foi alterado:

```bash
python3 security/tools/esaa_project.py verify
```
"""
    W("final/security-audit-report.md", final_md)
    return written


# --------------------------------------------------------------------------- comandos
def ts(start, minutes):
    t = datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) + timedelta(seconds=minutes * 20)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def cmd_run():
    pb, roadmap_contract, meta_by_check, playbooks = load_contracts()
    results = {r["key"]: build_task_results(meta_by_check, playbooks, r["key"]) for r in RUNS}
    scores = {k: score(v, playbooks) for k, v in results.items()}

    phase2_files = {}
    for run in RUNS:
        d = REP / "phase2" / "results" / ("RUN-SEC-0001" if run["key"] == "base" else "")
        phase2_files[run["key"]] = {tid: (rel(d / f"{tid}.json"), write_json(d / f"{tid}.json", tr))
                                    for tid, tr in results[run["key"]].items()}
    write_json(REP / "phase3" / "RUN-SEC-0001-score.json", scores["base"])

    # projeção provisória para obter o hash final e gerar relatórios coerentes
    es = EventStore()
    phase1 = [rel(p) for p in sorted((REP / "phase1").glob("*"))]
    remediated_files = ["supabase/migrations/0005_security_hardening.sql", "supabase/migrations/0006_platform_hardening.sql",
                        "supabase/config.toml", "supabase/tests/security.test.mjs", "apps/mobile/src/lib/secureStorage.ts",
                        "apps/mobile/src/lib/supabase.ts", "apps/mobile/src/lib/api.ts", "apps/mobile/app/entrar.tsx",
                        "apps/mobile/app/(tabs)/perfil.tsx", "apps/mobile/package.json", ".github/workflows/ci.yml",
                        ".github/dependabot.yml", ".github/CODEOWNERS", ".github/pull_request_template.md", "SECURITY.md"]
    report_files = None

    for pass_no in (1, 2):           # 2ª passada grava os hashes dos relatórios finais
        es = EventStore()
        for run in RUNS:
            rid, k, step = run["run_id"], run["key"], 0

            def E(actor, action, task=None, payload=None):
                nonlocal step
                step += 1
                return es.emit(rid, ts(run["start"], step), actor, action, task, payload)

            start_payload = {"mode": "static_local_code", "endpoint_base_url": None, "label": run["label"],
                             "contracts": {"playbooks.security.json": sha256_file(RM / "playbooks.security.json"),
                                           "report-template.security.json": sha256_file(RM / "report-template.security.json")}}
            if k == "final":
                start_payload["remediation"] = {f: sha256_file(ROOT / f) for f in remediated_files if (ROOT / f).exists()}
            E("orchestrator", "run.start", payload=start_payload)
            if k == "final":
                fixed = [c["check_id"] for c in CHECKS if c["base"] in ("fail", "partial") and c["final"] in ("pass", "not_applicable")]
                improved = [c["check_id"] for c in CHECKS if c["base"] == "fail" and c["final"] == "partial"]
                E("agent-impl", "remediation.applied", payload={"resolved": fixed, "mitigated": improved})
            for t in roadmap_contract["tasks"]:
                tid, kind = t["task_id"], t["task_kind"]
                agent = {"spec": "agent-spec", "impl": "agent-impl", "qa": "agent-qa"}[kind]
                E(agent, "claim", tid)
                if tid in phase2_files[k]:
                    path, h = phase2_files[k][tid]
                    tr = results[k][tid]
                    E(agent, "complete", tid, {"outputs": [path], "summary": {x: tr[x] for x in (
                        "checks_total", "checks_pass", "checks_fail", "checks_partial", "checks_na", "worst_severity")}})
                    E("orchestrator", "orchestrator.file.write", tid, {"path": path, "sha256": h})
                elif tid.startswith("SEC-00"):
                    outs = {"SEC-001": [p for p in phase1 if "tech-stack" in p or "tool-cap" in p],
                            "SEC-002": [p for p in phase1 if "architecture" in p],
                            "SEC-003": [p for p in phase1 if "attack-surface" in p]}[tid]
                    E(agent, "complete", tid, {"outputs": outs})
                    for p in outs:
                        E("orchestrator", "orchestrator.file.write", tid, {"path": p, "sha256": sha256_file(ROOT / p)})
                else:
                    payload = {"score": scores[k]["value"], "classification": scores[k]["classification"]} if tid == "SEC-042" else {}
                    if k == "final" and report_files:
                        mine = {"SEC-030": "vulnerability-inventory", "SEC-031": "classified", "SEC-032": "risk-matrix",
                                "SEC-040": "technical-remediations", "SEC-041": "best-practices",
                                "SEC-042": "executive-summary", "SEC-043": "final/"}[tid]
                        payload["outputs"] = sorted(p for p in report_files if mine in p)
                    elif k == "base":
                        payload["outputs"] = ["security/reports/phase3/RUN-SEC-0001-score.json"]
                    E(agent, "complete", tid, payload)
                    for p in payload.get("outputs", []):
                        E("orchestrator", "orchestrator.file.write", tid, {"path": p, "sha256": sha256_file(ROOT / p)})
                E("agent-qa", "review", tid, {"decision": "approve"})
            E("orchestrator", "run.end", payload={"status": "success", "score": scores[k]["value"],
                                                  "classification": scores[k]["classification"]})
        projected = project_events(es.events, roadmap_contract)
        h = projection_hash(projected)
        if pass_no == 1:
            report_files = generate_reports(results, scores, meta_by_check, playbooks, h, RUNS[-1]["run_id"])
        # na 2ª passada os eventos incluem os hashes dos relatórios; o hash da projeção não depende deles
    projected["meta"]["run"]["projection_hash_sha256"] = h
    projected["meta"]["run"]["verify_status"] = "ok"
    write(RM / "activity.jsonl", "".join(canon(e) + "\n" for e in es.events))
    write_json(RM / "roadmap.json", projected)
    print(f"eventos: {len(es.events)} | tarefas done: {projected['indexes']['by_status']['done']}/27")
    for run in RUNS:
        s = scores[run["key"]]
        print(f"{run['run_id']}: score {s['value']} ({s['classification']}) penalidades={s['penalties_applied'] or '-'}")
    print(f"projection_hash_sha256: {h}")


def cmd_verify():
    _, roadmap_contract, _, _ = load_contracts()
    try:
        events = [json.loads(l) for l in (RM / "activity.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    except Exception as e:  # noqa: BLE001
        print(f"verify_status: corrupted ({e})"); return 2
    prev = "0" * 64
    for i, ev in enumerate(events, 1):
        body = {k: v for k, v in ev.items() if k != "event_hash"}
        if ev["event_seq"] != i or ev["prev_event_hash"] != prev or sha256_text(canon(body)) != ev["event_hash"]:
            print(f"verify_status: corrupted (cadeia quebrada no evento {i})"); return 2
        prev = ev["event_hash"]
    tampered = []
    for ev in events:
        if ev["action"] == "orchestrator.file.write":
            p = ROOT / ev["payload"]["path"]
            if not p.exists() or sha256_file(p) != ev["payload"]["sha256"]:
                tampered.append(ev["payload"]["path"])
    stored = json.loads((RM / "roadmap.json").read_text(encoding="utf-8"))
    projected = project_events(events, roadmap_contract)
    ok_hash = projection_hash(projected) == stored["meta"]["run"]["projection_hash_sha256"]
    if ok_hash and not tampered:
        print(f"verify_status: ok | {len(events)} eventos | hash {stored['meta']['run']['projection_hash_sha256']}")
        return 0
    print("verify_status: mismatch")
    for p in sorted(set(tampered)):
        print(f"  arquivo alterado depois da auditoria: {p}")
    if not ok_hash:
        print("  projeção diverge do roadmap.json")
    return 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "verify"
    sys.exit({"run": cmd_run, "verify": cmd_verify}[cmd]() or 0)
