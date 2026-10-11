# Probatório — MVP

App de relacionamento para concurseiros. Nome provisório. Para trocar o nome, edite `apps/mobile/src/brand.ts` e `apps/mobile/app.json`.

> Deu match? **"Aprovados! Vocês entraram no Estágio Probatório."**

## O que já está pronto

| Parte | Conteúdo |
|---|---|
| **Banco (Supabase/Postgres)** | Schema, RLS, regras de negócio em funções SQL, catálogo de concursos e configurações |
| **Testes do banco** | 31 testes automatizados com Postgres embarcado: match, limite de curtidas, discovery, chat, bloqueio, denúncia, RLS, LGPD e regressões de segurança |
| **App (Expo / React Native)** | Cadastro e login, onboarding com consentimento LGPD, Descobrir (swipe), tela de match, lista de matches, chat em tempo real, denunciar, bloquear e desfazer match, perfil com fotos e preferências, Premium (tela), Central de segurança, excluir conta |
| **CI** | GitHub Actions rodando os testes do banco e o typecheck do app |

### Regras de negócio implementadas

- **20 curtidas por dia** no plano grátis. O limite renova à meia-noite de Brasília e é configurável em `app_config`. O Premium tem curtidas ilimitadas.
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
probatorio/
├── apps/mobile/            App Expo (React Native + expo-router)
│   ├── app/                Telas (rotas)
│   └── src/                api, sessão, fotos, tema, componentes
├── supabase/
│   ├── migrations/         0001 schema · 0002 regras · 0003 RLS · 0004 storage/realtime · 0005/0006 hardening
│   ├── seed.sql            Configurações, pesos e catálogo de concursos
│   └── tests/              Testes com PGlite
├── security/               Auditoria ESAA-Security (eventos, relatórios, orquestrador)
├── docs/adr/               Decisões de arquitetura
└── .github/workflows/      CI
```

## Como rodar

### 1. Supabase (cerca de 10 min)

1. Crie um projeto em [supabase.com](https://supabase.com), na região **South America (São Paulo)**.
2. Em **SQL Editor**, rode em ordem os arquivos `0001` a `0006` de `supabase/migrations/` e depois o `seed.sql` (o `0006` exige a extensão `pg_cron`).
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
npm test          # 31 testes (regras + regressões de segurança), sem Docker nem Supabase
```

## Próximos passos (fora deste MVP)

| Item | Como |
|---|---|
| Cobrança do Premium (R$ 24,90) | RevenueCat (assinaturas Apple/Google) + webhook gravando em `entitlements` |
| Push de "novo match" e "nova mensagem" | Database Webhook → Edge Function → Expo Push |
| Verificação de selfie (selo ✓) | Edge Function + AWS Rekognition (Face Liveness) |
| Moderação automática de fotos | Edge Function + Rekognition `DetectModerationLabels` → `photos.approved` |
| Painel admin de denúncias | Supabase Studio no início; depois, uma página web simples |
| Apagar arquivos de foto ao excluir conta | Edge Function agendada limpando arquivos órfãos do Storage |
| Login com Google/Apple | Supabase Auth OAuth (a Apple exige "Sign in with Apple" se houver login social) |

## Custos (MVP)

Ver `docs/adr/ADR-001`. Estimativa: R$ 300 a R$ 400 por mês de infraestrutura, dentro do orçamento de R$ 3.000 por mês.
