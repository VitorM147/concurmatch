#!/usr/bin/env python3
"""Cabeçalhos de segurança do site (apps/site) e do painel (apps/admin).

Gera, para cada pasta:
  * _headers  → formato do Cloudflare Pages e do Netlify (CSP, HSTS, X-Frame-Options...)
  * <meta http-equiv="Content-Security-Policy"> em cada .html, para quem hospedar em outro lugar
A CSP libera só os scripts inline que estão no arquivo (por hash SHA-256).
Mudou um <script> inline? Rode de novo:  python3 apps/security-headers.py
No CI:                                   python3 apps/security-headers.py --check
"""
import base64, hashlib, pathlib, re, sys

APPS = pathlib.Path(__file__).resolve().parent
SCRIPT = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', re.S)
META = re.compile(r'\n?<meta http-equiv="Content-Security-Policy"[^>]*>')

SITES = {
    'site': {
        'script': ["'self'"],
        'connect': ["https://*.supabase.co"],
        'img': ["'self'", 'data:'],
        'extra_headers': [],
    },
    'admin': {
        'script': ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/'],
        'connect': ['https://*.supabase.co', 'wss://*.supabase.co'],
        'img': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
        'extra_headers': ['X-Robots-Tag: noindex, nofollow', 'Cache-Control: no-store'],
    },
}

BASE_HEADERS = [
    'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options: DENY',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy: same-origin',
]


def csp(cfg, hashes, for_meta):
    parts = [
        "default-src 'none'",
        "script-src " + " ".join(cfg['script'] + [f"'sha256-{h}'" for h in sorted(hashes)]),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src " + " ".join(cfg['img']),
        "connect-src " + " ".join(cfg['connect']),
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
    ]
    if not for_meta:            # navegadores ignoram estes dois em <meta>
        parts += ["frame-ancestors 'none'", "upgrade-insecure-requests"]
    return "; ".join(parts)


def build():
    out = {}
    for name, cfg in SITES.items():
        folder = APPS / name
        pages = sorted(folder.glob('*.html'))
        hashes = set()
        for page in pages:
            html = META.sub('', page.read_text(encoding='utf-8'))
            for body in SCRIPT.findall(html):
                hashes.add(base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode())
        meta = f'<meta http-equiv="Content-Security-Policy" content="{csp(cfg, hashes, True)}">'
        for page in pages:
            html = META.sub('', page.read_text(encoding='utf-8'))
            html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + meta, 1)
            out[page] = html
        lines = ['# Gerado por apps/security-headers.py — não edite à mão', '/*',
                 f'  Content-Security-Policy: {csp(cfg, hashes, False)}']
        lines += [f'  {h}' for h in BASE_HEADERS + cfg['extra_headers']]
        out[folder / '_headers'] = '\n'.join(lines) + '\n'
    return out


def main():
    check = '--check' in sys.argv
    stale = []
    for path, content in build().items():
        current = path.read_text(encoding='utf-8') if path.exists() else None
        if current != content:
            stale.append(path.relative_to(APPS.parent))
            if not check:
                path.write_text(content, encoding='utf-8')
    if check and stale:
        print('Cabeçalhos desatualizados (rode python3 apps/security-headers.py):', *stale, sep='\n  ')
        sys.exit(1)
    print('ok' if not stale else f'atualizado: {len(stale)} arquivo(s)')


if __name__ == '__main__':
    main()
