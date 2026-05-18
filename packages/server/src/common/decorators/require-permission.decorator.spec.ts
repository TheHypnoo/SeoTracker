import { describe, expect, it } from '@jest/globals';
import { Permission } from '@seotracker/shared-types';

import {
  REQUIRED_PERMISSION_KEY,
  RequirePermission,
  requirePermissionFactory,
} from './require-permission.decorator';

describe('requirePermission decorator', () => {
  it('exposes the metadata decorator factory', () => {
    expect(requirePermissionFactory).toBe(RequirePermission);
    expect(typeof requirePermissionFactory(Permission.AUDIT_RUN)).toBe('function');
  });

  it('attaches required permission metadata to a handler', () => {
    class Controller {
      handler() {
        return undefined;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    expect(descriptor).toBeDefined();

    requirePermissionFactory(Permission.AUDIT_RUN)(
      Controller.prototype,
      'handler',
      descriptor as PropertyDescriptor,
    );

    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, Controller.prototype.handler)).toBe(
      Permission.AUDIT_RUN,
    );
  });
});
