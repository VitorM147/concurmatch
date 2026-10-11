// Discovery: deck de perfis, curtir/passar, limite diário e tela de match
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MatchModal } from '@/components/MatchModal';
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from '@/components/SwipeDeck';
import { Button, Empty, Screen } from '@/components/ui';
import { api, ApiError, type Candidate } from '@/lib/api';
import { signedUrls } from '@/lib/photos';
import { brand } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

export default function Discover() {
  const c = useColors();
  const router = useRouter();
  const navigation = useNavigation();
  const deck = useRef<SwipeDeckHandle>(null);
  const loadingMore = useRef(false);

  const [items, setItems] = useState<Candidate[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [match, setMatch] = useState<{ who: Candidate; id: string } | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | undefined>();

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
      headerTitle: brand.name,
      headerRight: () => remaining === null ? (
        <Text style={[styles.badge, { backgroundColor: c.accent, color: c.onAccent }]}>Premium</Text>
      ) : (
        <Pressable onPress={() => router.push('/premium')} accessibilityLabel={`${remaining} curtidas restantes hoje`}>
          <Text style={[styles.badge, { borderColor: c.border, color: c.text, borderWidth: 1 }]}>♥ {remaining}</Text>
        </Pressable>
      ),
    });
  }, [navigation, remaining, c, router]);

  const onSwipe = async (cand: Candidate, dir: SwipeDir) => {
    setItems((prev) => prev.filter((x) => x.id !== cand.id));
    if (items.length <= 5) load(true);
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
        setRemaining(0);
        Alert.alert(brand.likeLimitTitle, brand.likeLimitBody, [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ver Premium', onPress: () => router.push('/premium') },
        ]);
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
        <Empty title="Fim do caderno" body={brand.emptyDeck}
          action={<Button title="Atualizar" variant="ghost" onPress={() => { setLoading(true); load(); }} />} />
      ) : (
        <>
          <SwipeDeck ref={deck} items={items} urls={urls} onSwipe={onSwipe} />
          <View style={styles.actions}>
            <RoundButton label="Passar" glyph="✕" color={c.pass} onPress={() => deck.current?.swipe('pass')} />
            <RoundButton label="Curtir" glyph="♥" color={c.like} onPress={() => deck.current?.swipe('like')} big />
          </View>
        </>
      )}

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

function RoundButton({ label, glyph, color, onPress, big }: {
  label: string; glyph: string; color: string; onPress: () => void; big?: boolean;
}) {
  const c = useColors();
  const size = big ? 76 : 64;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.round, {
        width: size, height: size, borderColor: color, backgroundColor: c.surface, transform: [{ scale: pressed ? 0.94 : 1 }],
      }]}>
      <Text style={{ color, fontSize: big ? 34 : 28, fontWeight: '900' }}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xxl, paddingBottom: space.lg },
  round: { borderRadius: radius.pill, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  badge: { ...font.small, fontWeight: '800', paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, marginRight: space.lg, overflow: 'hidden' },
});
