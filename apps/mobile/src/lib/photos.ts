// Fotos: bucket PRIVADO. Exibição via URL assinada de curta duração.
import { useEffect, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'photos';
const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit && hit.exp > now) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, TTL_SECONDS);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        out[item.path] = item.signedUrl;
        cache.set(item.path, { url: item.signedUrl, exp: now + (TTL_SECONDS - 120) * 1000 });
      }
    }
  }
  return out;
}

export function useSignedUrls(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const list = paths.filter((p): p is string => !!p);
    if (list.length) signedUrls(list).then((u) => alive && setUrls(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Abre a galeria, comprime (1080px, JPEG 80%) e envia. Retorna o storage_path. */
export async function pickAndUploadPhoto(userId: string, position: number): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 1,
  });
  if (picked.canceled || !picked.assets[0]) return null;

  const resized = await ImageManipulator.manipulateAsync(
    picked.assets[0].uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );

  const body = await (await fetch(resized.uri)).arrayBuffer();
  // Nome gerado aqui e validado no servidor (constraint photos_path_owner + policy do Storage)
  const path = `${userId}/${Date.now()}-${position}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;

  // Substitui a foto da mesma posição (apaga registro e arquivo antigos)
  const { data: old } = await supabase.from('photos').select('storage_path').eq('position', position).maybeSingle();
  if (old) {
    await supabase.from('photos').delete().eq('position', position);
    await supabase.storage.from(BUCKET).remove([old.storage_path]);
  }
  const { error: dbError } = await supabase.from('photos').insert({ user_id: userId, storage_path: path, position });
  if (dbError) throw dbError;
  return path;
}
