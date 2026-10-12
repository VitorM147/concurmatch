// Tela de match: "Deu ConMatch! Vocês querem se conhecer."
import { Image } from 'expo-image';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { Candidate } from '@/lib/api';
import { brand } from '@/brand';
import { fonts, palette, radius, space } from '@/theme';
import { BrandSymbol } from './Brand';
import { Button } from './ui';

export function MatchModal({ who, photoUrl, myPhotoUrl, onChat, onClose }: {
  who: Candidate | null; photoUrl?: string; myPhotoUrl?: string;
  onChat: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={!!who} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.photos}>
          <Image source={myPhotoUrl ? { uri: myPhotoUrl } : undefined} style={[styles.photo, { transform: [{ rotate: '-6deg' }] }]} />
          <Image source={photoUrl ? { uri: photoUrl } : undefined} style={[styles.photo, { transform: [{ rotate: '6deg' }], marginLeft: -28 }]} />
          <View style={styles.badge}><BrandSymbol size={34} /></View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Deu <Text style={{ fontFamily: fonts.displayItalic }}>ConMatch!</Text>
        </Text>
        <Text style={styles.subtitle}>{brand.matchSubtitle}</Text>
        <Text style={styles.cta}>{brand.matchCta}</Text>

        {who?.reasons.length ? (
          <Text style={styles.common}>Em comum: {who.reasons.join(' · ')}</Text>
        ) : null}

        <View style={{ alignSelf: 'stretch', gap: space.md, marginTop: space.md }}>
          <Button title={brand.matchSend} onPress={onChat}
            style={{ backgroundColor: palette.marfim }} textColor={palette.vinho} />
          <Button title={brand.matchContinue} variant="ghost" onPress={onClose}
            style={{ borderColor: 'rgba(248,242,236,0.45)' }} textColor={palette.marfim} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(107,30,41,0.97)', alignItems: 'center', justifyContent: 'center',
    padding: space.xxl, gap: space.sm,
  },
  photos: { flexDirection: 'row', marginBottom: space.xl, alignItems: 'center' },
  photo: {
    width: 130, height: 170, borderRadius: radius.md, borderWidth: 4, borderColor: palette.marfim,
    backgroundColor: palette.vinhoEscuro,
  },
  badge: {
    position: 'absolute', left: 88, bottom: -26, // centro da dupla de fotos (130 + 130 - 28) / 2 - 28
    width: 56, height: 56, borderRadius: 28, backgroundColor: palette.vinho,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.marfim,
  },
  title: { color: palette.marfim, fontSize: 38, fontFamily: fonts.display, textAlign: 'center' },
  subtitle: { color: palette.marfim, fontSize: 18, fontFamily: fonts.semibold, textAlign: 'center' },
  cta: { color: 'rgba(248,242,236,0.8)', fontSize: 15, fontFamily: fonts.regular, textAlign: 'center' },
  common: { color: palette.champanhe, fontSize: 13, fontFamily: fonts.semibold, textAlign: 'center', marginTop: space.sm },
});
