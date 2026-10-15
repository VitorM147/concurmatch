# Homologação gratuita — conmatch-hml

Estado conferido em 15/10/2026 (UTC).

## Projeto

- Referência: `rrsfelwxegzlhmotloop`.
- API: https://rrsfelwxegzlhmotloop.supabase.co
- Organização: Vitor Moreira Corp, plano **Free**, sem upgrade efetuado.
- Região efetivamente criada pelo usuário: `us-east-1`.
- Não usar este ambiente como produção antes do aceite descrito em [BETA.md](BETA.md).

## Implantado e conferido

- Estruturas e permissões das migrations 0001–0020, com as exceções abaixo.
- Seed inicial; 12 áreas, 32 concursos, 16 provas/seleções e 12 cursos.
- 24 tabelas em public, todas com RLS habilitado.
- Bucket photos privado, limite de 5 MiB por arquivo.
- Publicação Realtime de messages.
- Função storage-maintenance publicada, mas **sem segredo configurado e sem agendamento**.
  Uma requisição sem o cabeçalho secreto retornou HTTP 403, como esperado.
- API de Auth: cadastro por e-mail habilitado, confirmação obrigatória e login anônimo desativado.
- Acesso público a profiles, admins e account_deletion_jobs recusado pela API com HTTP 401.
- Chave pública publishable disponível; configuração local do app preenchida em .env ignorado pelo Git.
  Nenhuma chave de serviço foi colocada no aplicativo.
- Migration adicional harden_helper_search_paths: caminho de resolução fixado em 14 funções auxiliares.
  Consulta no banco confirmou zero funções em public sem search_path definido.

## Exceções de implantação

A revisão automática bloqueou a rotina recorrente de exclusão permanente por falta de
autorização específica. A homologação prosseguiu somente com operações não agendadas.
**Nenhuma limpeza foi executada e nenhum cron foi criado nesta implantação.**

Foram omitidos os comandos cron.schedule das migrations 0006, 0011, 0015, 0017 e 0020.
A extensão pg_cron também não foi instalada pelo trecho da 0006.
Os nomes correspondentes no histórico remoto têm o sufixo without_retention_job ou
without_scheduled_job, para registrar a diferença.

A publicação de report-triage também foi bloqueada: o código integra serviços externos
de IA e alertas, incompatíveis com a configuração gratuita e manual escolhida para este beta.
Essa função e selfie-check **não foram publicadas**. Não foram cadastradas chaves OpenAI/AWS.

As migrations foram aplicadas pelo conector, que gerou versões com timestamp no histórico remoto.
Os arquivos antigos do repositório ainda usam números curtos (0001 etc.).
Antes de usar db push/pull, conferir e reconciliar o histórico com a CLI; não reaplicar
automaticamente as migrations existentes. Registrar as versões realmente instaladas e preservar
as exceções acima. Não marcar o agendamento omitido como executado.

## Pendências que bloqueiam o aceite do beta

1. Configurar e conferir Auth conforme supabase/config.toml, especialmente retorno
   conmatch://auth/callback, tamanho/complexidade de senha e MFA TOTP.
   O conector utilizado não oferece atualização dessas configurações; o valor local
   do arquivo não altera automaticamente o projeto hospedado.
2. Definir envio de e-mail para testadores. O envio padrão não serve para uma lista
   externa geral; escolher uma alternativa SMTP que permaneça gratuita e verificar
   os limites antes de cadastrar pessoas. Não contratar plano ou serviço pago.
3. Cadastrar a conta real de suporte com MFA em public.admins. Não foi criada conta
   privilegiada fictícia. A moderação de fotos e selfies será manual.
4. Configurar o segredo compartilhado da manutenção no Vault e nas Edge Functions,
   obter aprovação específica para o agendamento de exclusões e testar uma exclusão
   solicitada por uma conta de teste. Até isso funcionar, a solicitação oculta/bloqueia
   o perfil, mas o processamento final da fila permanece parado.
5. Configurar o projeto/conta Expo, gerar APK e executar o roteiro manual de BETA.md.
   Nenhum APK foi gerado nesta configuração.

A retenção periódica geral permanece desativada. Para uma eventual autorização,
seus prazos padrão são: matches desfeitos há 180 dias sem denúncia aberta; passes
há 365 dias; auditoria e denúncias resolvidas há 5 anos; alertas resolvidos há 1 ano.
As regras podem ser configuradas; a remoção é definitiva.

## Avisos do Supabase Advisors

Depois da correção dos search_paths, permaneceram avisos a revisar no contexto:

- Tabelas internas com RLS sem políticas: acesso direto negado intencionalmente;
  operações permitidas passam pelas funções específicas.
- Funções SECURITY DEFINER expostas: APIs intencionais (incluindo join_waitlist);
  manter verificação de identidade, participação, privilégios e MFA nos respectivos corpos.
  Os testes de segurança continuam necessários; este aviso não constitui prova de ausência de falhas.
- pg_net instalado em public e não relocável nesta versão. Não alterar catálogos
  internos para esconder o aviso. Ver [orientação do Advisor](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

O projeto ainda não foi aprovado para receber testadores externos.
