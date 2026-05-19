import { describe, expect, it } from '@jest/globals';
import { Permission } from '@seotracker/shared-types';

import { REQUIRED_PERMISSION_KEY, RequirePermission } from './require-permission.decorator';

describe('requirePermission decorator', () => {
  it('returns a metadata decorator', () => {
    expect(typeof RequirePermission(Permission.AUDIT_RUN)).toBe('function');
  });

  it('attaches required permission metadata to a handler', () => {
    class Controller {
      handler() {
        return undefined;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    expect(descriptor).toBeDefined();

    RequirePermission(Permission.AUDIT_RUN)(
      Controller.prototype,
      'handler',
      descriptor as PropertyDescriptor,
    );

    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, Controller.prototype.handler)).toBe(
      Permission.AUDIT_RUN,
    );
  });
});
