-- =====================================================================
-- 016 · Transcrição dos áudios do WhatsApp
-- Guarda o texto de cada áudio (feito pelo Groq/Whisper). Precisa também
-- da chave GROQ_API_KEY na Vercel.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
alter table mensagens add column if not exists transcricao text;
