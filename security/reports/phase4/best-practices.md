# Boas práticas (SEC-041)

| Domínio | Prática | Referência |
|---|---|---|
| Autorização | Toda tabela nova com RLS e grants por coluna; nada herdado por padrão | OWASP API1/API3:2023, ASVS V4 |
| Painel administrativo | Ações de suporte só com segundo fator (aal2), motivo obrigatório e trilha em audit_logs | OWASP ASVS V2.8, V4.3 |
| Lógica de negócio | Regras de cota, denúncia, verificação e pagamento sempre no servidor, com lock quando há contagem | OWASP API6:2023 |
| Fluxos em etapas | Cada etapa confere a anterior no servidor (ex.: selfie enviada depois do desafio) | OWASP ASVS V11.1 |
| Moderação | Estado de moderação em colunas que o usuário não altera; ação automática só com sinais confiáveis; banimento humano | OWASP API6:2023 |
| IA / classificadores | Modelo fixado por versão, entrada limitada, decisão por limites no código, notas registradas | OWASP Top 10 for LLM (LLM01, LLM05, LLM10) |
| APIs externas | Timeout em toda chamada, resposta validada, falha sem vazar conteúdo | OWASP API10:2023 |
| Anti-automação | Rate limit por ação e por origem, campo-isca em formulários públicos, CAPTCHA antes de campanhas pagas | OWASP API4/API6:2023 |
| Páginas web | CSP com hash, HSTS, X-Frame-Options, nosniff, Referrer-Policy; SRI em scripts de CDN | OWASP Secure Headers, W3C SRI |
| Sessão | Tokens no Keychain/Keystore no app e sessionStorage no painel; access token curto; refresh rotativo | OWASP MASVS-STORAGE-1, MASVS-AUTH |
| Uploads | Caminho e nome validados no servidor; tipo real pelos bytes; moderação de imagem | OWASP File Upload Cheat Sheet |
| Dados pessoais | Consentimento no servidor, exportação, exclusão, retenção automática, hash de IP com prazo | LGPD arts. 7, 11, 16, 18 |
| Supply chain | `npm ci`, Dependabot, auditoria no CI, actions por SHA, riscos aceitos com prazo | OWASP A06:2021, NIST SSDF PW.4 |
| DevSecOps | Secrets scanning, SAST, deno check, conferência dos cabeçalhos e testes de regressão em todo PR | NIST SSDF PW.7/PW.8 |
| Monitoramento | Alertas de segurança com canal de notificação e responsável | OWASP A09:2021 |
