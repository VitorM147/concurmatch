// Fotos: bucket PRIVADO. Exibição via URL assinada de curta duração.
import { useEffect, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'photos';
const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; exp: number }>();
export function clearPhotoCache() { cache.clear(); }

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
    setUrls({});
    if (list.length) signedUrls(list).then((u) => alive && setUrls(u)).catch(() => {});
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

  // A troca é uma única escrita. O servidor reinicia a análise e agenda a limpeza
  // do arquivo anterior; a foto antiga não é perdida se a escrita falhar.
  const { error: dbError } = await supabase.rpc('replace_my_photo', { p_path: path, p_position: position });
  if (dbError) {
    // A resposta pode falhar após o commit. Não apague um arquivo que o banco
    // talvez já referencie; o servidor coleta uploads órfãos após 24 horas.
    throw dbError;
  }
  return path;
}

/**
 * Selfie da verificação: câmera frontal, sem galeria (precisa ser na hora, com o gesto).
 * Vai para a pasta do dono, mas NÃO entra em public.photos: só o suporte enxerga.
 */
export async function takeAndUploadSelfie(userId: string): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('CAMERA_DENIED');
  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    quality: 1,
  });
  if (shot.canceled || !shot.assets[0]) return null;
  const resized = await ImageManipulator.manipulateAsync(
    shot.assets[0].uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const body = await (await fetch(resized.uri)).arrayBuffer();
  const path = `${userId}/verificacao-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
