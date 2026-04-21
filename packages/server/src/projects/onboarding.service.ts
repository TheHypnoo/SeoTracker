import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { userPreferences } from '../database/schema';
import { ProjectsService } from './projects.service';

/**
 * Payload of the `user.registered` domain event. AuthModule emits it after a
 * user is persisted so onboarding side-effects (default project, preferences)
 * can run without AuthModule importing ProjectsModule.
 */
export type UserRegisteredEvent = {
  userId: string;
  name: string | null;
};

export const USER_REGISTERED_EVENT = 'user.registered' as const;

/**
 * Owns post-registration onboarding: creates the user's default project and
 * sets their `activeProjectId` preference. Decouples AuthModule from
 * ProjectsModule — Auth no longer needs to know about projects to register.
 *
 * The listener uses `promisify: true` so AuthService can `emitAsync(...)` and
 * await the bootstrap before issuing the session — preserves the previous
 * synchronous guarantee (preferences exist before the first request).
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
  ) {}

  @OnEvent(USER_REGISTERED_EVENT, { promisify: true })
  async bootstrapNewAccount(payload: UserRegisteredEvent): Promise<void> {
    const projectName = payload.name?.trim() ? `${payload.name.trim()}'s project` : 'Mi proyecto';

    const project = await this.projectsService.createProject(payload.userId, projectName);

    await this.db
      .insert(userPreferences)
      .values({ userId: payload.userId, activeProjectId: project.id })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { activeProjectId: project.id, updatedAt: new Date() },
      });

    this.logger.log(`Bootstrapped onboarding for user ${payload.userId} (project ${project.id})`);
  }
}
