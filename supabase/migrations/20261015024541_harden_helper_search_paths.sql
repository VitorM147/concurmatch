-- Fixar resolução de nomes das funções auxiliares, conforme Supabase Advisors.
-- Não altera permissões nem as regras de autorização.
alter function public.age_years(date) set search_path = public;
alter function public.bio_allowed(text) set search_path = public;
alter function public.distance_km(numeric, numeric, numeric, numeric) set search_path = public;
alter function public.distance_label(numeric) set search_path = public;
alter function public.interest_catalog() set search_path = public;
alter function public.like_message_allowed(text) set search_path = public;
alter function public.report_reason_is_conversational(public.report_reason) set search_path = public;
alter function public.round_location() set search_path = public;
alter function public.sexual_service_signal(text) set search_path = public;
alter function public.sexual_service_signal_strict(text) set search_path = public;
alter function public.sp_day_start() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.valid_interests(text[]) set search_path = public;
alter function public.verification_challenges() set search_path = public;
