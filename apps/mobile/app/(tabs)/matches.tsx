import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Empty, Screen } from '@/components/ui';
import { api, type MatchRow } from '@/lib/api';
import { useSignedUrls } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { font, radius, space, useColors } from '@/theme';

export default function Matches() {
  const c = useColors();
  const router = useRouter();
  const { session } = useSession();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const urls = useSignedUrls(rows.map((r) => r.photo));

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setRows(await api.matches()); } catch {} finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fresh = rows.filter((r) => !r.last_message);
  const convos = rows.filter((r) => r.last_message);
  const open = (r: MatchRow) => router.push({
    pathname: '/chat/[id]', params: { id: r.match_id, name: r.display_name, other: r.other_id },
  });

  if (!rows.length && !refreshing) {
    return <Screen><Empty title="Nenhum match ainda" body="Continue descobrindo — sua aprovação está no próximo card." /></Screen>;
  }

  return (
    <Screen>
      <FlatList
        data={convos}
        keyExtractor={(r) => r.match_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.text} />}
        ListHeaderComponent={fresh.length ? (
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <Text style={[font.small, styles.section, { color: c.textMuted }]}>NOVOS — MANDE A PRIMEIRA MENSAGEM</Text>
            <FlatList
              horizontal
              data={fresh}
              keyExtractor={(r) => r.match_id}
              contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable onPress={() => open(item)} accessibilityLabel={`Conversar com ${item.display_name}`} style={{ alignItems: 'center', gap: space.xs }}>
                  <Image source={item.photo ? { uri: urls[item.photo] } : undefined}
                    style={[styles.newPhoto, { borderColor: c.accent, backgroundColor: c.surfaceAlt }]} />
                  <Text style={[font.small, { color: c.text }]}>{item.display_name}</Text>
                </Pressable>
              )}
            />
          </View>
        ) : null}
        renderItem={({ item }) => {
          const mine = item.last_sender === session?.user.id;
          return (
            <Pressable onPress={() => open(item)} style={[styles.row, { borderBottomColor: c.border }]}>
              <Image source={item.photo ? { uri: urls[item.photo] } : undefined}
                style={[styles.avatar, { backgroundColor: c.surfaceAlt }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>
                  {item.display_name}{item.competition ? <Text style={{ color: c.textMuted, fontWeight: '400' }}> · {item.competition}</Text> : null}
                </Text>
                <Text numberOfLines={1} style={[font.small, { color: item.unread ? c.text : c.textMuted }]}>
                  {mine ? 'Você: ' : ''}{item.last_message}
                </Text>
              </View>
              {item.unread > 0 && (
                <Text style={[styles.unread, { backgroundColor: c.accent, color: c.onAccent }]}>{item.unread}</Text>
              )}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.lg, letterSpacing: 1 },
  newPhoto: { width: 72, height: 96, borderRadius: radius.md, borderWidth: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  unread: { minWidth: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6 },
});
