## O que muda

## Checklist de segurança (ESAA-Security)
- [ ] Nenhum segredo no código (chaves só em `.env` / secrets do CI)
- [ ] Migration nova é append-only e tem teste em `supabase/tests`
- [ ] Tabela nova: RLS ligado e grants mínimos (nada herdado por padrão)
- [ ] Função nova `security definer`: valida `auth.uid()` e tem `revoke` explícito
- [ ] Dado pessoal novo: está mapeado em `docs/` e entra no `export_my_data()`
- [ ] Regra de negócio sensível (limite, denúncia, pagamento) validada no servidor
