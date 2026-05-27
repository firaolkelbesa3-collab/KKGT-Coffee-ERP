import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * One-time admin migration: Set actual_weighed_kg = kg_sent for all processing
 * logs flagged with actual_weighed_kg_needs_migration or missing actual_weighed_kg.
 * Processes in batches with delays to avoid rate limits.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 15;
    const skipCount = body.skip || 0;

    const allLogs = await base44.asServiceRole.entities.ProcessingLog.list('-created_date', 500);

    // Filter to only those needing migration
    const needsMigration = allLogs.filter(
      log => log.actual_weighed_kg == null || log.actual_weighed_kg_needs_migration
    );

    const batch = needsMigration.slice(skipCount, skipCount + batchSize);
    let migrated = 0;

    for (const log of batch) {
      const actualKg = log.kg_sent || 0;
      const variance = actualKg - ((log.bags_sent || 0) * 85);

      await base44.asServiceRole.entities.ProcessingLog.update(log.id, {
        actual_weighed_kg: actualKg,
        actual_weighed_kg_needs_migration: null,
        batch_variance_kg: variance,
      });
      migrated++;
      console.log(`Migrated ${log.supplier_name} | ${log.date} | kg_sent=${actualKg}`);
    }

    const remaining = needsMigration.length - skipCount - migrated;

    return Response.json({
      total_needing_migration: needsMigration.length,
      batch_migrated: migrated,
      skip_used: skipCount,
      remaining: Math.max(0, remaining),
      next_skip: skipCount + migrated,
      done: remaining <= 0,
    });
  } catch (error) {
    console.error('migrateProcessingLogs error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});