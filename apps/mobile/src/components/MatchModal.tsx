// Tela de match: "Aprovados! Vocês entraram no Estágio Probatório."
import { Image } from 'expo-image';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { Candidate } from '@/lib/api';
import { brand } from '@/brand';
import { radius, space } from '@/theme';
import { Button } from './ui';

export function MatchModal({ who, photoUrl, myPhotoUrl, onChat, onClose }: {
  who: Candidate | null; photoUrl?: string; myPhotoUrl?: string;
  onChat: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={!!who} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.stampBox} accessibilityRole="header">
          <Text style={styles.stamp}>{brand.matchTitle}</Text>
        </View>
        <Text style={styles.subtitle}>{brand.matchSubtitle}</Text>

        <View style={styles.photos}>
          <Image source={myPhotoUrl ? { uri: myPhotoUrl } : undefined} style={[styles.photo, { transform: [{ rotate: '-6deg' }] }]} />
          <Image source={photoUrl ? { uri: photoUrl } : undefined} style={[styles.photo, { transform: [{ rotate: '6deg' }], marginLeft: -24 }]} />
        </View>

        {who?.reasons.length ? (
          <Text style={styles.common}>Em comum: {who.reasons.join(' · ')}</Text>
        ) : null}
        <Text style={styles.cta}>{brand.matchCta}</Text>

        <View style={{ alignSelf: 'stretch', gap: space.md }}>
          <Button title={`Conversar com ${who?.display_name ?? ''}`} variant="accent" onPress={onChat} />
          <Button title="Continuar descobrindo" variant="ghost" onPress={onClose} style={{ borderColor: 'rgba(255,255,255,0.4)' }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(14,20,36,0.96)', alignItems: 'center', justifyContent: 'center',
    padding: space.xxl, gap: space.lg,
  },
  stampBox: {
    borderWidth: 5, borderColor: '#FFD23F', borderRadius: radius.md, paddingHorizontal: space.xl,
    paddingVertical: space.sm, transform: [{ rotate: '-4deg' }],
  },
  stamp: { color: '#FFD23F', fontSize: 44, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  subtitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  photos: { flexDirection: 'row', marginVertical: space.lg },
  photo: { width: 130, height: 170, borderRadius: radius.md, borderWidth: 4, borderColor: '#fff', backgroundColor: '#2B3A5C' },
  common: { color: '#FFD23F', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cta: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: space.md },
});
