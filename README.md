# ConMatch — MVP

App de relacionamento para quem estuda para concursos, vestibular/ENEM, carreira militar, OAB e residência (18+). *Pessoas que constroem mais juntas.* Para trocar o nome, edite `apps/mobile/src/brand.ts` e `apps/mobile/app.json`.

> Deu match? **"Deu ConMatch! Vocês querem se conhecer."**

**Identidade:** paleta *Azul profundo* — `#0B2545` principal, `#1E40AF` secundária, `#F43F5E` destaque (rosa), `#E0E7FF` fundo, `#F8FAFC` superfície, `#1F2937` texto. Títulos em Playfair Display, interface em Inter. Tokens em `apps/mobile/src/theme.ts`; símbolo e ícones em `brand/`.

## O que já está pronto

| Parte | Conteúdo |
|---|---|
| **Banco (Supabase/Postgres)** | Schema, RLS, regras de negócio em funções SQL, catálogo de concursos e configurações |
| **Testes do banco** | 115 testes automatizados com Postgres embarcado: match, cotas diárias, verificação, curtida com mensagem, filtro de programa/cobrança, denúncia com evidência, recurso, interesses, discovery, chat, bloqueio, denúncia, RLS, LGPD e regressões de segurança |
| **App (Expo / React Native)** | Cadastro e login, onboarding com consentimento LGPD, Descobrir (swipe + curtida com mensagem), tela de match, abas Conexões e Mensagens, chat em tempo real com sugestões para conversar, denunciar, bloquear e desfazer match, perfil com fotos, "Sobre mim", interesses e preferências, Premium (tela, só verificado), verificação por gesto + selfie, perfil em análise com recurso, Central de segurança, excluir conta |
| **CI** | GitHub Actions rodando os testes do banco e o typecheck do app |

### Beta fechado e teste manual

Consulte [docs/BETA.md](docs/BETA.md) para a implantação em homologação e o roteiro
completo de aceite no aparelho. As migrations `0019` e `0020` exigem a atualização
das Edge Functions e a configuração de `storage-maintenance`; a exclusão de conta
passa a ser uma solicitação persistente, concluída após remover os arquivos.
Fotos novas ficam pendentes e podem ser aprovadas na aba **Fotos pendentes** do
painel de suporte, com MFA. Trocar fotos exige nova verificação do perfil.
O app inclui recuperação de senha e callback de e-mail; esses links precisam ser
testados em build nativo com os redirects do Supabase configurados.

### Objetivos de preparação

O onboarding parte de um objetivo principal: concurso público, vestibular/ENEM,
carreira militar ou OAB/residência. Área, prova, curso, instituição e detalhes são
opcionais. O perfil permite editar o objetivo e adicionar outros caminhos.
Os cards mostram prova/seleção e curso desejado. O público não é um filtro de
exclusão: a descoberta continua respeitando gênero, idade, distância e segurança.
Afinidades de objetivo, prova e curso têm pesos configuráveis no banco.

**Atualização de uma instalação existente:** aplique
`supabase/migrations/0018_study_goals.sql` antes de publicar o novo aplicativo.
Ela preserva os dados antigos e identifica perfis da área militar; recria a RPC
`discover` com os novos campos e mantém seu acesso restrito a usuários autenticados.
Os catálogos iniciais são sugestões de preparação, não uma agenda de inscrições.
Para alterá-los, use uma nova migration, preservando os IDs já referenciados.
Valide primeiro em homologação. A atualização não publica o app nem aplica SQL
no projeto hospedado automaticamente.

O app também tem oito testes de objetivos, links de autenticação e histórico de mensagens:
`cd apps/mobile && npm test` (Node 22.6+).

### Regras de negócio implementadas

