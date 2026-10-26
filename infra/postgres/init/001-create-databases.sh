#!/usr/bin/env bash
set -euo pipefail

psql \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set command_database="${ET_COMMAND_DATABASE}" \
  --set command_password="${ET_COMMAND_DATABASE_PASSWORD}" \
  --set command_user="${ET_COMMAND_DATABASE_USER}" \
  --set projection_password="${ET_PROJECTION_DATABASE_PASSWORD}" \
  --set projection_user="${ET_PROJECTION_DATABASE_USER}" \
  --set read_api_password="${ET_READ_API_DATABASE_PASSWORD}" \
  --set read_api_user="${ET_READ_API_DATABASE_USER}" \
  --set read_database="${ET_READ_DATABASE}" \
  <<'SQL'
CREATE ROLE :"command_user" LOGIN PASSWORD :'command_password';
CREATE ROLE :"projection_user" LOGIN PASSWORD :'projection_password';
CREATE ROLE :"read_api_user" LOGIN PASSWORD :'read_api_password';
CREATE DATABASE :"command_database" OWNER :"command_user";
CREATE DATABASE :"read_database" OWNER :"projection_user";
GRANT CONNECT ON DATABASE :"read_database" TO :"read_api_user";
SQL
