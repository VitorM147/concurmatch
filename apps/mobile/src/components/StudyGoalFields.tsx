import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChipGroup, Field, P } from '@/components/ui';
import { api, type GoalCatalog } from '@/lib/api';
import { changeGoalType, goalLabels, type GoalType, type StudyGoalInput } from '@/lib/studyGoals';
import { font, space, useColors } from '@/theme';

export function StudyGoalFields({ value, onChange, secondary = false }: {
  value: StudyGoalInput; onChange: (value: StudyGoalInput) => void; secondary?: boolean;
}) {
  const c = useColors();
  const [catalog, setCatalog] = useState<GoalCatalog | null>(null);
  const [areas, setAreas] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [competitions, setCompetitions] = useState<{ id: number; name: string; organization: string }[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const patch = (p: Partial<StudyGoalInput>) => onChange({ ...value, ...p });

  useEffect(() => {
    let alive = true;
    setError(false);
    Promise.all([api.goalCatalog(), api.areas()]).then(([g, a]) => {
      if (alive) { setCatalog(g); setAreas(a); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    let alive = true;
    setCompetitions([]);
    if (value.goal_type === 'concurso' && value.area_id) {
      api.competitions(value.area_id).then((rows) => { if (alive) setCompetitions(rows); })
        .catch(() => { if (alive) setError(true); });
    }
    return () => { alive = false; };
  }, [value.goal_type, value.area_id, attempt]);

  const label = (text: string) => <Text style={[font.label, { color: c.textMuted }]}>{text}</Text>;
  const undecided = { value: 0, label: 'Ainda decidindo' };
  return (
    <View style={{ gap: space.md }}>
      {label('Qual é seu objetivo neste momento?')}
      <ChipGroup options={Object.entries(goalLabels).map(([key, title]) => ({ value: key, label: title }))}
        value={value.goal_type} onChange={(goal: GoalType) => {
          if (goal !== value.goal_type) onChange(changeGoalType(value, goal));
        }} />
      <P muted>Seu objetivo ajuda a encontrar afinidades. Você também pode conhecer pessoas de outros caminhos.</P>
      {error ? <>
        <P muted>Não conseguimos carregar as opções. Tente novamente ou complete os detalhes depois.</P>
        <Button title="Tentar novamente" variant="ghost" onPress={() => setAttempt((n) => n + 1)} />
      </> : null}
      {value.goal_type === 'concurso' ? <>
        {label('Área (opcional)')}
        <ChipGroup options={[undecided, ...areas.filter((a) => a.slug !== 'militar').map((a) => ({ value: a.id, label: a.name }))]}
          value={value.area_id ?? 0} onChange={(id: number) => patch({ area_id: id || null, competition_id: null })} />
        {competitions.length ? <>
          {label('Concurso / cargo (opcional)')}
          <ChipGroup options={[undecided, ...competitions.map((x) => ({ value: x.id, label: `${x.organization} — ${x.name}` }))]}
            value={value.competition_id ?? 0} onChange={(id: number) => patch({ competition_id: id || null })} />
        </> : null}
      </> : <>
        {label(value.goal_type === 'vestibular' ? 'Prova (opcional)' : 'Seleção / exame (opcional)')}
        <ChipGroup options={[undecided, ...(catalog?.exams ?? []).filter((e) => e.goal_type === value.goal_type)
          .map((e) => ({ value: e.id, label: e.name }))]}
          value={value.goal_exam_id ?? 0} onChange={(id: number) => patch({
            goal_exam_id: id || null, area_id: null, competition_id: null,
          })} />
      </>}
      {value.goal_type === 'vestibular' ? <>
        {label('Curso desejado (opcional)')}
        <ChipGroup options={[undecided, ...(catalog?.courses ?? []).map((x) => ({ value: x.id, label: x.name }))]}
          value={value.desired_course_id ?? 0} onChange={(id: number) => patch({ desired_course_id: id || null })} />
      </> : null}
      <Field label="Instituição desejada (opcional)" value={value.desired_institution ?? ''}
        onChangeText={(text) => patch({ desired_institution: text || null })} maxLength={100}
        hint="Pelo menos 2 caracteres, ou deixe vazio."
        placeholder={value.goal_type === 'vestibular' ? 'Ex.: USP' : 'Ex.: instituição ou órgão desejado'} />
      <Field label={value.goal_type === 'oab_residencia' ? 'Área / especialidade (opcional)' : 'Mais sobre seu objetivo (opcional)'}
        value={value.goal_detail ?? ''} onChangeText={(text) => patch({ goal_detail: text || null })}
        maxLength={100} hint="Pelo menos 2 caracteres, ou deixe vazio."
        placeholder={value.goal_type === 'oab_residencia' ? 'Ex.: Pediatria ou Direito do Trabalho' : 'Ex.: ainda escolhendo meu caminho'} />
      {secondary ? <>
        {label('Também estou me preparando para (opcional)')}
        <ChipGroup multi options={Object.entries(goalLabels).filter(([key]) => key !== value.goal_type)
          .map(([key, title]) => ({ value: key, label: title }))}
          value={value.secondary_goals} onChange={(goals: GoalType[]) => patch({ secondary_goals: goals })} />
      </> : null}
    </View>
  );
}
