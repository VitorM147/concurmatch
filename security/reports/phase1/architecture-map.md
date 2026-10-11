# SEC-002 — Arquitetura

```
 App (Expo)  ──HTTPS + JWT──►  Supabase API (PostgREST / RPC)  ──►  Postgres (RLS)
     │                               │
     ├──HTTPS──► Supabase Auth       ├──► Storage (bucket privado "photos")
     └──WSS───► Realtime (messages)  └──► pg_cron (retenção)
```

## Fronteiras de confiança

1. **Aparelho do usuário → Supabase.** Tudo que vem do app é não confiável. A chave anon é pública; a proteção é RLS + grants por coluna + RPCs que validam `auth.uid()`.
2. **RPC `security definer` → tabelas.** Funções rodam como dono das tabelas; cada uma valida usuário ativo (`require_active_user`) e só toca linhas do próprio usuário.
3. **Storage.** Policies cruzam o caminho do objeto com a tabela `photos` e o estado do perfil.
4. **service_role.** Só no painel/CI/Edge Functions; nunca no app (verificado no cliente desde o RUN-0002).

## Fluxos de dados pessoais

| Dado | Origem | Armazenamento | Quem lê |
|---|---|---|---|
| E-mail, senha | cadastro | `auth.users` (hash bcrypt) | só Supabase Auth |
| Gênero e interesse (sensível, LGPD art. 11) | onboarding | `profiles` | só o dono; usado no filtro do `discover()` |
| Data de nascimento | onboarding | `profiles` | só o dono; terceiros veem a idade |
| Localização | GPS (opcional) | `profiles.lat/lng_approx` arredondado a ~1 km no servidor | ninguém; terceiros veem faixa de distância |
| Fotos | galeria | Storage privado + `photos` | autenticados, via URL assinada de 1 h |
| Mensagens | chat | `messages` | só os 2 participantes |
| Sessão (tokens) | Auth | Keychain/Keystore (desde RUN-0002) | o app |
