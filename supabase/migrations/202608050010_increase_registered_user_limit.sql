update public.auth_security_settings
set integer_value = 30
where setting_name = 'MAX_REGISTERED_USERS';
