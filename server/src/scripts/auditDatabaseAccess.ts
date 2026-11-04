import "dotenv/config";
import { closeDb, connectDb, getSqlClient } from "../db";

type RoleRow = {
  current_user: string;
  is_superuser: boolean;
  bypasses_rls: boolean;
  has_public_schema_usage: boolean;
};

type TableRow = {
  table_name: string;
  rls_enabled: boolean;
  force_rls: boolean;
  table_owner: string;
};

type GrantRow = {
  grantee: string;
  object_name: string;
  object_type: string;
  privilege_type: string;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required. No secret value is printed.");

  connectDb(databaseUrl);
  const sql = getSqlClient();
  await sql.unsafe("select 1");

  const roleRows = await sql.unsafe<RoleRow[]>(`
    select
      current_user::text as current_user,
      r.rolsuper as is_superuser,
      r.rolbypassrls as bypasses_rls,
      has_schema_privilege(current_user, 'public', 'USAGE') as has_public_schema_usage
    from pg_roles r
    where r.rolname = current_user
  `);

  const tables = await sql.unsafe<TableRow[]>(`
    select
      c.relname::text as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as force_rls,
      pg_get_userbyid(c.relowner)::text as table_owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `);

  const grants = await sql.unsafe<GrantRow[]>(`
    select grantee::text, table_name::text as object_name,
           'TABLE'::text as object_type, privilege_type::text
    from information_schema.table_privileges
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
    union all
    select grantee::text, object_name::text as object_name,
           'SEQUENCE'::text as object_type, privilege_type::text
    from information_schema.usage_privileges
    where object_schema = 'public' and object_type = 'SEQUENCE'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
    union all
    select grantee::text, routine_name::text as object_name,
           'FUNCTION'::text as object_type, privilege_type::text
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
    union all
    select grantee::text, table_name::text || '.' || column_name::text as object_name,
           'COLUMN'::text as object_type, privilege_type::text
    from information_schema.column_privileges
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
    order by grantee, object_type, object_name, privilege_type
  `);

  const schemaGrants = await sql.unsafe<Array<{ grantee: string; privilege_type: string }>>( `
    select
      case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end::text as grantee,
      acl.privilege_type::text as privilege_type
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) as acl
    left join pg_roles grantee_role on grantee_role.oid = acl.grantee
    where n.nspname = 'public'
      and (acl.grantee = 0 or grantee_role.rolname in ('anon', 'authenticated'))
    order by grantee, privilege_type
  `);

  const policies = await sql.unsafe<Array<{ table_name: string; policy_count: number }>>( `
    select tablename::text as table_name, count(*)::int as policy_count
    from pg_policies
    where schemaname = 'public'
    group by tablename
    order by tablename
  `);

  const role = roleRows[0];
  if (!role) throw new Error("Unable to determine the current PostgreSQL role.");

  const noRls = tables.filter((table) => !table.rls_enabled);
  const forcedRls = tables.filter((table) => table.force_rls);
  const publicApiGrants = grants;
  const policyCounts = new Map(policies.map((row) => [row.table_name, row.policy_count]));

  console.log(JSON.stringify({
    databaseRole: {
      currentUser: role.current_user,
      isSuperuser: role.is_superuser,
      bypassesRls: role.bypasses_rls,
      publicSchemaUsage: role.has_public_schema_usage,
    },
    tables: {
      total: tables.length,
      rlsEnabled: tables.length - noRls.length,
      rlsDisabled: noRls.length,
      forceRlsEnabled: forcedRls.length,
      withoutRls: noRls.map((table) => table.table_name),
      policyCounts: Object.fromEntries(policyCounts),
    },
    publicApiRoleGrants: publicApiGrants,
    publicSchemaGrants: schemaGrants,
  }, null, 2));

  if (publicApiGrants.length || schemaGrants.length) {
    console.error(
      "DATABASE SECURITY WARNING: anon/authenticated/PUBLIC still have table, sequence, function or schema privileges in schema public. Review and revoke unused access; RLS policies alone do not remove GRANTs.",
    );
    process.exitCode = 1;
  } else {
    console.log("No table, sequence, function or schema grants to PUBLIC, anon, or authenticated were found in schema public.");
  }

  if (role.is_superuser || role.bypasses_rls) {
    console.warn(
      "The application database connection bypasses RLS. That may be intentional for the server-side Drizzle application, but database row isolation is then enforced by the backend/API authorization layer, not by RLS for this connection.",
    );
  }

  if (noRls.length) {
    console.warn(
      "RLS is not enabled on every public table. Review the controlled lockdown command and test in staging before applying it.",
    );
  }

  if (forcedRls.length) {
    console.warn(
      "FORCE ROW LEVEL SECURITY is enabled on some tables. Confirm the server database role has policies allowing its required queries.",
    );
  }
}

main()
  .catch((error) => {
    console.error("Database access audit failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
