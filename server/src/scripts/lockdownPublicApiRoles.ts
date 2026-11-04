import "dotenv/config";
import { closeDb, connectDb, getSqlClient } from "../db";

async function main() {
  if (process.env.APPLY_PUBLIC_API_ROLE_LOCKDOWN !== "true") {
    console.error(
      "Refusing to change database privileges. Set APPLY_PUBLIC_API_ROLE_LOCKDOWN=true only after reviewing docs/PRODUCTION_RECOVERY_AND_DATABASE_SECURITY.md and testing on staging.",
    );
    process.exitCode = 2;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required. No secret value is printed.");

  connectDb(databaseUrl);
  const sql = getSqlClient();
  const roleRows = await sql.unsafe<Array<{
    current_user: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
  }>>( `
    select current_user::text as current_user,
           rolsuper as is_superuser,
           rolbypassrls as bypasses_rls
    from pg_roles where rolname = current_user
  `);

  const runtimeRole = roleRows[0];
  if (!runtimeRole || (!runtimeRole.is_superuser && !runtimeRole.bypasses_rls)) {
    throw new Error(
      "Lockdown stopped: the current app DB role does not bypass RLS. Enabling RLS without table-specific policies could break live Drizzle queries. Use the read-only audit and design tested policies first.",
    );
  }

  // This is safe only for Truvi's current architecture: browser clients call
  // the Express API, not Supabase PostgREST directly. Backend DB credentials
  // stay server-side and are not subject to these anon/authenticated grants.
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      do $lockdown$
      declare
        tbl record;
        target_role text;
      begin
        for tbl in
          select n.nspname as schema_name, c.relname as table_name
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p')
        loop
          execute format('alter table %I.%I enable row level security', tbl.schema_name, tbl.table_name);
          execute format('revoke all privileges on table %I.%I from public', tbl.schema_name, tbl.table_name);
          foreach target_role in array array['anon', 'authenticated'] loop
            if exists (select 1 from pg_roles where rolname = target_role) then
              execute format('revoke all privileges on table %I.%I from %I', tbl.schema_name, tbl.table_name, target_role);
            end if;
          end loop;
        end loop;

        execute 'revoke all privileges on schema public from public';
        execute 'revoke all privileges on all sequences in schema public from public';
        execute 'revoke execute on all functions in schema public from public';

        foreach target_role in array array['anon', 'authenticated'] loop
          if exists (select 1 from pg_roles where rolname = target_role) then
            execute format('revoke all privileges on schema public from %I', target_role);
            execute format('revoke all privileges on all sequences in schema public from %I', target_role);
            execute format('revoke execute on all functions in schema public from %I', target_role);
            execute format('alter default privileges for role %I in schema public revoke all on tables from %I', current_user, target_role);
            execute format('alter default privileges for role %I in schema public revoke all on sequences from %I', current_user, target_role);
            execute format('alter default privileges for role %I in schema public revoke execute on functions from %I', current_user, target_role);
          end if;
        end loop;

        execute format('alter default privileges for role %I in schema public revoke all on tables from public', current_user);
        execute format('alter default privileges for role %I in schema public revoke all on sequences from public', current_user);
        execute format('alter default privileges for role %I in schema public revoke execute on functions from public', current_user);
      end
      $lockdown$;
    `);
  });

  console.log(
    "Database lockdown applied: RLS enabled on public tables and PUBLIC/anon/authenticated table, sequence and function privileges revoked. Backend app-role access was left unchanged.",
  );
  console.warn(
    "Run npm run db:security-audit again, then execute staging tests for signup, inventory, requirements, leads, site visits, admin, employee and payment workflows before production rollout.",
  );
}

main()
  .catch((error) => {
    console.error("Database lockdown failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
