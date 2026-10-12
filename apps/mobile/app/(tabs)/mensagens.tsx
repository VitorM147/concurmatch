// Mensagens: conversas que já começaram
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Empty, Screen } from '@/components/ui';
import { api, type MatchRow } from '@/lib/api';
import { useSignedUrls } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { font, fonts, space, useColors } from '@/theme';

export default function Mensagens() {
  const c = useColors();
  const router = useRouter();
  const { session } = useSession();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const urls = useSignedUrls(rows.map((r) => r.photo));

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setRows((await api.matches()).filter((r) => r.last_message)); } catch {} finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (r: MatchRow) => router.push({
    pathname: '/chat/[id]', params: { id: r.match_id, name: r.display_name, other: r.other_id },
  });

  if (!rows.length && !refreshing) {
    return (
      <Screen>
        <Empty title="Nenhuma conversa ainda"
          body="Suas conexões aparecem na aba Conexões. Mande a primeira mensagem por lá." />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.match_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.text} />}
        renderItem={({ item }) => {
          const mine = item.last_sender === session?.user.id;
          return (
            <Pressable onPress={() => open(item)} style={[styles.row, { borderBottomColor: c.border }]}
              accessibilityLabel={`Conversa com ${item.display_name}${item.unread ? `, ${item.unread} não lidas` : ''}`}>
              <Image source={item.photo ? { uri: urls[item.photo] } : undefined}
                style={[styles.avatar, { backgroundColor: c.surfaceAlt }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[font.bodyBold, { color: c.text }]}>
                  {item.display_name}
                  {item.competition ? <Text style={{ color: c.textMuted, fontFamily: fonts.regular }}> · {item.competition}</Text> : null}
                </Text>
                <Text numberOfLines={1} style={[font.small, { color: item.unread ? c.text : c.textMuted }]}>
                  {mine ? 'Você: ' : ''}{item.last_message}
                </Text>
              </View>
              {item.unread > 0 && (
                <Text style={[styles.unread, { backgroundColor: c.primary, color: c.onPrimary }]}>{item.unread}</Text>
              )}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  unread: {
    minWidth: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontFamily: fonts.bold,
    fontSize: 12, overflow: 'hidden', paddingHorizontal: 6,
  },
});
