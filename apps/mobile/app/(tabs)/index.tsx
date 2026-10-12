// Discovery: deck de perfis, curtir/passar, limite diário e tela de match
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Logo } from '@/components/Brand';
import { MatchModal } from '@/components/MatchModal';
import { StarMessageModal } from '@/components/StarMessageModal';
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from '@/components/SwipeDeck';
import { Button, Empty, Screen } from '@/components/ui';
import { api, ApiError, type Candidate, type Limits } from '@/lib/api';
import { signedUrls } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { brand } from '@/brand';
import { fonts, radius, space, useColors } from '@/theme';

export default function Discover() {
  const c = useColors();
  const router = useRouter();
  const navigation = useNavigation();
  const { profile } = useSession();
  const deck = useRef<SwipeDeckHandle>(null);
  const loadingMore = useRef(false);

  const [items, setItems] = useState<Candidate[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [match, setMatch] = useState<{ who: Candidate; id: string } | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | undefined>();
  const [starFor, setStarFor] = useState<Candidate | null>(null);

  const load = useCallback(async (append = false) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const [list, lim] = await Promise.all([api.discover(20), api.myLimits()]);
      setLimits(lim);
      const fresh = await signedUrls(list.flatMap((x) => x.photos));
      setUrls((prev) => (append ? { ...prev, ...fresh } : fresh));
      setItems((prev) => {
        if (!append) return list;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...list.filter((x) => !seen.has(x.id))];
      });
    } catch (e) {
      Alert.alert('Ops', e instanceof ApiError ? e.message : 'Não foi possível carregar perfis.');
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    api.myPhotos().then(async (ps) => {
      if (ps[0]) setMyPhoto((await signedUrls([ps[0].storage_path]))[ps[0].storage_path]);
    }).catch(() => {});
  }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <Logo size={22} />,
      headerRight: () => limits ? (
        <Pressable onPress={() => router.push(limits.verified ? '/premium' : '/verificacao')}
          accessibilityLabel={`${limits.actions_left} ações e ${limits.messages_left} curtidas com mensagem restantes hoje`}
          style={styles.badges}>
          <Text style={[styles.badge, limits.premium
            ? { backgroundColor: c.primary, color: c.onPrimary }
            : { borderColor: c.border, color: c.primary, borderWidth: 1 }]}>♥ {limits.actions_left}</Text>
          <Text style={[styles.badge, { borderColor: c.border, color: limits.verified ? c.accent : c.textMuted, borderWidth: 1 }]}>
            {limits.verified ? `★ ${limits.messages_left}` : '★ 🔒'}
          </Text>
        </Pressable>
      ) : null,
    });
  }, [navigation, limits, c, router]);

  const spend = (r: { remaining: number | null }, message = false) => setLimits((l) => l && ({
    ...l,
    actions_left: r.remaining ?? Math.max(l.actions_left - 1, 0),
    messages_left: message ? Math.max(l.messages_left - 1, 0) : l.messages_left,
  }));

  const actionLimit = () => {
    setLimits((l) => l && { ...l, actions_left: 0 });
    const premium = !!limits?.premium;
    if (limits && !limits.verified) {
      return Alert.alert(brand.actionLimitTitle(limits.actions_max), brand.actionLimitBodyUnverified, [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Verificar agora', onPress: () => router.push('/verificacao') },
      ]);
    }
    Alert.alert(brand.actionLimitTitle(limits?.actions_max ?? brand.freeActions),
      premium ? brand.actionLimitBodyPremium : brand.actionLimitBody,
      premium ? [{ text: 'Ok' }] : [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Ver Premium', onPress: () => router.push('/premium') },
      ]);
  };

  const askVerify = () => Alert.alert(brand.verifyTitle, brand.verifyPitch, [
    { text: 'Agora não', style: 'cancel' },
    { text: 'Verificar agora', onPress: () => router.push('/verificacao') },
  ]);

  // Estrela: só entre perfis verificados (quem não verificou não manda nem recebe recado)
  const openStar = () => {
    const top = items[0];
    if (!top) return;
    if (!limits?.verified) return askVerify();
    if (!top.verified) {
      return Alert.alert('Ainda sem verificação',
        `${top.display_name} ainda não verificou o perfil e não recebe mensagens. Você pode curtir normalmente.`);
    }
    setStarFor(top);
  };

  // Estrela: a curtida com mensagem é enviada ANTES da animação, assim um erro
  // (link no texto, limite do dia) não faz o card sumir.
  const sendStar = async (message: string) => {
    const cand = starFor;
    if (!cand) return;
    try {
      const r = await api.like(cand.id, message);
      spend(r, true);
      setStarFor(null);
      deck.current?.swipe('star');
      if (r.matched && r.match_id) setMatch({ who: cand, id: r.match_id });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ACTION_LIMIT_REACHED') { setStarFor(null); actionLimit(); }
      else if (e instanceof ApiError && e.code === 'VERIFICATION_REQUIRED') { setStarFor(null); askVerify(); }
      else Alert.alert('Não foi possível enviar', e instanceof ApiError ? e.message : 'Tente novamente.');
    }
  };

  const onSwipe = async (cand: Candidate, dir: SwipeDir) => {
    setItems((prev) => prev.filter((x) => x.id !== cand.id));
    if (items.length <= 5) load(true);
    if (dir === 'star') return; // já curtido em sendStar
    try {
      if (dir === 'pass') {
        await api.pass(cand.id);
        spend({ remaining: null });
        return;
      }
      const r = await api.like(cand.id);
      spend(r);
      if (r.matched && r.match_id) setMatch({ who: cand, id: r.match_id });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ACTION_LIMIT_REACHED') {
        setItems((prev) => [cand, ...prev]);          // devolve o card
        actionLimit();
      } else {
        Alert.alert('Ops', e instanceof ApiError ? e.message : 'Tente novamente.');
      }
    }
  };

  if (loading) {
    return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.text} /></Screen>;
  }

  return (
    <Screen>
      {items.length === 0 ? (
        <Empty title="Por hoje é isso" body={brand.emptyDeck}
          action={<Button title="Atualizar" variant="ghost" onPress={() => { setLoading(true); load(); }} />} />
      ) : (
        <>
          <SwipeDeck ref={deck} items={items} urls={urls} onSwipe={onSwipe} myInterests={profile?.interests ?? []} />
          <View style={styles.actions}>
            <RoundButton label="Passar" glyph="✕" color={c.pass} onPress={() => deck.current?.swipe('pass')} />
            <RoundButton label="Curtir" glyph="♥" color={c.like} onPress={() => deck.current?.swipe('like')} big filled />
            <RoundButton label={limits?.verified && items[0]?.verified ? 'Curtir com mensagem' : 'Curtir com mensagem (exige verificação)'}
              glyph="★" color={limits?.verified && items[0]?.verified ? c.star : c.pass} onPress={openStar} />
          </View>
        </>
      )}

      <StarMessageModal who={starFor} onSend={sendStar} onClose={() => setStarFor(null)} />

      <MatchModal
        who={match?.who ?? null}
        photoUrl={match ? urls[match.who.photos[0]] : undefined}
        myPhotoUrl={myPhoto}
        onClose={() => setMatch(null)}
        onChat={() => {
          const m = match; setMatch(null);
          if (m) router.push({ pathname: '/chat/[id]', params: { id: m.id, name: m.who.display_name, other: m.who.id } });
        }}
      />
    </Screen>
  );
}

function RoundButton({ label, glyph, color, onPress, big, filled }: {
  label: string; glyph: string; color: string; onPress: () => void; big?: boolean; filled?: boolean;
}) {
  const c = useColors();
  const size = big ? 76 : 64;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.round, {
        width: size, height: size, borderColor: color, backgroundColor: filled ? color : c.surface,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }]}>
      <Text style={{ color: filled ? c.onPrimary : color, fontSize: big ? 34 : 26, fontFamily: fonts.bold }}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xl, paddingBottom: space.lg },
  round: { borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', gap: space.xs, marginRight: space.lg },
  badge: { fontSize: 13, fontFamily: fonts.bold, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, overflow: 'hidden' },
});
