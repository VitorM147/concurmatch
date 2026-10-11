// Marca e textos centralizados — trocar o nome do app é editar este arquivo + app.json.
export const brand = {
  name: 'ConMatch',
  tagline: 'Sua jornada aproxima pessoas.',
  matchTitle: 'Deu ConMatch!',
  matchSubtitle: 'Vocês querem se conhecer.',
  matchCta: 'Que tal começar a conversa?',
  likeLimitTitle: 'Suas 20 curtidas de hoje acabaram',
  likeLimitBody: 'Elas renovam à meia-noite. Com o Premium você curte sem limite e vê quem curtiu você.',
  premiumPrice: 'R$ 24,90/mês',
  emptyDeck: 'Você zerou o edital por hoje! Volte mais tarde ou aumente sua distância.',
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
