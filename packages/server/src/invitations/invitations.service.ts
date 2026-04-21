import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAction, Permission, Role } from '@seotracker/shared-types';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';

import { assertPresent } from '../common/utils/assert';
import { hashToken, randomToken } from '../common/utils/security';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { users, projectInvites } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { CreateInviteDto } from './dto/create-invite.dto';

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async createInvite(projectId: string, actorUserId: string, input: CreateInviteDto) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.MEMBERS_INVITE);

    const role = input.role ?? Role.MEMBER;
    const extraPermissions = input.extraPermissions ?? [];
    const revokedPermissions = input.revokedPermissions ?? [];
    // Reuse the same validation rules from member updates so the invite cannot
    // describe a permission set that updateMemberPermissions would later reject.
    this.projectsService.validateOverrides(role, extraPermissions, revokedPermissions);

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invite] = await this.db
      .insert(projectInvites)
      .values({
        projectId,
        email: input.email.toLowerCase().trim(),
        role,
        extraPermissions,
        revokedPermissions,
        tokenHash,
        expiresAt,
      })
      .returning({
        id: projectInvites.id,
        projectId: projectInvites.projectId,
        email: projectInvites.email,
        role: projectInvites.role,
        extraPermissions: projectInvites.extraPermissions,
        revokedPermissions: projectInvites.revokedPermissions,
        expiresAt: projectInvites.expiresAt,
      });

    const savedInvite = assertPresent(invite, 'Project invite creation did not return a row');

    await this.notificationsService.sendEmail({
      to: savedInvite.email,
      subject: 'Invitacion a SEOTracker',
      text: `Has sido invitado a un project. Token de invitacion: ${token}`,
    });

    this.emitActivity({
      projectId,
      userId: actorUserId,
      action: ActivityAction.MEMBER_INVITED,
      resourceType: 'invite',
      resourceId: savedInvite.id,
      metadata: { email: savedInvite.email, role: savedInvite.role },
    });

    return {
      ...savedInvite,
      token,
    };
  }

  async acceptInvite(actorUserId: string, input: AcceptInviteDto) {
    const tokenHash = hashToken(input.token);

    const [invite] = await this.db
      .select()
      .from(projectInvites)
      .where(
        and(
          eq(projectInvites.tokenHash, tokenHash),
          isNull(projectInvites.acceptedAt),
          gt(projectInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invite) {
      throw new NotFoundException('Invite not found or expired');
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, actorUserId)).limit(1);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('Invite email does not match authenticated user');
    }

    await this.projectsService.addMember(
      invite.projectId,
      actorUserId,
      invite.role,
      (invite.extraPermissions ?? []) as Permission[],
      (invite.revokedPermissions ?? []) as Permission[],
    );

    await this.db
      .update(projectInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(projectInvites.id, invite.id));

    this.emitActivity({
      projectId: invite.projectId,
      userId: actorUserId,
      action: ActivityAction.MEMBER_ACCEPTED,
      resourceType: 'member',
      resourceId: actorUserId,
      role: invite.role as Role,
      metadata: { email: invite.email, role: invite.role, inviteId: invite.id },
    });

    return { success: true };
  }
}
