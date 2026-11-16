-- Exécuté une fois, à la création de la base (docker compose, Testcontainers), par le superutilisateur.
-- L'API et le service d'identité se connectent avec `app` : propriétaire de la base, mais ni superutilisateur
-- ni BYPASSRLS, sinon Postgres ignorerait la Row Level Security (ADR 0013).
create role app login password 'app' nosuperuser nobypassrls;
alter database app owner to app;
