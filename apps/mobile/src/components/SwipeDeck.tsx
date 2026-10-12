// Deck de descoberta com gesto de arrastar (Animated + PanResponder, sem libs extras).
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View,
} from 'react-native';
import type { Candidate } from '@/lib/api';
import { interestLabels, periodLabels, statusLabels } from '@/brand';
import { fonts, palette, radius, space, useColors } from '@/theme';

const { width: W, height: H } = Dimensions.get('window');
const THRESHOLD = W * 0.28;

export type SwipeDir = 'like' | 'pass' | 'star';
export interface SwipeDeckHandle { swipe: (dir: SwipeDir) => void }

interface Props {
  items: Candidate[];
  urls: Record<string, string>;
  onSwipe: (c: Candidate, dir: SwipeDir) => void;
  onOpen?: (c: Candidate) => void;
  /** Interesses do usuário logado: os em comum aparecem destacados */
  myInterests?: string[];
}

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck({ items, urls, onSwipe, myInterests = [] }, ref) {
  const pos = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const top = items[0];
  const next = items[1];

  const fly = (dir: SwipeDir) => {
    if (!top || busy.current) return;
    busy.current = true;
    Haptics.impactAsync(dir === 'pass' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(pos, {
      toValue: dir === 'star' ? { x: 0, y: -H * 1.2 } : { x: (dir === 'like' ? 1 : -1) * W * 1.4, y: 40 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      pos.setValue({ x: 0, y: 0 });
      busy.current = false;
      onSwipe(top, dir);
    });
  };

  useImperativeHandle(ref, () => ({ swipe: fly }));

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > THRESHOLD) fly('like');
      else if (g.dx < -THRESHOLD) fly('pass');
      else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [top?.id]);

  const rotate = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeOpacity = pos.x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pos.x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.deck}>
      {next ? <Card key={next.id} c={next} urls={urls} mine={myInterests} /> : null}
      {top ? (
        <Animated.View
          key={top.id}
          {...responder.panHandlers}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}
        >
          <Card c={top} urls={urls} mine={myInterests} />
          <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
            <Text style={[styles.stampText, { color: palette.marfim }]}>CURTIR</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]}>
            <Text style={[styles.stampText, { color: palette.marfim }]}>PASSAR</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
});

function Card({ c, urls, mine }: { c: Candidate; urls: Record<string, string>; mine: string[] }) {
  const colors = useColors();
  const [i, setI] = useState(0);
  const photo = urls[c.photos[i] ?? c.photos[0]];
  const place = c.distance_label ? `${c.city}/${c.state} · ${c.distance_label}` : c.lotacao_label ?? `${c.city}/${c.state}`;

  return (
    <View style={[StyleSheet.absoluteFill, styles.card, { backgroundColor: colors.surfaceAlt }]}>
      {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}

      {/* Toque nas laterais troca a foto */}
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable accessibilityLabel="Foto anterior" style={{ flex: 1 }} onPress={() => setI((x) => Math.max(0, x - 1))} />
          <Pressable accessibilityLabel="Próxima foto" style={{ flex: 1 }} onPress={() => setI((x) => Math.min(c.photos.length - 1, x + 1))} />
        </View>
      </View>

      {c.photos.length > 1 ? (
        <View style={styles.dots}>
          {c.photos.map((p, k) => (
            <View key={p} style={[styles.dot, { backgroundColor: k === i ? '#fff' : 'rgba(255,255,255,0.4)' }]} />
          ))}
        </View>
      ) : null}

      {c.message_to_me ? (
        <View style={styles.bubble} pointerEvents="none"
          accessibilityLabel={`${c.display_name} curtiu você e mandou: ${c.message_to_me}`}>
          <Text style={styles.bubbleLabel}>★ {c.display_name} curtiu você e mandou:</Text>
          <Text style={styles.bubbleText}>“{c.message_to_me}”</Text>
        </View>
      ) : null}

      <View style={styles.info} pointerEvents="none">
        <Text style={styles.name}>
          {c.display_name}, {c.age}{c.verified ? '  ✓' : ''}
        </Text>
        {c.competition ? (
          <Text style={styles.comp}>
            <Text style={styles.highlight}> {c.competition} </Text>
            {'  '}{statusLabels[c.status]}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {place}{c.study_period ? ` · estuda de ${periodLabels[c.study_period].toLowerCase()}` : ''}
        </Text>
        {c.reasons.length ? (
          <View style={styles.reasons}>
            {c.reasons.slice(0, 3).map((r) => (
              <Text key={r} style={styles.reason}>{r}</Text>
            ))}
          </View>
        ) : null}
        {c.interests?.length ? (
          <View style={styles.reasons}>
            {[...c.interests].sort((a, b) => Number(mine.includes(b)) - Number(mine.includes(a))).slice(0, 5).map((k) => {
              const shared = mine.includes(k);
              return (
                <Text key={k} style={[styles.interest, shared && styles.interestShared]}>
                  {shared ? '♥ ' : ''}{interestLabels[k] ?? k}
                </Text>
              );
            })}
          </View>
        ) : null}
        {c.bio ? <Text style={styles.bio} numberOfLines={2}>{c.bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, margin: space.lg },
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  info: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.xl, gap: space.xs,
    backgroundColor: 'rgba(46,14,20,0.66)',
  },
  name: { color: palette.marfim, fontSize: 30, fontFamily: fonts.display },
  comp: { color: palette.marfim, fontSize: 14, fontFamily: fonts.medium },
  highlight: { backgroundColor: palette.marfim, color: palette.vinho, fontFamily: fonts.bold },
  meta: { color: 'rgba(248,242,236,0.85)', fontSize: 13, fontFamily: fonts.medium },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  reason: {
    color: palette.marfim, fontSize: 12, fontFamily: fonts.semibold, paddingHorizontal: space.sm, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden',
  },
  interest: {
    color: palette.vinho, backgroundColor: 'rgba(248,242,236,0.92)', fontSize: 12, fontFamily: fonts.semibold,
    paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden',
  },
  interestShared: { backgroundColor: palette.rosa, color: palette.white },
  bio: { color: 'rgba(248,242,236,0.92)', fontSize: 14, fontFamily: fonts.regular, marginTop: space.xs },
  bubble: {
    position: 'absolute', top: space.xl, left: space.lg, right: space.lg, padding: space.md, gap: 2,
    backgroundColor: palette.marfim, borderRadius: radius.md, borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  bubbleLabel: { color: palette.rosa, fontSize: 12, fontFamily: fonts.semibold },
  bubbleText: { color: palette.vinhoEscuro, fontSize: 16, fontFamily: fonts.medium, lineHeight: 21 },
  dots: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  stamp: { position: 'absolute', top: 48, borderWidth: 4, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.xs },
  stampLike: { left: 24, borderColor: palette.marfim, backgroundColor: 'rgba(107,30,41,0.85)', transform: [{ rotate: '-14deg' }] },
  stampPass: { right: 24, borderColor: palette.marfim, backgroundColor: 'rgba(46,14,20,0.7)', transform: [{ rotate: '14deg' }] },
  stampText: { fontSize: 28, fontFamily: fonts.bold, letterSpacing: 2 },
});
