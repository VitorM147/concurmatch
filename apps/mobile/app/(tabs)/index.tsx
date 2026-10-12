// Discovery: deck de perfis, curtir/passar, limite diário e tela de match
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Logo } from '@/components/Brand';
import { MatchModal } from '@/components/MatchModal';
import { StarMessageModal } from '@/components/StarMessageModal';
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from '@/components/SwipeDeck';
import { Button, Empty, Screen } from '@/components/ui';
import { api, ApiError, type Candidate } from '@/lib/api';
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
  const [remaining, setRemaining] = useState<number | null>(null);
  const [match, setMatch] = useState<{ who: Candidate; id: string } | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | undefined>();
  const [starFor, setStarFor] = useState<Candidate | null>(null);

  const load = useCallback(async (append = false) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const [list, left] = await Promise.all([api.discover(20), api.remainingLikes()]);
      setRemaining(left);
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
      headerRight: () => remaining === null ? (
        <Text style={[styles.badge, { backgroundColor: c.primary, color: c.onPrimary }]}>Premium</Text>
      ) : (
        <Pressable onPress={() => router.push('/premium')} accessibilityLabel={`${remaining} curtidas restantes hoje`}>
          <Text style={[styles.badge, { borderColor: c.border, color: c.primary, borderWidth: 1 }]}>♥ {remaining}</Text>
        </Pressable>
      ),
    });
  }, [navigation, remaining, c, router]);

  const likeLimit = () => {
    setRemaining(0);
    Alert.alert(brand.likeLimitTitle, brand.likeLimitBody, [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Ver Premium', onPress: () => router.push('/premium') },
    ]);
  };

  // Estrela: a curtida com mensagem é enviada ANTES da animação, assim um erro
  // (link no texto, limite do dia) não faz o card sumir.
  const sendStar = async (message: string) => {
    const cand = starFor;
    if (!cand) return;
    try {
      const r = await api.like(cand.id, message);
      setRemaining(r.remaining);
      setStarFor(null);
      deck.current?.swipe('star');
      if (r.matched && r.match_id) setMatch({ who: cand, id: r.match_id });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LIKE_LIMIT_REACHED') { setStarFor(null); likeLimit(); }
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
        return;
      }
      const r = await api.like(cand.id);
      setRemaining(r.remaining);
      if (r.matched && r.match_id) setMatch({ who: cand, id: r.match_id });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LIKE_LIMIT_REACHED') {
        setItems((prev) => [cand, ...prev]);          // devolve o card
        likeLimit();
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
            <RoundButton label="Curtir com mensagem" glyph="★" color={c.star}
              onPress={() => items[0] && setStarFor(items[0])} />
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
  badge: { fontSize: 13, fontFamily: fonts.bold, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, marginRight: space.lg, overflow: 'hidden' },
});
