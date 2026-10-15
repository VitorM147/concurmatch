import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, ChipGroup, Field, H1, Screen } from '@/components/ui';
import { StudyGoalFields } from '@/components/StudyGoalFields';
import { cleanStudyGoal, emptyStudyGoal, goalStatusLabels, studyGoalFromProfile } from '@/lib/studyGoals';
import { api, type ModerationStatus, type StudyStatus } from '@/lib/api';
import { pickAndUploadPhoto, useSignedUrls } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { brand, interestLabels, MAX_INTERESTS } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const DISTANCES = [10, 25, 50, 100, 300].map((d) => ({ value: d, label: `${d} km` }));
const AGES = [
  { value: '18-25', label: '18–25' }, { value: '22-30', label: '22–30' }, { value: '25-35', label: '25–35' },
  { value: '30-45', label: '30–45' }, { value: '35-60', label: '35–60' }, { value: '18-60', label: 'Qualquer' },
];

export default function Perfil() {
  const c = useColors();
  const router = useRouter();
  const { profile, refreshProfile, session } = useSession();
  const [photos, setPhotos] = useState<{ storage_path: string; position: number; approved: boolean; auto_checked_at: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const urls = useSignedUrls(photos.map((p) => p.storage_path));
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [goal, setGoal] = useState(emptyStudyGoal);
  const [savingGoal, setSavingGoal] = useState(false);
  useEffect(() => { setBio(profile?.bio ?? ''); }, [profile?.bio]);
  useEffect(() => { if (profile) setGoal(studyGoalFromProfile(profile)); }, [profile]);

  const [mod, setMod] = useState<ModerationStatus | null>(null);
  const loadPhotos = useCallback(() => { api.myPhotos().then(setPhotos).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => {
    loadPhotos();
    api.moderationStatus().then(setMod).catch(() => {});
  }, [loadPhotos]));

  if (!profile) return <Screen />;

  const save = async (patch: Parameters<typeof api.updateProfile>[0]) => {
    try { await api.updateProfile(patch); await refreshProfile(); }
    catch (e: any) { Alert.alert('Ops', e.message); }
  };

  const setPhoto = async (position: number) => {
    if (!session) return;
    setBusy(true);
    try { await pickAndUploadPhoto(session.user.id, position); loadPhotos(); await refreshProfile(); }
    catch { Alert.alert('Falha no envio', 'Tente outra foto.'); }
    finally { setBusy(false); }
  };

  const deleteAccount = () => Alert.alert(
    'Excluir conta',
    'Seu perfil será ocultado agora. O servidor removerá seus arquivos e concluirá a exclusão da conta. Não dá para desfazer.',
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir tudo', style: 'destructive', onPress: async () => {
        try { await api.deleteAccount(); await supabase.auth.signOut({ scope: 'local' });
          Alert.alert('Exclusão solicitada', 'Seu perfil foi ocultado. O servidor concluirá a remoção dos arquivos e da conta.'); }
        catch (e: any) { Alert.alert('Ops', e.message); }
      } },
    ],
  );

  // LGPD art. 18 — portabilidade: o titular recebe uma cópia dos próprios dados
  const exportData = async () => {
    try {
      const data = await api.exportMyData();
      await Share.share({ title: 'Meus dados', message: JSON.stringify(data, null, 2) });
    } catch (e: any) { Alert.alert('Ops', e.message); }
  };

  const saveGoal = async () => {
    if ([goal.desired_institution, goal.goal_detail].some((s) => s?.trim() && s.trim().length < 2)) {
      return Alert.alert('Confira seu objetivo', 'Use pelo menos 2 caracteres nos detalhes ou deixe o campo vazio.');
    }
    setSavingGoal(true);
    try { await api.updateProfile(cleanStudyGoal(goal)); await refreshProfile(); }
    catch (e: any) { Alert.alert('Não foi possível salvar', e.message); }
    finally { setSavingGoal(false); }
  };

  const ageKey = `${profile.age_min}-${profile.age_max}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <H1>{profile.display_name}{profile.verified ? ' ✓' : ''}</H1>

        {mod?.under_review ? (
          <Pressable onPress={() => router.push('/analise')} accessibilityRole="button"
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.danger }]}>
            <Text style={[font.bodyBold, { color: c.danger }]}>Seu perfil está em análise</Text>
            <Text style={[font.small, { color: c.textMuted }]}>Toque para ver o que aconteceu e mandar sua explicação.</Text>
          </Pressable>
        ) : null}

        {!profile.verified ? (
          <Pressable onPress={() => router.push('/verificacao')} accessibilityRole="button"
            style={[styles.card, { backgroundColor: c.primary, borderColor: c.primary }]}>
            <Text style={[font.bodyBold, { color: c.onPrimary }]}>
              {mod?.verification?.status === 'pendente' ? 'Selfie em análise' : 'Verifique seu perfil'}
            </Text>
            <Text style={[font.small, { color: c.onPrimary, opacity: 0.85 }]}>
              {mod?.verification?.status === 'pendente'
                ? 'Logo você poderá mandar mensagens e conversar.'
                : 'Sem verificação você só curte e passa, até 10 por dia. Verificado tem 50, manda mensagem, conversa e pode assinar o Premium.'}
            </Text>
          </Pressable>
        ) : null}

        {/* Fotos (até 6) */}
        <Text style={[font.small, { color: c.textMuted }]}>Fotos novas passam por análise. Ao trocar uma foto, será necessário verificar o perfil novamente.</Text>
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, pos) => {
            const p = photos.find((x) => x.position === pos);
            return (
              <Pressable key={pos} onPress={() => setPhoto(pos)} disabled={busy}
                accessibilityLabel={p ? `Trocar foto ${pos + 1}` : `Adicionar foto ${pos + 1}`}
                style={[styles.slot, { backgroundColor: c.surface, borderColor: c.border }]}>
                {p && urls[p.storage_path]
                  ? <Image source={{ uri: urls[p.storage_path] }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : <Text style={[font.h2, { color: c.textMuted }]}>+</Text>}
                {p ? <Text style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                  backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, padding: 4 }}>
                  {p.approved ? 'Aprovada' : p.auto_checked_at ? 'Recusada — trocar' : 'Em análise'}
                </Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Section title="Sobre mim">
          <Field label="Conte um pouco sobre você" value={bio} onChangeText={setBio} multiline maxLength={500}
            style={{ height: 110, paddingTop: 12, textAlignVertical: 'top' }}
            hint={`${bio.length}/500 · salva quando você sai do campo`}
            onBlur={() => { if ((profile.bio ?? '') !== bio.trim()) save({ bio: bio.trim() || null }); }} />
        </Section>

        <Section title={`Meus interesses (${(profile.interests ?? []).length}/${MAX_INTERESTS})`}>
          <ChipGroup multi
            options={Object.entries(interestLabels).map(([value, label]) => ({ value, label }))}
            value={profile.interests ?? []}
            onChange={(v: string[]) => {
              if (v.length > MAX_INTERESTS) return Alert.alert('Limite de interesses', `Escolha até ${MAX_INTERESTS}.`);
              save({ interests: v });
            }} />
        </Section>

        <Section title="Meu objetivo">
          <StudyGoalFields value={goal} onChange={setGoal} secondary />
          <Button title="Salvar objetivo" onPress={saveGoal} loading={savingGoal} />
        </Section>

        <Section title="Fase atual">
          <ChipGroup options={Object.entries(goalStatusLabels(profile.goal_type ?? 'concurso')).map(([value, label]) => ({ value, label }))}
            value={profile.status} onChange={(v: StudyStatus) => save({ status: v })} />
        </Section>

        <Section title="Distância máxima">
          <ChipGroup options={DISTANCES} value={profile.max_distance_km ?? 50}
            onChange={(v: number) => save({ max_distance_km: v })} />
        </Section>

        <Section title="Faixa de idade">
          <ChipGroup options={AGES} value={ageKey} onChange={(v: string) => {
            const [min, max] = v.split('-').map(Number);
            save({ age_min: min, age_max: max });
          }} />
        </Section>

        <View style={styles.row}>
          <Text style={[font.body, { color: c.text, flex: 1 }]}>Aparecer no Descobrir</Text>
          <Switch value={profile.is_visible} onValueChange={(v) => save({ is_visible: v })}
            accessibilityLabel="Aparecer no Descobrir" />
        </View>

        <View style={{ gap: space.md }}>
          <Button title={`Premium — ${brand.premiumActions} ações por dia`} onPress={() => router.push('/premium')} />
          <Button title="Central de segurança" variant="ghost" onPress={() => router.push('/seguranca')} />
          <Button title="Baixar meus dados" variant="ghost" onPress={exportData} />
          <Button title="Sair" variant="ghost" onPress={() => supabase.auth.signOut()} />
          <Button title="Excluir minha conta" variant="ghost" onPress={deleteAccount}
            style={{ borderColor: c.danger }} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[font.label, { color: c.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: {
    width: '31.5%', aspectRatio: 3 / 4, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { borderRadius: radius.md, borderWidth: 1, padding: space.lg, gap: space.xs },
});
