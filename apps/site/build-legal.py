#!/usr/bin/env python3
"""Gera termos.html e privacidade.html a partir de docs/legal/*.md.
Rode de novo sempre que o texto jurídico mudar: python3 apps/site/build-legal.py"""
import html, pathlib, sys, markdown

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / 'apps' / 'site'
PAGES = [('termos-de-uso.md', 'termos.html', 'Termos de Uso'),
         ('politica-de-privacidade.md', 'privacidade.html', 'Política de Privacidade')]

TEMPLATE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · ConMatch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap">
<style>
:root{{--bg:#F8FAFC;--surface:#FFFFFF;--ink:#1F2937;--head:#0B2545;--muted:#4B5563;--line:#D6DEF0;--accent:#F43F5E;
  --f-display:"Playfair Display",Georgia,serif;--f-body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif}}
@media (prefers-color-scheme:dark){{:root{{--bg:#061629;--surface:#0B2545;--ink:#E5EAF5;--head:#F8FAFC;--muted:#B6C2DA;--line:#1E3A66;--accent:#FB7185;color-scheme:dark}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 var(--f-body);padding-inline:16px}}
header,main,footer{{max-width:760px;margin:0 auto}}
header{{padding-block:24px;display:flex;justify-content:space-between;align-items:center;gap:12px}}
header a{{color:var(--head);text-decoration:none;font-family:var(--f-display);font-size:22px}}
header a em{{color:var(--accent)}}
nav a{{font-family:var(--f-body);font-size:14px;color:var(--muted);margin-left:14px}}
main{{padding-block:8px 56px}}
h1,h2{{font-family:var(--f-display);color:var(--head);line-height:1.15;text-wrap:balance}}
h1{{font-size:clamp(30px,6vw,40px);margin:8px 0 16px}}
h2{{font-size:21px;margin:36px 0 8px}}
p,li{{max-width:68ch}}
a{{color:var(--accent)}}
.table{{overflow-x:auto;margin:16px 0}}
table{{border-collapse:collapse;width:100%;min-width:620px;background:var(--surface);font-size:14px}}
th,td{{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}}
th{{color:var(--head)}}
footer{{border-top:1px solid var(--line);padding-block:20px 40px;font-size:13px;color:var(--muted)}}
</style>
</head>
<body>
<header><a href="index.html">Con<em>Match</em></a><nav><a href="termos.html">Termos</a><a href="privacidade.html">Privacidade</a></nav></header>
<main>
{body}
</main>
<footer>ConMatch · Pessoas que constroem mais juntas. · Apenas maiores de 18 anos. · suporte@conmatch.com.br</footer>
</body>
</html>
"""

for src, out, title in PAGES:
    md = (ROOT / 'docs' / 'legal' / src).read_text(encoding='utf-8')
    body = markdown.markdown(md, extensions=['tables'])
    body = body.replace('<table>', '<div class="table"><table>').replace('</table>', '</table></div>')
    (SITE / out).write_text(TEMPLATE.format(title=html.escape(title), body=body), encoding='utf-8')
    print('gerado', out)

# As páginas novas precisam da CSP: regenera os cabeçalhos de segurança
import subprocess  # noqa: E402
subprocess.run([sys.executable, str(ROOT / 'apps' / 'security-headers.py')], check=True)
