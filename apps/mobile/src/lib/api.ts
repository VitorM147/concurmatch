// Camada de acesso ao backend. Telas nunca chamam o Supabase direto:
// se um dia trocarmos por uma API própria (BFF), só este arquivo muda.
import { supabase } from './supabase';
import type { GoalType } from './studyGoals';

export interface GoalCatalog {
  exams: { id: number; name: string; goal_type: GoalType }[];
  courses: { id: number; name: string }[];
}

export type Gender = 'mulher' | 'homem' | 'nao_binario';
export type StudyStatus =
  | 'comecando' | 'estudando' | 'pos_edital' | 'inscrito'
  | 'fez_prova' | 'aprovado' | 'aguardando_nomeacao' | 'nomeado';
export type StudyPeriod = 'manha' | 'tarde' | 'noite' | 'madrugada' | 'variado';

export interface Candidate {
  id: string;
  display_name: string;
  age: number;
  city: string;
  state: string;
  bio: string | null;
  verified: boolean;
  competition: string | null;
  area: string | null;
  status: StudyStatus;
  study_period: StudyPeriod | null;
  distance_label: string | null;
  lotacao_label: string | null;
  score: number;
  reasons: string[];
  photos: string[];
  interests: string[];
  /** Recado que essa pessoa mandou junto da curtida (só quem recebeu vê) */
  message_to_me: string | null;
  goal_type: GoalType;
  goal_exam: string | null;
  desired_course: string | null;
  desired_institution: string | null;
  goal_detail: string | null;
  secondary_goals: GoalType[];
}

export interface MatchRow {
  match_id: string;
  matched_at: string;
  other_id: string;
  display_name: string;
  age: number;
  city: string;
  state: string;
  competition: string | null;
  photo: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender: string | null;
  unread: number;
}

