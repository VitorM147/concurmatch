export type GoalType = 'concurso' | 'vestibular' | 'militar' | 'oab_residencia';

export interface StudyGoalInput {
  goal_type: GoalType;
  area_id: number | null;
  competition_id: number | null;
  goal_exam_id: number | null;
  desired_course_id: number | null;
  desired_institution: string | null;
  goal_detail: string | null;
  secondary_goals: GoalType[];
}

export const goalLabels: Record<GoalType, string> = {
  concurso: 'Concurso público', vestibular: 'Vestibular / ENEM',
  militar: 'Carreira militar', oab_residencia: 'OAB / Residência',
};

export const emptyStudyGoal: StudyGoalInput = {
  goal_type: 'concurso', area_id: null, competition_id: null, goal_exam_id: null,
  desired_course_id: null, desired_institution: null, goal_detail: null, secondary_goals: [],
};

export function changeGoalType(value: StudyGoalInput, goal_type: GoalType): StudyGoalInput {
  return { ...value, goal_type, area_id: null, competition_id: null, goal_exam_id: null,
    desired_course_id: null, desired_institution: null, goal_detail: null,
    secondary_goals: value.secondary_goals.filter((g) => g !== goal_type) };
}

export function studyGoalFromProfile(p: Partial<StudyGoalInput>): StudyGoalInput {
  return { goal_type: p.goal_type ?? 'concurso', area_id: p.area_id ?? null,
    competition_id: p.competition_id ?? null, goal_exam_id: p.goal_exam_id ?? null,
    desired_course_id: p.desired_course_id ?? null, desired_institution: p.desired_institution ?? null,
    goal_detail: p.goal_detail ?? null,
    secondary_goals: p.secondary_goals ?? [] };
}

export function cleanStudyGoal(value: StudyGoalInput): StudyGoalInput {
  const clean = (text: string | null) => text?.trim() || null;
  return { ...value, desired_institution: clean(value.desired_institution), goal_detail: clean(value.goal_detail) };
}

export function goalStatusLabels(goal: GoalType): Record<string, string> {
  const common = { comecando: 'Começando', estudando: 'Estudando', pos_edital: 'Reta final',
    inscrito: 'Inscrito(a)', fez_prova: 'Aguardando resultado', aprovado: 'Aprovado(a)' };
  if (goal === 'concurso') return { ...common, pos_edital: 'Pós-edital',
    aguardando_nomeacao: 'Aguardando nomeação', nomeado: 'Nomeado(a)' };
  return { ...common, aguardando_nomeacao: 'Aguardando convocação',
    nomeado: goal === 'vestibular' ? 'Matriculado(a)' : 'Convocado(a)' };
}

export function studyGoalSummary(p: {
  goal_type?: GoalType; competition?: string | null; area?: string | null;
  goal_exam?: string | null; desired_course?: string | null;
}): string {
  const goal = p.goal_type ?? 'concurso';
  const exam = p.goal_exam ?? p.competition;
  if (goal === 'vestibular') return [exam ?? 'Vestibular / ENEM',
    p.desired_course ? `Quero cursar ${p.desired_course}` : null].filter(Boolean).join(' · ');
  return exam ?? p.area ?? goalLabels[goal];
}
