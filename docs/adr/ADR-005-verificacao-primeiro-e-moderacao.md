# ADR-005 — Verificação primeiro e moderação com revisão humana

**Status:** aceito · **Data:** 2026-10-12

## Contexto

Apps de relacionamento novos tendem a virar "submundo": perfis falsos, spam, golpe e oferta de programa. Se as mulheres não se sentem seguras, elas saem, e o app perde quem sustenta todo o resto. O ConMatch precisa nascer com regras que deixem o ambiente parecido com o dos apps consolidados.

## Decisão

1. **Mostrou a cara, ganhou voz.** Sem verificação, a pessoa só curte e passa, até 10 vezes por dia (migration 0009). Ela não manda nem recebe curtida com mensagem e não conversa depois do match: o chat só abre entre dois perfis verificados. Assinar o Premium também exige verificação (trava no app e trigger em `entitlements`).
2. **Verificação** por gesto sorteado + selfie, revisada pelo suporte. Aprovada uma vez, vale para sempre. A selfie fica no bucket privado, fora de `public.photos`, e só o `service_role` consegue lê-la.
3. **Ações por dia = curtir + passar.** São 10 sem verificação, 50 no grátis verificado e 250 no Premium. Passar conta para impedir quem só "folheia" perfis atrás de @ na bio e leva a conversa para fora.
4. **Curtida com mensagem:** 5 por dia no grátis e 100 no Premium.
5. **Sem programa nem cobrança.** Termos típicos são barrados na bio, no recado da curtida e no chat. Na bio e no recado também ficam barrados Pix e preço; no chat, não, porque "dividir no Pix" é conversa normal. A bio não aceita telefone, link ou e-mail, mas o @ do Instagram pode. A denúncia tem um motivo próprio, com alerta prioritário.
6. **Denúncia:**
   - 3 denunciantes confiáveis ocultam o perfil até a revisão, e ninguém é banido sem análise humana;
   - a denúncia guarda como evidência só a conversa daquele par;
   - a pessoa ocultada pode mandar a versão dela;
   - o suporte decide entre restaurar e banir, e a decisão fica em `audit_logs`;
   - **triagem automática** (migration 0010): a Moderation API da OpenAI dá nota ao que a pessoa denunciada escreveu. Se a evidência é grave, o perfil é escondido na hora. Se não há evidência, a denúncia é arquivada, e o perfil é restaurado quando não sobra nenhuma aberta. Perfil falso se resolve verificando o rosto. O humano só confirma banimentos, sem urgência, porque quem tem evidência grave já está escondido.
7. **Verificação por selfie:** revisão humana pelo painel do suporte (`apps/admin`). A automação com AWS Rekognition (desafio de rosto + comparação, migrations 0013/0015) está pronta e desligada até existir conta na AWS. A prova de vida em vídeo (Face Liveness) fica para depois.
8. **Compromisso:** o cadastro exige aceitar as regras da comunidade (4º consentimento, migration 0012).

## Consequências

- A verificação passa a ser o funil principal: o app precisa empurrar para ela, e o suporte precisa revisar as selfies rápido (meta de até 24h). Depois dá para trocar a revisão manual por detecção automática de vivacidade, como AWS Rekognition Face Liveness, sem mudar as regras.
- **LGPD:** a Política de Privacidade precisa dizer que a selfie de verificação é dado biométrico, usado só para confirmar identidade. Também precisa dizer que, em caso de denúncia, a equipe de segurança acessa a conversa entre as duas pessoas envolvidas.
- O filtro de palavras tem falso positivo e falso negativo; ele é a primeira barreira, não a única. A denúncia e a revisão humana continuam sendo o mecanismo principal.
