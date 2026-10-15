# ConMatch — preparação e teste manual do beta

## Estado da entrega

Esta branch prepara um beta gratuito e fechado. Não é uma confirmação de que o
Supabase hospedado ou um build instalado já foram validados. A CI verifica regras,
segurança, TypeScript, tipos das Edge Functions e geração do bundle Android.
O roteiro abaixo é o critério de aceite no ambiente real.

Implementado nesta entrega:

- Objetivos de preparação, catálogos, edição e descoberta integrada.
- Recuperação de senha, callback dos e-mails e tela de nova senha.
- Falha de rede ao carregar perfil não é tratada como cadastro incompleto.
- Histórico paginado, sincronização após reconexão e atualização de leitura.
- Fotos pendentes por padrão, moderação automática ou manual no suporte.
- Troca atômica de fotos, nova verificação após troca e invalidação de análise antiga.
- Exclusão durável: ocultação/bloqueio imediato; arquivos antes da identidade.
- Limpeza de fotos substituídas, selfies decididas e uploads órfãos.
- Alertas com reserva temporária, confirmação de entrega e nova tentativa.

Fora desta entrega: cobrança real, restauração de compras, benefícios Premium
pendentes, notificações push, login social, prova de vida real, publicação nas lojas,
validação jurídica dos rascunhos e monitoramento externo. O beta pode testar namoro,
match e conversa gratuitamente; não deve anunciar uma assinatura funcional.

## Ordem de implantação em homologação

1. Faça backup do ambiente existente. Use um projeto de homologação separado.
2. Aplique todas as migrations até `0020`, em ordem, e o `seed.sql` em instalações
   novas. Se já aplicou até `0018`, aplique somente `0019` e `0020`.
3. Publique as funções atualizadas imediatamente depois das migrations:

   ```bash
   supabase functions deploy report-triage --no-verify-jwt
   supabase functions deploy storage-maintenance --no-verify-jwt
   # Opcional, se a AWS já estiver configurada:
   supabase functions deploy selfie-check --no-verify-jwt
   ```

4. Configure `STORAGE_MAINTENANCE_SECRET` nas secrets das Edge Functions. Escolha
   um segredo aleatório forte. No Vault do banco, configure o mesmo valor com nome
   `storage_maintenance_secret` e a URL da função com nome `storage_maintenance_url`.
   Exemplo SQL para um projeto novo, substituindo os marcadores:

   ```sql
   select vault.create_secret('https://SEU_PROJETO.supabase.co/functions/v1/storage-maintenance', 'storage_maintenance_url');
   select vault.create_secret('SEU_SEGREDO_ALEATORIO', 'storage_maintenance_secret');
   ```

   Se os nomes já existirem, atualize os registros existentes no Vault. Não crie
   cópias com o mesmo nome. Nunca coloque esses segredos no aplicativo.
5. Para denúncias/fotos automáticas, configure `OPENAI_API_KEY`,
   `REPORT_TRIAGE_SECRET`, `report_triage_url` e `report_triage_secret`, conforme
   o README. Para alertas, configure também `ALERT_WEBHOOK_URL`.
   Sem OpenAI, as fotos podem ser aprovadas manualmente na aba **Fotos pendentes**;
   o worker de triagem ainda pode entregar alertas se o webhook estiver configurado.
6. No Supabase Auth, ative confirmação de e-mail, confira as senhas e os demais
   valores de `supabase/config.toml`, configure SMTP e permita o redirect
   `conmatch://auth/callback` (o wildcard `conmatch://**` já está no arquivo).
7. Cadastre uma conta de suporte em `public.admins` e entre no painel com MFA.
8. Configure as variáveis públicas do app e do site. Apenas URL e chave pública
   anon/publishable vão para o cliente; nunca a chave `service_role`.
9. Gere um build nativo para testar os links de autenticação. `apps/mobile/eas.json`
   inclui o perfil `preview` para um APK Android interno. É necessário conectar sua
   conta/projeto Expo, configurar as variáveis do ambiente de build e gerar/instalar
   o APK. O bundle exportado na CI não é um APK.
   Expo Go pode ajudar em outros fluxos, mas não comprova o esquema nativo
   `conmatch://` do aplicativo. iOS requer configuração de assinatura apropriada.

**Mudança importante:** fotos antigas sem análise registrada também voltam à fila
na migration `0019`; elas ficam ocultas até aprovação. A troca de qualquer foto
retira a verificação e exige uma nova selfie. A migração altera o status de análise. Ao trocar uma foto no app, a referência
é substituída e o arquivo anterior entra na fila de limpeza.

## Conferências antes de convidar testadores

