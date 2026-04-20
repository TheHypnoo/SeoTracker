import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { assertPresent } from '../common/utils/assert';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { userPreferences, users, projectMembers, projects } from '../database/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  findById(id: string) {
    return this.db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  findByEmail(email: string) {
    return this.db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  }

  async getPreferences(userId: string) {
    const [preferences] = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    const activeProjectId = await this.resolveActiveProjectId(
      userId,
      preferences?.activeProjectId ?? null,
    );

    if (!preferences || preferences.activeProjectId !== activeProjectId) {
      await this.db
        .insert(userPreferences)
        .values({
          activeProjectId,
          updatedAt: new Date(),
          userId,
        })
        .onConflictDoUpdate({
          set: {
            activeProjectId,
            updatedAt: new Date(),
          },
          target: userPreferences.userId,
        });
    }

    return {
      activeProjectId,
      emailOnAuditCompleted: preferences?.emailOnAuditCompleted ?? true,
      emailOnAuditRegression: preferences?.emailOnAuditRegression ?? true,
      emailOnCriticalIssues: preferences?.emailOnCriticalIssues ?? true,
      userId,
    };
  }

  async updatePreferences(
    userId: string,
    input: {
      activeProjectId?: string | null;
      emailOnAuditCompleted?: boolean;
      emailOnAuditRegression?: boolean;
      emailOnCriticalIssues?: boolean;
    },
  ) {
    const currentPreferences = await this.getPreferences(userId);
    const activeProjectId =
      input.activeProjectId === undefined
        ? currentPreferences.activeProjectId
        : await this.resolveActiveProjectId(userId, input.activeProjectId);

    const [saved] = await this.db
      .insert(userPreferences)
      .values({
        activeProjectId,
        emailOnAuditCompleted:
          input.emailOnAuditCompleted ?? currentPreferences.emailOnAuditCompleted,
        emailOnAuditRegression:
          input.emailOnAuditRegression ?? currentPreferences.emailOnAuditRegression,
        emailOnCriticalIssues:
          input.emailOnCriticalIssues ?? currentPreferences.emailOnCriticalIssues,
        updatedAt: new Date(),
        userId,
      })
      .onConflictDoUpdate({
        set: {
          activeProjectId,
          emailOnAuditCompleted:
            input.emailOnAuditCompleted ?? currentPreferences.emailOnAuditCompleted,
          emailOnAuditRegression:
            input.emailOnAuditRegression ?? currentPreferences.emailOnAuditRegression,
          emailOnCriticalIssues:
            input.emailOnCriticalIssues ?? currentPreferences.emailOnCriticalIssues,
          updatedAt: new Date(),
        },
        target: userPreferences.userId,
      })
      .returning();

    const savedPreferences = assertPresent(saved, 'User preferences upsert did not return a row');

    return {
      activeProjectId: savedPreferences.activeProjectId,
      emailOnAuditCompleted: savedPreferences.emailOnAuditCompleted,
      emailOnAuditRegression: savedPreferences.emailOnAuditRegression,
      emailOnCriticalIssues: savedPreferences.emailOnCriticalIssues,
      userId: savedPreferences.userId,
    };
  }

  private async resolveActiveProjectId(userId: string, requestedProjectId: string | null) {
    if (requestedProjectId) {
      const [membership] = await this.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, userId))
        .orderBy(asc(projectMembers.createdAt));

      if (membership) {
        const allowedMembership = await this.db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, userId));

        if (allowedMembership.some((item) => item.projectId === requestedProjectId)) {
          return requestedProjectId;
        }
      }
    }

    const [fallbackProject] = await this.db
      .select({ id: projects.id })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, userId))
      .orderBy(asc(projects.createdAt))
      .limit(1);

    return fallbackProject?.id ?? null;
  }
}