export interface Message {
  id: number;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface LikeResult {
  matched: boolean;
  match_id: string | null;
  remaining: number | null;
  duplicate?: boolean;
}

export interface Limits {
  premium: boolean;
  verified: boolean;
  /** Ações do dia = curtir + passar */
  actions_max: number;
  actions_left: number;
  /** Curtidas com mensagem (só verificados) */
  messages_max: number;
  messages_left: number;
}

export type VerificationStatus = 'aguardando_selfie' | 'pendente' | 'aprovada' | 'recusada';

export interface ModerationStatus {
  verified: boolean;
  verification: { status: VerificationStatus; gesture: string; note: string | null } | null;
  under_review: boolean;
  under_review_since: string | null;
  appeal: { status: 'aberto' | 'aceito' | 'recusado'; at: string } | null;
}

export interface ProfileInput {
  goal_type?: GoalType;
  goal_exam_id?: number | null;
  desired_course_id?: number | null;
  desired_institution?: string | null;
  goal_detail?: string | null;
  secondary_goals?: GoalType[];
  display_name: string;
  birthdate: string; // YYYY-MM-DD
  gender: Gender;
  interested_in: Gender[];
  bio?: string | null;
  state: string;
  city: string;
  lat_approx?: number | null;
  lng_approx?: number | null;
  target_state?: string | null;
  target_city?: string | null;
  area_id?: number | null;
  competition_id?: number | null;
  status: StudyStatus;
  study_period?: StudyPeriod | null;
  age_min?: number;
  age_max?: number;
  max_distance_km?: number;
  interests?: string[];
}

export type Profile = ProfileInput & { id: string; verified: boolean; is_visible: boolean; banned_at: string | null };

// Erros do banco → mensagens para o usuário
const friendly: Record<string, string> = {
  INVALID_GOAL_EXAM: 'Escolha uma prova correspondente ao seu objetivo.',
  INVALID_GOAL_CAREER: 'Confira a área e a seleção do seu objetivo.',
  INVALID_SECONDARY_GOALS: 'Escolha objetivos adicionais diferentes do principal, sem repetir.',
  GOAL_TEXT_NOT_ALLOWED: 'Descreva seu objetivo sem links, telefone ou oferta de serviços.',
  ACCOUNT_DELETION_PENDING: 'Sua exclusão está em processamento. O perfil já foi ocultado.',
  PHOTO_PATH_RETIRED: 'Envie a foto novamente para gerar um arquivo novo.',
  ACTION_LIMIT_REACHED: 'ACTION_LIMIT_REACHED',
  VERIFICATION_REQUIRED: 'Verifique seu perfil para mandar mensagens e conversar.',
  TARGET_NOT_VERIFIED: 'Essa pessoa ainda não verificou o perfil e não recebe mensagens. Você pode curtir normalmente.',
  OTHER_NOT_VERIFIED: 'A conversa abre quando a outra pessoa verificar o perfil.',
  BIO_NOT_ALLOWED: 'A bio não pode ter telefone, link, e-mail nem oferta de serviço ou cobrança.',
  ALREADY_VERIFIED: 'Seu perfil já está verificado.',
  PHOTO_REQUIRED: 'Adicione uma foto do rosto no perfil antes de verificar.',
  NO_VERIFICATION_CHALLENGE: 'Comece a verificação de novo para receber o gesto.',
  SELFIE_NOT_FOUND: 'Não encontramos a selfie enviada. Tire a foto de novo.',
  SELFIE_TOO_OLD: 'A selfie precisa ser tirada agora, depois de ver o pedido.',
  NOT_UNDER_REVIEW: 'Seu perfil não está em análise.',
  APPEAL_ALREADY_OPEN: 'Você já enviou sua explicação. Nossa equipe vai analisar.',
  RATE_LIMITED: 'Calma! Muitas ações em pouco tempo. Tente de novo em instantes.',
  ACCOUNT_BANNED: 'Sua conta está suspensa. Fale com o suporte.',
  TARGET_UNAVAILABLE: 'Esse perfil não está mais disponível.',
  MATCH_INACTIVE: 'Essa conversa foi encerrada.',
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  PROFILE_REQUIRED: 'Complete seu perfil para continuar.',
  CONSENT_REQUIRED: 'Aceite os termos e a política de privacidade para continuar.',
  ACCOUNT_UNDER_REVIEW: 'Sua conta está em revisão pela nossa equipe de segurança.',
  INVALID_MATCH: 'Não foi possível vincular essa conversa à denúncia.',
  MESSAGE_TOO_LONG: 'A mensagem pode ter no máximo 100 caracteres.',
  MESSAGE_NOT_ALLOWED: 'Mensagem não permitida: sem links, e-mails, @perfis, telefone, Pix, cobrança ou oferta de serviço.',
  MESSAGE_LIKE_LIMIT: 'Você já usou as curtidas com mensagem de hoje. Elas renovam à meia-noite.',
  profiles_interests_valid: 'Escolha até 10 interesses da lista.',
};

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function fail(error: { message: string } | null): never {
  const raw = error?.message ?? 'Erro inesperado';
  const code = Object.keys(friendly).find((k) => raw.includes(k)) ?? 'UNKNOWN';
  throw new ApiError(code, friendly[code] ?? 'Algo deu errado. Tente novamente.');
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

export const api = {
  // ---- Catálogo
  async goalCatalog(): Promise<GoalCatalog> {
    const [exams, courses] = await Promise.all([
      supabase.from('goal_exams').select('id, name, goal_type').order('id'),
      supabase.from('study_courses').select('id, name').order('id'),
    ]);
    if (exams.error) fail(exams.error);
    if (courses.error) fail(courses.error);
    return { exams: exams.data as GoalCatalog['exams'], courses: courses.data as GoalCatalog['courses'] };
  },
  async areas() {
    const { data, error } = await supabase.from('career_areas').select('id, name, slug').order('name');
    if (error) fail(error);
    return data as { id: number; name: string; slug: string }[];
  },
  async competitions(areaId: number) {
    const { data, error } = await supabase
      .from('competitions').select('id, organization, name').eq('area_id', areaId).order('organization');
    if (error) fail(error);
    return data as { id: number; organization: string; name: string }[];
  },

  // ---- Perfil
  async myProfile(knownUserId?: string): Promise<Profile | null> {
    const auth = knownUserId ? null : await supabase.auth.getUser();
    if (auth?.error) fail(auth.error);
    const uid = knownUserId ?? auth?.data.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  },
  async createProfile(input: ProfileInput, consents: string[], termsVersion: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new ApiError('NOT_AUTHENTICATED', friendly.NOT_AUTHENTICATED);
    const c = await supabase.from('consents')
      .upsert(consents.map((kind) => ({ user_id: user.id, kind, version: termsVersion })),
        { onConflict: 'user_id,kind,version', ignoreDuplicates: true });
    if (c.error) fail(c.error);
    const { error } = await supabase.from('profiles').insert({ id: user.id, ...input });
    if (error) fail(error);
  },
  async updateProfile(patch: Partial<Omit<ProfileInput, 'birthdate' | 'gender'>> & { is_visible?: boolean }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new ApiError('NOT_AUTHENTICATED', friendly.NOT_AUTHENTICATED);
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (error) fail(error);
  },
  async myPhotos() {
    const { data, error } = await supabase.from('photos').select('id, storage_path, position, approved, auto_checked_at').order('position');
    if (error) fail(error);
    return data as { id: string; storage_path: string; position: number; approved: boolean; auto_checked_at: string | null }[];
  },

  // ---- Discovery / swipe
  discover: (limit = 20) => call<Candidate[]>('discover', { p_limit: limit }),
  /** Cotas do dia: ações (curtir + passar) e curtidas com mensagem */
  myLimits: () => call<Limits>('my_limits'),
  like: (target: string, message?: string) => call<LikeResult>('swipe_like', {
    p_target: target,
    p_message: message?.trim() ? message.trim().slice(0, 100) : null,
  }),
  pass: (target: string) => call<void>('swipe_pass', { p_target: target }),

  // ---- Matches / chat
  matches: () => call<MatchRow[]>('my_matches'),
  unmatch: (matchId: string) => call<void>('unmatch', { p_match: matchId }),
  markRead: (matchId: string) => call<void>('mark_read', { p_match: matchId }),
  async messages(matchId: string, beforeId?: number) {
    let q = supabase.from('messages').select('*').eq('match_id', matchId).order('id', { ascending: false }).limit(50);
    if (beforeId) q = q.lt('id', beforeId);
    const { data, error } = await q;
    if (error) fail(error);
    return (data as Message[]).reverse();
  },
  async send(matchId: string, senderId: string, body: string) {
    const { data, error } = await supabase.from('messages')
      .insert({ match_id: matchId, sender_id: senderId, body }).select().single();
    if (error) fail(error);
    return data as Message;
  },
  async messagesSince(matchId: string, afterId: number) {
    const { data, error } = await supabase.from('messages').select('*').eq('match_id', matchId)
      .gt('id', afterId).order('id', { ascending: true }).limit(100);
    if (error) fail(error);
    return data as Message[];
  },
  subscribeMessages(matchId: string, onMessage: (m: Message) => void, onConnected?: () => void) {
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => { if ('id' in payload.new) onMessage(payload.new as Message); })
      .subscribe((status) => { if (status === 'SUBSCRIBED') onConnected?.(); });
    return () => { supabase.removeChannel(channel); };
  },

  // ---- Verificação e moderação
  moderationStatus: () => call<ModerationStatus>('my_moderation_status'),
  verificationChallenge: () => call<{ id: number; gesture: string; status: VerificationStatus }>('verification_challenge'),
  submitVerification: (selfiePath: string) => call<{ status: VerificationStatus }>('submit_verification', { p_selfie_path: selfiePath }),
  submitAppeal: (message: string) => call<void>('submit_appeal', { p_message: message.trim() }),

  // ---- Segurança / LGPD
  block: (target: string) => call<void>('block_user', { p_target: target }),
  report: (target: string, reason: string, details?: string, matchId?: string) =>
    call<string>('report_user', { p_target: target, p_reason: reason, p_details: details ?? null, p_match: matchId ?? null }),
  exportMyData: () => call<Record<string, unknown>>('export_my_data'),
  async deleteAccount() {
    await call<void>('request_account_deletion');
  },
};
