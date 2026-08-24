-- Assert the local stack came up with everything the backend needs.
-- Run with ON_ERROR_STOP=1 so a missing object fails the bootstrap service
-- loudly instead of leaving a half-built stack that fails later at runtime.
--
-- Kept in its own file rather than inlined in docker-compose.yml because the
-- `$verify$` dollar quoting would be swallowed by compose variable interpolation.

do $verify$
declare
    missing text;
begin
    select string_agg(name, ', ')
    into missing
    from unnest(array[
        'animals',
        'health',
        'reproduction',
        'observations',
        'sales',
        'recorridos',
        'users'
    ]) as name
    where to_regclass('public.' || name) is null;

    if missing is not null then
        raise exception 'Missing public tables: %', missing;
    end if;

    if to_regclass('storage.buckets') is null then
        raise exception 'storage schema is missing - did storage-api finish its migrations?';
    end if;

    if not exists (select 1 from storage.buckets where id = 'livestock' and public) then
        raise exception 'Public storage bucket "livestock" was not created';
    end if;

    raise notice 'All 7 tables and the public "livestock" bucket are present.';
end
$verify$;
