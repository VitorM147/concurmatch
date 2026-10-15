import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeGoalType, emptyStudyGoal, studyGoalFromProfile, cleanStudyGoal,
  studyGoalSummary, goalStatusLabels } from '../src/lib/studyGoals.ts';

test('trocar o objetivo remove campos do caminho anterior e o principal dos adicionais', () => {
  const changed = changeGoalType({ ...emptyStudyGoal, area_id: 1, competition_id: 2,
    secondary_goals: ['vestibular', 'militar'] }, 'vestibular');
  assert.equal(changed.area_id, null);
  assert.equal(changed.competition_id, null);
  assert.deepEqual(changed.secondary_goals, ['militar']);
});

test('edição extrai somente campos do objetivo, sem enviar identidade ou privilégios', () => {
  const goal = studyGoalFromProfile({ id: 'user', verified: true, birthdate: '2000-01-01', goal_type: 'militar' });
  assert.equal(goal.goal_type, 'militar');
  for (const privateField of ['id', 'verified', 'birthdate']) assert.ok(!(privateField in goal));
});

test('detalhes vazios são enviados como null e espaços são removidos', () => {
  const goal = cleanStudyGoal({ ...emptyStudyGoal, desired_institution: ' USP ', goal_detail: '   ' });
  assert.equal(goal.desired_institution, 'USP');
  assert.equal(goal.goal_detail, null);
});

test('cards representam ENEM, curso desejado e perfis antigos', () => {
  assert.equal(studyGoalSummary({ goal_type: 'vestibular', goal_exam: 'ENEM', desired_course: 'Medicina' }),
    'ENEM · Quero cursar Medicina');
  assert.equal(studyGoalSummary({ competition: 'Agente' }), 'Agente');
  assert.equal(studyGoalSummary({ goal_type: 'militar' }), 'Carreira militar');
  assert.equal(goalStatusLabels('vestibular').nomeado, 'Matriculado(a)');
  assert.equal(goalStatusLabels('concurso').nomeado, 'Nomeado(a)');
});
