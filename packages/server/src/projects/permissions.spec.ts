import {
  GRANTABLE_PERMISSIONS,
  OWNER_EXCLUSIVE_PERMISSIONS,
  Permission,
  ROLE_PERMISSIONS,
  Role,
  computeEffectivePermissions,
} from '@seotracker/shared-types';

/**
 * Pure tests for the permission map + override math defined in shared-types.
 *
 * These guard the foundational invariants every other layer depends on:
 *  - OWNER always has every permission (overrides ignored).
 *  - Owner-exclusive permissions cannot be granted to MEMBER/VIEWER even via
 *    the `extras` array.
 *  - Diff math: extras add, revoked subtracts.
 */
describe('Permission catalog invariants', () => {
  it('OWNER role grants every permission in the enum', () => {
    const ownerSet = ROLE_PERMISSIONS[Role.OWNER];
    for (const p of Object.values(Permission)) {
      expect(ownerSet.has(p)).toBe(true);
    }
  });

  it('VIEWER role only grants .read permissions', () => {
    const viewerSet = ROLE_PERMISSIONS[Role.VIEWER];
    for (const p of viewerSet) {
      expect(p).toMatch(/\.(view|read)$/);
    }
  });

  it('MEMBER role does NOT include any owner-exclusive permission by default', () => {
    const memberSet = ROLE_PERMISSIONS[Role.MEMBER];
    for (const p of OWNER_EXCLUSIVE_PERMISSIONS) {
      expect(memberSet.has(p)).toBe(false);
    }
  });

  it('GRANTABLE_PERMISSIONS exactly equals all perms minus owner-exclusive', () => {
    const all = new Set(Object.values(Permission));
    for (const p of OWNER_EXCLUSIVE_PERMISSIONS) all.delete(p);
    expect(GRANTABLE_PERMISSIONS.size).toBe(all.size);
    for (const p of GRANTABLE_PERMISSIONS) expect(all.has(p)).toBe(true);
  });
});

describe('computeEffectivePermissions', () => {
  it('OWNER ignores both extras and revoked — always returns the full set', () => {
    const out = computeEffectivePermissions(
      Role.OWNER,
      [Permission.AUDIT_RUN], // ignored
      [Permission.PROJECT_DELETE], // ignored
    );
    expect(out.size).toBe(Object.values(Permission).length);
  });

  it('MEMBER picks up extras that are NOT owner-exclusive', () => {
    // MEMBER does not include WEBHOOK_WRITE by default — adding it via extras
    // should land it in the effective set.
    const before = ROLE_PERMISSIONS[Role.MEMBER].has(Permission.WEBHOOK_WRITE);
    expect(before).toBe(false);

    const out = computeEffectivePermissions(Role.MEMBER, [Permission.WEBHOOK_WRITE], []);
    expect(out.has(Permission.WEBHOOK_WRITE)).toBe(true);
  });

  it('MEMBER cannot acquire owner-exclusive permissions through extras', () => {
    const out = computeEffectivePermissions(Role.MEMBER, [Permission.PROJECT_DELETE], []);
    expect(out.has(Permission.PROJECT_DELETE)).toBe(false);
  });

  it('revoked subtracts default permissions', () => {
    const out = computeEffectivePermissions(Role.MEMBER, [], [Permission.SITE_DELETE]);
    expect(out.has(Permission.SITE_DELETE)).toBe(false);
    // Other defaults preserved.
    expect(out.has(Permission.AUDIT_RUN)).toBe(true);
  });

  it('VIEWER + extras => MEMBER-like read+write capabilities (without owner-exclusive)', () => {
    const out = computeEffectivePermissions(
      Role.VIEWER,
      [Permission.AUDIT_RUN, Permission.SITE_WRITE],
      [],
    );
    expect(out.has(Permission.AUDIT_RUN)).toBe(true);
    expect(out.has(Permission.SITE_WRITE)).toBe(true);
    // VIEWER doesn't get OWNER-exclusive perms even with extras attempting it.
    const out2 = computeEffectivePermissions(Role.VIEWER, [Permission.MEMBERS_INVITE], []);
    expect(out2.has(Permission.MEMBERS_INVITE)).toBe(false);
  });

  it('extras + revoked compose: extra wins on add, revoke wins on remove', () => {
    const out = computeEffectivePermissions(
      Role.MEMBER,
      [Permission.WEBHOOK_WRITE], // grant non-default
      [Permission.AUDIT_RUN], // remove default
    );
    expect(out.has(Permission.WEBHOOK_WRITE)).toBe(true);
    expect(out.has(Permission.AUDIT_RUN)).toBe(false);
  });

  it('default-call (no overrides) returns the role defaults verbatim', () => {
    const out = computeEffectivePermissions(Role.MEMBER);
    const defaults = ROLE_PERMISSIONS[Role.MEMBER];
    expect(out.size).toBe(defaults.size);
    for (const p of defaults) expect(out.has(p)).toBe(true);
  });
});
