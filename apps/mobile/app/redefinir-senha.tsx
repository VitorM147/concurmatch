import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Field, H1, P, Screen } from '@/components/ui';
import { strongPassword } from '@/lib/authLinks';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function RedefinirSenha() {
  const { session, recovery, setRecovery } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!strongPassword(password) || password !== confirmation) {
      return Alert.alert('Confira a senha', 'Use 8+ caracteres, maiúscula, minúscula e número. As duas senhas devem ser iguais.');
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirmation(''); setRecovery(false);
      Alert.alert('Senha atualizada', 'Use a nova senha no próximo acesso.');
      router.replace('/');
    } catch { Alert.alert('Não foi possível atualizar', 'O link pode ter expirado. Solicite outro e tente novamente.'); }
    finally { setBusy(false); }
  };
  return <Screen><ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
    <H1>Nova senha</H1>
    {session && recovery ? <>
      <Field label="Nova senha" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
      <Field label="Confirme a nova senha" secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={setConfirmation} />
      <Button title="Salvar nova senha" onPress={save} loading={busy} />
    </> : <><P>Abra o link de recuperação recebido por e-mail para definir sua nova senha.</P>
      <Button title="Ir para o acesso" onPress={() => router.replace('/entrar')} /></>}
  </ScrollView></Screen>;
}
