// Onboarding em etapas: consentimento → você → onde → concurso → lotação → foto
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ChipGroup, Field, H1, P, Screen } from '@/components/ui';
import { api, ApiError, type Gender, type ProfileInput, type StudyPeriod, type StudyStatus } from '@/lib/api';
import { pickAndUploadPhoto, signedUrls } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { brand, genderLabels, periodLabels, statesOrdered, statusLabels } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const STEPS = 6;
const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));

function parseBirth(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d.getTime()) ? null : iso;
}
function ageOf(iso: string) {
  const b = new Date(iso + 'T12:00:00'), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
const maskDate = (t: string) => t.replace(/\D/g, '').slice(0, 8)
  .replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');

export default function Onboarding() {
  const c = useColors();
  const { profile, refreshProfile } = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // consentimento
  const [terms, setTerms] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  // você
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [interest, setInterest] = useState<Gender[]>([]);
  const [bio, setBio] = useState('');
  // onde
  const [state, setState] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // concurso
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([]);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [comps, setComps] = useState<{ id: number; organization: string; name: string }[]>([]);
  const [compId, setCompId] = useState<number | null>(null);
  const [status, setStatus] = useState<StudyStatus>('estudando');
  const [period, setPeriod] = useState<StudyPeriod | null>(null);
  // lotação
  const [lotacao, setLotacao] = useState(false);
  const [tState, setTState] = useState<string | null>(null);
  const [tCity, setTCity] = useState('');
  // foto
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [profileCreated, setProfileCreated] = useState(false);

  useEffect(() => { api.areas().then(setAreas).catch(() => {}); }, []);
  // Perfil já criado mas sem foto (app fechado no meio): retoma na etapa da foto
  useEffect(() => {
    if (profile) { setProfileCreated(true); setStep(5); }
  }, [profile]);
  useEffect(() => {
    setCompId(null);
    if (areaId) api.competitions(areaId).then(setComps).catch(() => setComps([]));
  }, [areaId]);

  const useMyLocation = async () => {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') return Alert.alert('Sem permissão', 'Tudo bem — você pode digitar sua cidade.');
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      // Arredonda no próprio aparelho (~1 km). O servidor arredonda de novo.
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lng = Math.round(pos.coords.longitude * 100) / 100;
      setCoords({ lat, lng });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo?.city || geo?.subregion) setCity(geo.city ?? geo.subregion ?? '');
    } catch {
      Alert.alert('Não conseguimos sua localização', 'Digite sua cidade.');
    } finally { setBusy(false); }
  };

  const birthIso = parseBirth(birth);
  const valid = [
    terms && sensitive,
    name.trim().length >= 2 && !!birthIso && ageOf(birthIso) >= 18 && !!gender && interest.length > 0,
    !!state && city.trim().length >= 2,
    !!areaId,
    !lotacao || (!!tState && tCity.trim().length >= 2),
    !!photoUrl,
  ];

  const createProfile = async () => {
    const input: ProfileInput = {
      display_name: name.trim(),
      birthdate: birthIso!,
      gender: gender!,
      interested_in: interest,
      bio: bio.trim() || null,
      state: state!,
      city: city.trim(),
      lat_approx: coords?.lat ?? null,
      lng_approx: coords?.lng ?? null,
      target_state: lotacao ? tState : null,
      target_city: lotacao ? tCity.trim() : null,
      area_id: areaId,
      competition_id: compId,
      status,
      study_period: period,
    };
    await api.createProfile(input, ['termos', 'privacidade', 'dados_sensiveis'], brand.termsVersion);
    setProfileCreated(true);
  };

  const next = async () => {
    if (step === 1 && birthIso && ageOf(birthIso) < 18) {
      return Alert.alert('Apenas maiores de 18 anos', 'O app é exclusivo para adultos.');
    }
    if (step === 4) {
      setBusy(true);
      try { if (!profileCreated) await createProfile(); setStep(5); }
      catch (e) { Alert.alert('Ops', e instanceof ApiError ? e.message : 'Não foi possível salvar seu perfil.'); }
      finally { setBusy(false); }
      return;
    }
    if (step === 5) { await refreshProfile(); return; }
    setStep(step + 1);
  };

  const addPhoto = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    try {
      const path = await pickAndUploadPhoto(user.id, 0);
      if (path) setPhotoUrl((await signedUrls([path]))[path] ?? null);
    } catch {
      Alert.alert('Falha no envio', 'Tente outra foto.');
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Progresso */}
          <View style={{ flexDirection: 'row', gap: 4, padding: space.lg }}>
            {Array.from({ length: STEPS }).map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.border }} />
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <>
                <H1>Antes de começar</H1>
                <P muted>Seus dados são usados só para encontrar pessoas compatíveis. Você pode baixar ou apagar tudo quando quiser.</P>
                <Consent value={terms} onChange={setTerms}
                  text="Tenho 18 anos ou mais e aceito os Termos de Uso e a Política de Privacidade." />
                <Consent value={sensitive} onChange={setSensitive}
                  text="Autorizo o uso do meu gênero e de quem tenho interesse (dado sensível, LGPD art. 11) apenas para mostrar perfis compatíveis." />
              </>
            )}

            {step === 1 && (
              <>
                <H1>Sobre você</H1>
                <Field label="Como quer ser chamado(a)" value={name} onChangeText={setName} maxLength={40} />
                <Field label="Data de nascimento" placeholder="DD/MM/AAAA" value={birth} keyboardType="number-pad"
                  onChangeText={(t) => setBirth(maskDate(t))} hint="Sua idade aparece no perfil; a data, não." />
                <Label>Eu sou</Label>
                <ChipGroup options={opts(genderLabels)} value={gender} onChange={setGender} />
                <Label>Tenho interesse em</Label>
                <ChipGroup options={opts(genderLabels)} value={interest} onChange={setInterest} multi />
                <Field label="Sobre mim (opcional)" value={bio} onChangeText={setBio} multiline maxLength={500}
                  placeholder="Ex.: Pós-edital da PF, café preto e Lei Seca às 6h."
                  style={{ height: 96, textAlignVertical: 'top', paddingTop: space.md }} />
              </>
            )}

            {step === 2 && (
              <>
                <H1>Onde você está</H1>
                <P muted>Mostramos só a cidade e uma distância aproximada. Nunca sua localização exata.</P>
                <Button title={coords ? 'Localização aproximada ok ✓' : 'Usar minha localização aproximada'}
                  variant="ghost" onPress={useMyLocation} loading={busy} />
                <Label>Estado</Label>
                <ChipGroup options={statesOrdered.map((s) => ({ value: s, label: s }))} value={state} onChange={setState} />
                <Field label="Cidade" value={city} onChangeText={setCity} maxLength={80} />
              </>
            )}

            {step === 3 && (
              <>
                <H1>Seu concurso</H1>
                <Label>Área</Label>
                <ChipGroup options={areas.map((a) => ({ value: a.id, label: a.name }))} value={areaId} onChange={setAreaId} />
                {comps.length > 0 && (
                  <>
                    <Label>Concurso / cargo (opcional)</Label>
                    <ChipGroup options={comps.map((x) => ({ value: x.id, label: `${x.organization} — ${x.name}` }))}
                      value={compId} onChange={setCompId} />
                  </>
                )}
                <Label>Em que fase você está</Label>
                <ChipGroup options={opts(statusLabels)} value={status} onChange={setStatus} />
                <Label>Quando você estuda</Label>
                <ChipGroup options={opts(periodLabels)} value={period} onChange={setPeriod} />
              </>
            )}

            {step === 4 && (
              <>
                <H1>Modo Lotação</H1>
                <P muted>Vai (ou quer) ser lotado(a) em outra cidade? Mostramos também pessoas de lá e quem vai para o mesmo lugar.</P>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[font.body, { color: c.text }]}>Ativar Modo Lotação</Text>
                  <Switch value={lotacao} onValueChange={setLotacao} accessibilityLabel="Ativar Modo Lotação" />
                </View>
                {lotacao && (
                  <>
                    <Label>Estado de destino</Label>
                    <ChipGroup options={statesOrdered.map((s) => ({ value: s, label: s }))} value={tState} onChange={setTState} />
                    <Field label="Cidade de destino" value={tCity} onChangeText={setTCity} maxLength={80} />
                  </>
                )}
              </>
            )}

            {step === 5 && (
              <>
                <H1>Sua melhor foto</H1>
                <P muted>Rosto visível, sem óculos escuros. Perfis com foto real recebem muito mais curtidas.</P>
                <Pressable accessibilityRole="button" accessibilityLabel="Escolher foto" onPress={addPhoto}
                  style={{ alignSelf: 'center', width: 220, height: 290, borderRadius: radius.lg, borderWidth: 2,
                    borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.surface,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {photoUrl
                    ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <Text style={[font.h2, { color: c.textMuted }]}>+ Foto</Text>}
                </Pressable>
              </>
            )}
          </ScrollView>

          <View style={{ padding: space.xl, gap: space.sm }}>
            <Button title={step === 5 ? 'Começar a descobrir' : 'Continuar'} onPress={next}
              disabled={!valid[step]} loading={busy && step !== 2} />
            {step > 0 && step < 5 && <Button title="Voltar" variant="ghost" onPress={() => setStep(step - 1)} />}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

function Label({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[font.small, { color: c.textMuted, marginBottom: -space.sm }]}>{children}</Text>;
}

function Consent({ value, onChange, text }: { value: boolean; onChange: (v: boolean) => void; text: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.text,
        backgroundColor: value ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {value ? <Text style={{ color: c.onAccent, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <Text style={[font.body, { color: c.text, flex: 1 }]}>{text}</Text>
    </Pressable>
  );
}
