import { createAnthropicClient, type ModelClient } from '../ai/client.js';
import type { Config } from '../config.js';
import type { AnyDb } from '../db/seed/index.js';
import type { ObjectStore } from '../storage/index.js';
import { processScan, type PipelineDeps } from './process.js';
import { createScanQueue, recoverStuckScans, type ScanQueue } from './queue.js';

export { createScan, type CreateScanInput, type CreateScanResult } from './create.js';
export { isBillable } from './billing.js';
export { processScan, type PipelineDeps } from './process.js';
export {
  createScanQueue,
  recoverStuckScans,
  startPeriodicRecovery,
  type ScanQueue,
} from './queue.js';

/** Builds the queue wired to the real pipeline and re-queues scans left hanging by a restart. */
export async function startScanPipeline(opts: {
  db: AnyDb;
  store: ObjectStore;
  config: Pick<
    Config,
    'ANTHROPIC_API_KEY' | 'MODEL_PRIMARY' | 'MODEL_SECONDARY' | 'ROUTE_PAPER_RETURNS_TO_SECONDARY'
  >;
  client?: ModelClient;
  concurrency?: number;
}): Promise<{ queue: ScanQueue; recovered: number }> {
  const deps: PipelineDeps = {
    db: opts.db,
    store: opts.store,
    client: opts.client ?? createAnthropicClient(opts.config.ANTHROPIC_API_KEY),
    models: { primary: opts.config.MODEL_PRIMARY, secondary: opts.config.MODEL_SECONDARY },
    routePaperReturnsToSecondary: opts.config.ROUTE_PAPER_RETURNS_TO_SECONDARY,
  };
  const queue = createScanQueue({
    concurrency: opts.concurrency,
    run: (id) => processScan(deps, id),
  });
  const recovered = await recoverStuckScans(opts.db, queue);
  return { queue, recovered };
}
export { toScanDto } from './dto.js';
