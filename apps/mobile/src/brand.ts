// Marca e textos centralizados — trocar o nome do app é editar este arquivo + app.json.
export const brand = {
  name: 'ConMatch',
  tagline: 'Pessoas que constroem mais juntas.',
  matchTitle: 'Deu ConMatch!',
  matchSubtitle: 'Vocês querem se conhecer.',
  matchCta: 'Ambições parecidas. Agora é com vocês.',
  matchSend: 'Enviar mensagem',
  matchContinue: 'Continuar explorando',
  starTitle: 'Curtir com mensagem',
  starHint: 'Ela chega junto com a curtida. Se der match, vira a primeira mensagem da conversa.',
  starPlaceholder: 'Ex.: Também estudo de madrugada. Qual matéria mais te pega?',
  starMax: 100,
  actionLimitTitle: (max: number) => `Suas ${max} ações de hoje acabaram`,
  actionLimitBody: 'Curtir e passar contam como ação. Elas renovam à meia-noite. Com o Premium são 250 por dia.',
  actionLimitBodyPremium: 'Curtir e passar contam como ação. Elas renovam à meia-noite.',
  actionLimitBodyUnverified: 'Sem verificação são só 10 por dia. Verifique seu perfil e passe para 50, além de mandar mensagens e conversar.',
  verifyTitle: 'Mostre que é você',
  verifyPitch: 'Perfil verificado manda e recebe curtida com mensagem, conversa depois do match e pode assinar o Premium. Sem verificação, você só curte e passa, até 10 por dia.',
  unverifiedActions: 10,
  freeActions: 50,
  premiumActions: 250,
  freeMessages: 5,
  premiumMessages: 100,
  premiumPrice: 'R$ 24,90/mês',
  emptyDeck: 'Você viu todo mundo por hoje. Volte mais tarde ou aumente sua distância.',
  termsVersion: '2026-10',
};

export const statusLabels: Record<string, string> = {
  comecando: 'Começando',
  estudando: 'Estudando',
  pos_edital: 'Pós-edital',
  inscrito: 'Inscrito',
  fez_prova: 'Fez a prova',
  aprovado: 'Aprovado(a)',
  aguardando_nomeacao: 'Aguardando nomeação',
  nomeado: 'Nomeado(a)',
};

export const periodLabels: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  madrugada: 'Madrugada',
  variado: 'Variado',
};

export const genderLabels: Record<string, string> = {
  mulher: 'Mulher',
  homem: 'Homem',
  nao_binario: 'Não binário',
};

export const reportReasons: { value: string; label: string }[] = [
  { value: 'perfil_falso', label: 'Perfil falso' },
  { value: 'menor_de_idade', label: 'Parece menor de idade' },
  { value: 'assedio', label: 'Assédio ou ameaça' },
  { value: 'conteudo_sexual', label: 'Conteúdo sexual não solicitado' },
  { value: 'servico_sexual_ou_cobranca', label: 'Oferece programa ou cobra dinheiro' },
  { value: 'spam_golpe', label: 'Spam ou golpe' },
  { value: 'discurso_de_odio', label: 'Discurso de ódio' },
  { value: 'outro', label: 'Outro motivo' },
];

// Os 8 estados de lançamento aparecem primeiro na lista
export const launchStates = ['DF', 'SP', 'RJ', 'MG', 'BA', 'PE', 'CE', 'PR'];
export const allStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];
export const statesOrdered = [...launchStates, ...allStates.filter((s) => !launchStates.includes(s))];

// Catálogo de interesses — os mesmos slugs de public.interest_catalog() (migration 0007)
export const interestLabels: Record<string, string> = {
  cafe: 'Café', academia: 'Academia', corrida: 'Corrida', leitura: 'Leitura', series: 'Séries',
  filmes: 'Filmes', musica: 'Música', viagens: 'Viagens', culinaria: 'Gastronomia', pets: 'Pets',
  trilhas: 'Trilhas', games: 'Games', praia: 'Praia', idiomas: 'Idiomas', danca: 'Dança', arte: 'Arte',
  tecnologia: 'Tecnologia', futebol: 'Futebol', yoga: 'Yoga', fotografia: 'Fotografia', vinho: 'Vinho',
  podcasts: 'Podcasts', meditacao: 'Meditação', pedal: 'Pedal', teatro: 'Teatro', shows: 'Shows',
  cozinhar: 'Cozinhar', natureza: 'Natureza', voluntariado: 'Voluntariado', xadrez: 'Xadrez',
};
export const MAX_INTERESTS = 10;

// "Sugestões para conversar" no chat vazio
export const chatSuggestions = [
  'Qual matéria você mais gosta de estudar?',
  'Como é sua rotina de estudos?',
  'O que você faz pra descansar a cabeça?',
  'Qual vai ser a primeira coisa que você faz depois da aprovação?',
];
