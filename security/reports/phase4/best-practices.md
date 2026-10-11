# Boas práticas (SEC-041)

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
