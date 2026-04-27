import { ExportKind } from '@seotracker/shared-types';

import type { auditExports } from '../../database/schema';

export type CsvCell = string | number;
export type CsvData = { headers: string[]; rows: CsvCell[][] };

export type ExportRecord = typeof auditExports.$inferSelect;

/**
 * Strategy for materializing a single export "kind" into CSV rows.
 *
 * Each strategy:
 * - declares which `ExportKind` it handles via `kind`
 * - reads whatever it needs from the DB (the DI'd Db reaches it via the
 *   concrete strategy class)
 * - returns the headers + rows; the orchestrator (ExportsService) writes the
 *   stream and updates the auditExports row.
 *
 * Splitting one strategy per kind makes each branch unit-testable in
 * isolation and turns the previous switch/case + 5 private methods into
 * 5 small classes that can evolve independently (add a new kind = new file).
 */
export type CsvBuilderStrategy = {
  readonly kind: ExportKind;
  build(exportRecord: ExportRecord): Promise<CsvData>;
};

/**
 * DI token that resolves to the registered strategies. The module registers
 * a factory that builds an array; the service receives them and indexes by
 * `kind` at construction time.
 */
export const CSV_BUILDER_STRATEGIES = Symbol('CSV_BUILDER_STRATEGIES');
