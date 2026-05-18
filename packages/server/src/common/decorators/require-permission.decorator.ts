import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@seotracker/shared-types';

export const REQUIRED_PERMISSION_KEY = 'required_permission';

/**
 * Marks a controller method as requiring a specific permission on the project
 * the request targets. The matching guard reads `projectId` (or `siteId`,
 * resolved through `sites`) from the route params and asserts the calling
 * user has the permission via ProjectsService.assertPermission.
 *
 * @example
 *   @RequirePermission(Permission.AUDIT_RUN)
 *   @Post('sites/:siteId/audits/run')
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
