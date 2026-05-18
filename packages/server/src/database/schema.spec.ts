import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import * as schema from './schema';

const TABLE_EXPORTS = [
  'users',
  'userPreferences',
  'refreshTokens',
  'passwordResetTokens',
  'projects',
  'projectMembers',
  'projectInvites',
  'sites',
  'siteSchedules',
  'alertRules',
  'webhookEndpoints',
  'webhookSecrets',
  'auditRuns',
  'auditPages',
  'auditUrlInspections',
  'auditIssues',
  'auditActionItems',
  'siteIssues',
  'auditMetrics',
  'auditComparisons',
  'auditComparisonChanges',
  'auditExports',
  'notifications',
  'auditEvents',
  'jobFailures',
  'systemLogs',
  'outboundWebhooks',
  'outboundWebhookDeliveries',
  'siteCrawlConfigs',
  'activityLog',
  'emailDeliveries',
] as const;

describe('database schema', () => {
  it('materializes every table configuration including indexes and foreign keys', () => {
    const configs = TABLE_EXPORTS.map((name) => {
      const table = schema[name];
      const config = getTableConfig(table);
      return {
        columns: Object.keys(config.columns).length,
        foreignKeys: config.foreignKeys.map((foreignKey) => foreignKey.getName()),
        indexes: config.indexes.length,
        name: config.name,
      };
    });

    expect(configs).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ columns: expect.any(Number), name: 'users' }),
        expect.objectContaining({ indexes: expect.any(Number), name: 'audit_runs' }),
        expect.objectContaining({ indexes: expect.any(Number), name: 'email_deliveries' }),
        expect.objectContaining({
          foreignKeys: expect.arrayContaining(['user_preferences_user_id_users_id_fk']),
          name: 'user_preferences',
        }),
      ]),
    );
  });
});