- **Mostrou a cara, ganhou voz.** Sem verificação a pessoa só curte e passa, até 10 vezes por dia: não manda nem recebe curtida com mensagem, não conversa depois do match (o chat só abre entre dois verificados) e não assina o Premium. A verificação é um gesto sorteado + selfie, revisada pelo suporte (`moderation_review_verification`), e precisa ser refeita após trocar fotos.
- **Ações por dia = curtir + passar.** 10 sem verificação, 50 verificado grátis e 250 no Premium, renovando à meia-noite de Brasília (configurável em `app_config`). Passar conta para ninguém "folhear" perfis só atrás de @ na bio.
- **Curtida com mensagem (botão ★).** Recado de até 100 caracteres junto da curtida, só entre perfis verificados. A pessoa vê o recado no card, e quem mandou recado aparece primeiro no Descobrir. Se der match, os recados viram as primeiras mensagens da conversa. Sem links, e-mails, @perfis, telefone, Pix ou preço; 5 por dia no grátis e 100 no Premium. A curtida conta nas ações do dia.
- **Sem programa nem cobrança.** Termos típicos ("faço programa", "atendo com local", "cachê", "valores no pv", OnlyFans, sugar...) são barrados na bio, no recado e no chat; na bio e no recado também Pix e preço. A bio não aceita telefone, link ou e-mail (o @ do Instagram pode). Há um motivo de denúncia próprio, com alerta prioritário.
- **Interesses.** Até 10, de um catálogo fixo (`interest_catalog()`); os em comum aparecem destacados no card.
- **Match atômico.** Um lock por par impede que dois likes simultâneos deixem de gerar o match.
- **Discovery** com:
  - interesse mútuo de gênero;
  - faixa de idade respeitada nos dois sentidos;
  - raio de distância respeitado pelos dois;
  - exigência de pelo menos 1 foto;
  - exclusão de quem foi bloqueado, de quem já foi visto e de quem já é match.
- **Modo Lotação.** Mostra quem está na sua cidade de destino e quem vai para o mesmo lugar.
- **Compatibilidade explicável.** Os pesos ficam na tabela `matching_weights`, e alterar a regra é só fazer um `UPDATE`, sem deploy. Ela serve de **desempate**: o card mostra "Mesmo concurso", "Estudam no mesmo período" etc.
- **Privacidade.** O banco arredonda a localização para cerca de 1 km e o app mostra só faixas ("a ~15 km"). O bucket de fotos é privado, acessado por URL assinada.
- **Segurança:**
  - denunciar já bloqueia a pessoa;
  - 3 denunciantes confiáveis (conta com 24h+ e foto) ocultam o perfil até revisão humana; para "menor de idade" bastam 2;
  - a denúncia guarda como evidência **só a conversa daquele par** (e o recado da curtida), congelada antes do bloqueio;
  - **triagem automática** (Moderation API da OpenAI, gratuita): a cada minuto um robô analisa o que a pessoa denunciada escreveu. Grave (ameaça, assédio sexual, programa) → some do app na hora, com uma denúncia só; sem evidência → a denúncia é arquivada e, se não sobrar nenhuma, o perfil volta sozinho; perfil falso → resolve verificando o rosto. Para uma pessoa sobra só `moderation_queue()`: confirmar banimentos, casos de menor de idade, recursos e selfies;
  - a pessoa ocultada vê que está em análise (sem saber quem denunciou nem o motivo) e pode mandar a versão dela; o suporte decide com `moderation_resolve` (restaurar ou banir), tudo registrado em `audit_logs`;
  - toda denúncia gera alerta em `security_alerts`, e o usuário ocultado não consegue se reexibir;
  - limites de mensagens, curtidas, passes e denúncias (anti-spam e anti-raspagem);
  - sessão guardada no Keychain/Keystore;
  - usuário banido fica sem acesso;
  - o usuário não consegue se auto-verificar, se desbanir ou virar Premium (bloqueado por grants de coluna).
- **LGPD:**
  - exportação dos próprios dados (`export_my_data`) e retenção automática;
  - consentimento separado para dado sensível (orientação de interesse, art. 11);
  - apenas maiores de 18 anos;
  - exclusão total da conta em cascata.

## Segurança

