-- =====================================================================
-- 014 · Toda a equipe vê os casos, processos e audiências não sigilosos
-- Antes, estagiário e atendimento só viam os casos em que eram os
-- responsáveis, e por isso não conseguiam escolher o processo ao agendar
-- uma audiência. Casos marcados como sigilosos continuam visíveis só para
-- o administrador e para o responsável.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create or replace function posso_ver_caso(c casos) returns boolean
language sql stable security definer set search_path = public as $$
  select case meu_papel()
    when 'administrador' then true
    when 'advogado'      then (not c.sigiloso) or c.responsavel_id = auth.uid()
    when 'estagiario'    then (not c.sigiloso) or c.responsavel_id = auth.uid()
    when 'atendimento'   then (not c.sigiloso) or c.responsavel_id = auth.uid()
    else false
  end
$$;
