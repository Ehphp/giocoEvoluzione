-- Ensure PostgREST has the capability column introduced by the security
-- hardening migration before Edge Functions query it through the REST API.
notify pgrst, 'reload schema';
