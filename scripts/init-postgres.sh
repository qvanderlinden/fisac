#!/usr/bin/env bash
# Creates the app's least-privilege role + schema. Tables live in a dedicated
# "fisac" schema rather than public so the app's own role owns exactly its
# table namespace and nothing else.
#
# This is the canonical Postgres bootstrap for the app: run it once against a
# freshly created database, from whatever provisions it. Dropped into
# /docker-entrypoint-initdb.d of the official postgres image it runs
# automatically on first init; otherwise pipe the SQL in by hand. Needs
# POSTGRES_USER, POSTGRES_DB, and FISAC_DB_PASSWORD in the environment.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
		IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fisac') THEN
			CREATE ROLE fisac LOGIN PASSWORD '${FISAC_DB_PASSWORD}';
		END IF;
	END
	\$\$;

	CREATE SCHEMA IF NOT EXISTS fisac AUTHORIZATION fisac;
EOSQL
