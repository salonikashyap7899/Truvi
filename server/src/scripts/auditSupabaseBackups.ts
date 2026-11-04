import "dotenv/config";

type BackupRecord = {
  id?: string | number;
  status?: string;
  inserted_at?: string;
  is_physical_backup?: boolean;
};

type BackupResponse = {
  region?: string;
  walg_enabled?: boolean;
  pitr_enabled?: boolean;
  backups?: BackupRecord[];
  physical_backup_data?: {
    earliest_physical_backup_date_unix?: number;
    latest_physical_backup_date_unix?: number;
  };
};

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

  if (!token || !projectRef) {
    console.error(
      "Backup audit not run: set SUPABASE_ACCESS_TOKEN (Management API token with backups_read) and SUPABASE_PROJECT_REF.",
    );
    process.exitCode = 2;
    return;
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/backups`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    // Never print request headers or tokens. Status is enough to diagnose 401/403/429.
    throw new Error(`Supabase backup inventory request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BackupResponse;
  const completed = (Array.isArray(payload.backups) ? payload.backups : [])
    .filter((backup) => backup.status?.toUpperCase() === "COMPLETED" && backup.inserted_at)
    .sort((a, b) => Date.parse(b.inserted_at!) - Date.parse(a.inserted_at!));

  const latest = completed[0];
  const latestMs = latest ? Date.parse(latest.inserted_at!) : Number.NaN;
  const ageHours = Number.isFinite(latestMs)
    ? Math.round(((Date.now() - latestMs) / 3_600_000) * 10) / 10
    : null;

  console.log(JSON.stringify({
    projectRef,
    region: payload.region ?? null,
    walgEnabled: payload.walg_enabled ?? null,
    pointInTimeRecoveryEnabled: payload.pitr_enabled ?? null,
    completedBackupCount: completed.length,
    latestCompletedBackupAt: latest?.inserted_at ?? null,
    latestBackupAgeHours: ageHours,
    latestBackupType: latest ? (latest.is_physical_backup ? "physical" : "logical") : null,
    earliestPhysicalBackupAt: payload.physical_backup_data?.earliest_physical_backup_date_unix
      ? new Date(payload.physical_backup_data.earliest_physical_backup_date_unix * 1000).toISOString()
      : null,
    latestPhysicalBackupAt: payload.physical_backup_data?.latest_physical_backup_date_unix
      ? new Date(payload.physical_backup_data.latest_physical_backup_date_unix * 1000).toISOString()
      : null,
  }, null, 2));

  if (payload.pitr_enabled) {
    // PITR uses WAL recovery points; the most recent physical base backup can
    // legitimately be older than 36 hours. Its timestamp is not the PITR
    // recovery point. The dashboard must be checked for the actual recoverable
    // time range and a restore drill must still be performed.
    console.log("PITR is enabled. Do not judge recovery freshness from the physical base-backup timestamp alone.");
    console.warn("Verify the available PITR recovery window in Supabase and perform a restore-to-new-project drill.");
  } else if (!latest || ageHours === null || ageHours > 36) {
    console.error("BACKUP AUDIT FAILED: no completed backup is listed within the last 36 hours and PITR is not enabled.");
    process.exitCode = 1;
    return;
  } else {
    console.log("BACKUP AUDIT PASSED: a recent completed backup is listed and PITR is not enabled.");
  }

  console.warn("A restore-to-new-project drill and separate uploaded-file backup check are still required.");
}

main().catch((error) => {
  console.error("Supabase backup audit failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
