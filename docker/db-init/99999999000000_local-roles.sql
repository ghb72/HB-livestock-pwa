-- The supabase/postgres image creates the Supabase roles but leaves them
-- without a password, while PostgREST and storage-api both connect over TCP
-- with one. Without this the storage container dies on SQLSTATE 28P01
-- (password authentication failed for user "supabase_storage_admin").
--
-- This has to be mounted into the image's `migrations/` directory, not its
-- `init-scripts/` one: migrate.sh runs init-scripts *first* and the roles are
-- only created by the migrations that follow, so an init-scripts hook aborts the
-- entrypoint with 'role "authenticator" does not exist' and the container ends
-- up in a restart loop. The 99999999 prefix sorts after every timestamp-named
-- migration the image ships.
--
-- These hooks only run when the data directory is empty, so changing this file
-- requires `docker compose down -v`.

\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user authenticator with password :'pgpass';
alter user supabase_storage_admin with password :'pgpass';