Auditado com **ESAA-Security** (108 checks, 17 domínios): score **62,6 → 90,9** após as correções.
Relatório, trilha de eventos e score em [`security/`](security/README.md); controles, riscos aceitos e configuração manual em [`SECURITY.md`](SECURITY.md).

## Estrutura

```
conmatch/
├── apps/mobile/            App Expo (React Native + expo-router)
│   ├── app/                Telas (rotas)
│   └── src/                api, sessão, fotos, tema, componentes
├── supabase/
│   ├── migrations/         0001 schema · 0002 regras · 0003 RLS · 0004 storage/realtime · 0005/0006 hardening · 0007 curtida com mensagem
│   ├── seed.sql            Configurações, pesos e catálogo de concursos
│   └── tests/              Testes com PGlite
├── security/               Auditoria ESAA-Security (eventos, relatórios, orquestrador)
├── docs/adr/               Decisões de arquitetura
└── .github/workflows/      CI
```

## Como rodar

### 1. Supabase (cerca de 10 min)

1. Crie um projeto em [supabase.com](https://supabase.com), na região **South America (São Paulo)**.
2. Em **SQL Editor**, rode em ordem os arquivos `0001` a `0020` de `supabase/migrations/` e depois o `seed.sql` (o `0006` exige a extensão `pg_cron`).
   - Se usar a Supabase CLI: `supabase link` e depois `supabase db push`.
3. Em **Authentication → Providers → Email**, deixe ativo. Em desenvolvimento, você pode desligar o "Confirm email".

### 2. App

```bash
cd apps/mobile
cp .env.example .env      # preencha URL e anon key do Supabase (Settings → API)
npm install
npx expo start
```

Abra no celular pelo app **Expo Go**, lendo o QR code. Para testar o match, crie duas contas: uma num celular e outra num emulador ou em outro aparelho.

> Requisito: a primeira foto precisa ser enviada para o perfil aparecer no Descobrir.

### 3. Testes do banco

```bash
cd supabase/tests
npm install
npm test          # 115 testes: regras, segurança e objetivos, sem Docker nem Supabase
```

## Próximos passos (fora deste MVP)

| Item | Como |
|---|---|
| Cobrança do Premium (R$ 24,90) | RevenueCat (assinaturas Apple/Google) + webhook gravando em `entitlements` |
| Push de "novo match" e "nova mensagem" | Database Webhook → Edge Function → Expo Push |
| Prova de vida na verificação (Face Liveness) | Componente nativo da AWS no app; hoje a selfie com desafio + CompareFaces já roda (`selfie-check`) |
| Moderação automática de fotos | Edge Function + Rekognition `DetectModerationLabels` → `photos.approved` |
| Validar exclusão e limpeza no ambiente real | Worker `storage-maintenance` e fila durável já implementados; configurar conforme `docs/BETA.md` |
| Login com Google/Apple | Supabase Auth OAuth (a Apple exige "Sign in with Apple" se houver login social) |

## Custos (MVP)

Ver `docs/adr/ADR-001`. Estimativa: R$ 300 a R$ 400 por mês de infraestrutura, dentro do orçamento de R$ 3.000 por mês.

## Robô de triagem de denúncias

A Edge Function `supabase/functions/report-triage` roda a cada minuto (pg_cron, migration `0011`). Para ligar no projeto:

1. Crie uma chave em platform.openai.com → API keys (a Moderation API é gratuita).
2. Gere um segredo aleatório para o robô, por exemplo com `openssl rand -hex 32`.
3. Configure e publique a função:
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-... REPORT_TRIAGE_SECRET=<segredo>
   supabase functions deploy report-triage --no-verify-jwt
   ```
4. No SQL Editor, guarde a URL e o mesmo segredo no Vault e aplique a `0011`:
   ```sql
   select vault.create_secret('https://<projeto>.supabase.co/functions/v1/report-triage', 'report_triage_url');
   select vault.create_secret('<segredo>', 'report_triage_secret');
   ```
5. Para ver o que sobrou para decidir: `select public.moderation_queue();`. Para decidir: `select public.moderation_resolve('<user_id>', 'banir' | 'restaurar', 'motivo');`.

O mesmo robô confere as fotos novas (tipo real do arquivo e Moderation API de imagem) e, se `ALERT_WEBHOOK_URL` estiver configurado (`supabase secrets set ALERT_WEBHOOK_URL=...`, um webhook do Slack, Discord ou Google Chat), avisa o suporte sobre alertas importantes, sem mandar conteúdo de conversa. Aplique também a migration `0017`.

Os limites de gravidade ficam em `supabase/functions/_shared/report-decision.js`. A Política de Privacidade precisa informar que, em caso de denúncia, o texto da conversa é analisado por um serviço automático fora do Brasil (OpenAI).

## Painel do suporte (`apps/admin`)

O painel exige **segundo fator**: no primeiro acesso ele mostra um QR code para o app autenticador (Google Authenticator, 1Password...), e daí em diante pede o código de 6 dígitos. Sem isso o banco recusa qualquer decisão (`MFA_REQUIRED`). Ative o TOTP em Authentication → Multi-Factor no painel do Supabase.

Uma página só (`apps/admin/index.html`), sem build. Abra no navegador ou publique em qualquer hospedagem estática (ex.: `suporte.conmatch.com.br`, protegida por senha no provedor).

1. No SQL Editor, torne sua conta admin: `insert into public.admins (user_id) values ('<seu user id>');`
2. Abra a página, informe a URL e a chave **pública** (anon) do projeto e entre com seu e-mail e senha do app.
3. A fila mostra só o que precisa de uma pessoa, em ordem: menor de idade, casos graves, recursos, selfies. Cada caso traz a conversa guardada na denúncia, as notas da triagem e as fotos.
4. Toda decisão exige um motivo e fica em `audit_logs` com o seu id.

## Verificação automática de selfie (`supabase/functions/selfie-check`)

Pronta e **desligada** até existir conta na AWS. Enquanto isso, as selfies aparecem no painel do suporte.

- O app sorteia um desafio de rosto (sorrir, ficar sério, virar o rosto…). O robô confere o desafio com `DetectFaces` e compara a selfie com até 3 fotos do perfil (`CompareFaces`).
- Mesmo rosto (≥ 92%) e desafio cumprido = aprovada na hora. Rosto diferente, foto escura ou desafio não feito = recusada, com a orientação. Na 3ª recusa em 24h, ou com idade aparente abaixo de 18, vai para uma pessoa.
- Depois de decidir, a selfie é apagada; ficam só as notas.
- Para ligar: crie um usuário IAM com permissão só para `rekognition:DetectFaces` e `rekognition:CompareFaces`, depois `supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=sa-east-1 SELFIE_CHECK_SECRET=...`, `supabase functions deploy selfie-check --no-verify-jwt` e os dois segredos no Vault (`selfie_check_url`, `selfie_check_secret`), como descrito na migration `0015`.
- Custo de referência: US$ 0,001 por imagem analisada (até 4 por verificação).

## Site e lista de espera (`apps/site`)

`apps/site/index.html` é o conmatch.com.br: apresentação, planos e lista de espera por cidade (gravada em `public.waitlist` pela função `join_waitlist`, que não devolve dados de ninguém). Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `apps/site/config.js` e publique a pasta em qualquer hospedagem estática (Cloudflare Pages, Netlify, Vercel) apontando o domínio do Registro.br.

A URL e a chave pública ficam em `apps/site/config.js`. Os arquivos `_headers` (site e painel) trazem CSP, HSTS e os demais cabeçalhos de segurança no formato do Cloudflare Pages e do Netlify; se mudar algum `<script>` inline, rode `python3 apps/security-headers.py` (o CI confere).

`termos.html` e `privacidade.html` são gerados de `docs/legal/*.md` (rascunho para o advogado): rode `python3 apps/site/build-legal.py` sempre que o texto mudar. O app abre esses links no cadastro.
