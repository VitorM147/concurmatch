-- =====================================================================
-- Dados iniciais: configuração, pesos e catálogo de concursos
-- =====================================================================

insert into public.app_config (key, value, description) values
  ('free_likes_per_day',      '20', 'Curtidas diárias no plano gratuito (renova à meia-noite de Brasília)'),
  ('messages_per_minute',     '30', 'Anti-spam: mensagens por minuto por usuário'),
  ('auto_hide_after_reports', '3',  'Denunciantes distintos para ocultar perfil até revisão humana'),
  ('discovery_active_days',   '30', 'Só mostra perfis ativos nos últimos N dias'),
  ('premium_price_brl',       '24.90', 'Preço de referência do Premium (o valor cobrado vem da loja)')
on conflict (key) do update set value = excluded.value;

-- Pesos do Compatibility Engine (somam 100, mas não precisam)
insert into public.matching_weights (factor, weight, description) values
  ('mesmo_concurso', 30, 'Mesmo concurso/cargo'),
  ('mesma_area',     20, 'Mesma área de carreira'),
  ('proximidade',    20, 'Quanto mais perto, maior (dentro do raio)'),
  ('mesmo_periodo',  10, 'Estudam no mesmo período do dia'),
  ('fase_parecida',  10, 'Estágios próximos da jornada (iniciante, pós-edital, aprovado...)'),
  ('lotacao',        10, 'Mesmo destino de lotação ou um está onde o outro quer ir')
on conflict (factor) do update set weight = excluded.weight;

insert into public.career_areas (slug, name) values
  ('policial',      'Policial / Segurança Pública'),
  ('tribunais',     'Tribunais'),
  ('fiscal',        'Fiscal'),
  ('controle',      'Controle'),
  ('bancaria',      'Bancária'),
  ('administrativa','Administrativa'),
  ('juridica',      'Jurídica (carreiras)'),
  ('saude',         'Saúde'),
  ('educacao',      'Educação'),
  ('militar',       'Militar'),
  ('legislativo',   'Legislativo'),
  ('outra',         'Outra')
on conflict (slug) do nothing;

insert into public.competitions (area_id, organization, name)
select a.id, v.org, v.name from (values
  ('policial', 'Polícia Federal', 'Agente'),
  ('policial', 'Polícia Federal', 'Escrivão'),
  ('policial', 'Polícia Federal', 'Delegado'),
  ('policial', 'PRF', 'Policial Rodoviário Federal'),
  ('policial', 'Polícia Civil', 'Investigador / Agente'),
  ('policial', 'Polícia Civil', 'Delegado'),
  ('policial', 'Polícia Militar', 'Soldado'),
  ('policial', 'Polícia Militar', 'Oficial'),
  ('policial', 'Polícia Penal', 'Policial Penal'),
  ('tribunais', 'Tribunais (TRF/TRT/TRE/TJ)', 'Técnico Judiciário'),
  ('tribunais', 'Tribunais (TRF/TRT/TRE/TJ)', 'Analista Judiciário'),
  ('fiscal', 'Receita Federal', 'Auditor Fiscal'),
  ('fiscal', 'Receita Federal', 'Analista Tributário'),
  ('fiscal', 'SEFAZ (estaduais)', 'Auditor Fiscal'),
  ('fiscal', 'Prefeituras', 'Auditor / Fiscal de Tributos'),
  ('controle', 'TCU', 'Auditor Federal de Controle Externo'),
  ('controle', 'CGU', 'Auditor Federal de Finanças e Controle'),
  ('controle', 'TCEs / TCMs', 'Auditor de Controle Externo'),
  ('bancaria', 'Banco do Brasil', 'Escriturário'),
  ('bancaria', 'Caixa Econômica Federal', 'Técnico Bancário'),
  ('bancaria', 'Banco Central', 'Analista'),
  ('administrativa', 'INSS', 'Técnico do Seguro Social'),
  ('administrativa', 'Concurso Nacional Unificado (CNU)', 'Diversos cargos'),
  ('administrativa', 'Prefeituras e Estados', 'Assistente / Técnico Administrativo'),
  ('juridica', 'Magistratura', 'Juiz'),
  ('juridica', 'Ministério Público', 'Promotor / Procurador'),
  ('juridica', 'Defensoria Pública', 'Defensor'),
  ('juridica', 'AGU / PGE / PGM', 'Advogado Público / Procurador'),
  ('saude', 'EBSERH / Secretarias de Saúde', 'Profissional de Saúde'),
  ('educacao', 'Redes de Ensino', 'Professor'),
  ('militar', 'Forças Armadas', 'Escolas Militares (EsPCEx, EsSA, EEAR...)'),
  ('legislativo', 'Câmara / Senado / Assembleias', 'Analista / Técnico Legislativo')
) as v(slug, org, name)
join public.career_areas a on a.slug = v.slug
on conflict (organization, name) do nothing;