```sql
select jobname, active from cron.job
where jobname in ('report-triage', 'selfie-check', 'storage-maintenance');

select count(*) as exclusoes_pendentes, max(attempts) as maior_numero_tentativas
from public.account_deletion_jobs;

select count(*) as arquivos_pendentes from public.file_cleanup_jobs;
select count(*) as fotos_pendentes from public.photos where auto_checked_at is null;
```

`storage-maintenance` roda a cada cinco minutos. Se não estiver configurado, as
exclusões ficam registradas, mas não terminam: isso bloqueia a aprovação do beta.
Confira logs e resultado de uma exclusão real antes de convidar outras pessoas.
Falhas ficam para nova tentativa; cada execução limita o volume de arquivos.
Uploads não referenciados entram na coleta após 24 horas, evitando conflito com
uploads em andamento. A confirmação de entrega de alertas ocorre depois de um
HTTP de sucesso; um problema após o recebimento pode gerar repetição do aviso.

## Roteiro de teste manual

Use duas contas de teste adultas, com fotos autorizadas, localização compatível
e preferências recíprocas. Use um aparelho/build com acesso ao e-mail de cada
conta. Registre aparelho, versão, passos, resultado e captura de erro sem tokens.

| Teste | Ação | Resultado esperado |
|---|---|---|
| Cadastro | Criar conta e confirmar e-mail no aparelho | Callback conclui o acesso e abre o onboarding |
| Link inválido | Abrir um link expirado ou incompleto | Mensagem clara, sem travamento e sem mostrar tokens |
| Recuperação | Pedir recuperação, abrir e-mail e definir senha | Senha fraca/diferente é barrada; nova senha permite acesso |
| Rede no acesso | Desligar rede e reabrir app com sessão existente | Tela de erro/repetição; não inicia outro cadastro |
| Objetivos | Testar concurso, ENEM, militar e OAB/residência | Campos correspondentes; prova e curso podem ficar vazios |
| Edição | Trocar objetivo e salvar; reiniciar app | Dados persistem e campos do caminho antigo são limpos |
| Fotos pendentes | Enviar uma primeira foto | Dono acompanha análise; outro usuário não vê o perfil ainda |
| Aprovação manual | Suporte com MFA aprova foto e informa motivo | Perfil entra na descoberta; decisão aparece na auditoria |
| Recusa | Suporte recusa foto | Foto continua fora da descoberta e pode ser substituída |
| Selfie | Enviar selfie e decidir no suporte | Selo aparece apenas após aprovação; selfie entra na limpeza |
| Troca de foto | Trocar imagem de perfil já verificado | Nova foto fica pendente e o selo é retirado; é preciso verificar novamente |
| Públicos diferentes | ENEM e militar se curtirem | Match funciona entre públicos; objetivo não exclui pessoas |
| Chat | Enviar mensagens nos dois aparelhos | Mensagens chegam sem duplicação; leitura atualiza no remetente |
| Histórico | Acumular mais de 50 mensagens e carregar anteriores | Histórico completo, sem perder a posição ou duplicar linhas |
| Reconexão | Tirar um aparelho da rede, enviar mensagens no outro e reconectar | Mensagens ausentes são recuperadas; o texto digitado é preservado |
| Falha nas listas | Perder rede em Conexões/Mensagens | Erro com repetição, sem afirmar que a lista está vazia |
| Segurança | Bloquear, desfazer match e denunciar | Conversa deixa de aceitar envio; denúncia chega ao suporte |
| Exportação | Baixar os próprios dados | Inclui objetivo de preparação e dados da própria conta |
| Exclusão | Solicitar exclusão e fechar o app | Perfil some e não pode agir; worker remove arquivos e identidade |
| Arquivos | Conferir bucket após exclusão e após troca/selfie decidida | Nada da conta excluída permanece no seu prefixo; jobs de limpeza são concluídos |
| Falha de entrega | Em homologação, usar webhook que responda HTTP 500 | Alerta não fica como enviado; volta para tentativa posterior |

Aprovar o beta somente depois de cadastro/recuperação, fotos, match/chat e exclusão
funcionarem no ambiente real. Não use dados reais de clientes para este ensaio.

## Próximos marcos

1. Configuração e aceite deste beta no aparelho.
2. Correção dos problemas reproduzidos no teste e adição de monitoramento de erros.
3. Push e monetização, incluindo compra/restauração/expiração e benefícios realmente implementados.
4. Publicação nas lojas, documentos revisados e operação de suporte.

A previsão depende do acesso às contas e serviços, dos resultados no aparelho e
dos prazos de publicação. Não há execução do projeto em segundo plano entre as
interações; o trabalho continua nas próximas sessões a partir desta branch.
