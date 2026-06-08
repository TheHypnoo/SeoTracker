import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAction, Permission, Role } from '@seotracker/shared-types';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { ACTIVITY_RECORDED_EVENT, type ActivityEvent } from '../activity-log/activity-log.listener';

import { assertPresent } from '../common/utils/assert';
import { hashToken, randomToken } from '../common/utils/security';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { users, projectInvites, projectMembers } from '../database/schema';
import type { Env } from '../config/env.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { CreateInviteDto } from './dto/create-invite.dto';

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly projectsService: ProjectsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService<Env, true>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitActivity(event: ActivityEvent) {
    this.eventEmitter.emit(ACTIVITY_RECORDED_EVENT, event);
  }

  async createInvite(projectId: string, actorUserId: string, input: CreateInviteDto) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.MEMBERS_INVITE);

    const role = input.role ?? Role.MEMBER;
    if (role === Role.OWNER) {
      throw new BadRequestException('Cannot invite OWNER role');
    }

    const email = input.email.toLowerCase().trim();
    const extraPermissions = input.extraPermissions ?? [];
    const revokedPermissions = input.revokedPermissions ?? [];
    // Reuse the same validation rules from member updates so the invite cannot
    // describe a permission set that updateMemberPermissions would later reject.
    this.projectsService.validateOverrides(role, extraPermissions, revokedPermissions);

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const savedInvite = await this.db.transaction(async (tx) => {
      const [existingInvite] = await tx
        .select({ id: projectInvites.id })
        .from(projectInvites)
        .where(
          and(
            eq(projectInvites.projectId, projectId),
            eq(projectInvites.email, email),
            isNull(projectInvites.acceptedAt),
          ),
        )
        .limit(1);
      if (existingInvite) {
        throw new ConflictException('This email already has a pending invitation');
      }

      const [existingMember] = await tx
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(and(eq(projectMembers.projectId, projectId), eq(users.email, email)))
        .limit(1);
      if (existingMember) {
        throw new ConflictException('This email is already a project member');
      }

      let invite:
        | {
            id: string;
            projectId: string;
            email: string;
            role: Role;
            extraPermissions: string[];
            revokedPermissions: string[];
            expiresAt: Date;
          }
        | undefined;
      try {
        [invite] = await tx
          .insert(projectInvites)
          .values({
            projectId,
            email,
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
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('This email already has a pending invitation');
        }
        throw error;
      }

      return assertPresent(invite, 'Project invite creation did not return a row');
    });
    const inviteUrl = `${this.configService.get('APP_URL', { infer: true })}/invite/${token}`;

    await this.notificationsService.enqueueEmailDelivery({
      notificationType: 'PROJECT_INVITE',
      projectId,
      to: savedInvite.email,
      subject: 'Invitacion a SEOTracker',
      text: `Has sido invitado a colaborar en un proyecto de SEOTracker.\n\nAcepta la invitacion desde este enlace:\n${inviteUrl}\n\nEste enlace caduca el ${savedInvite.expiresAt.toISOString()}.`,
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

  async listProjectInvites(projectId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.MEMBERS_INVITE);

    const now = new Date();
    const rows = await this.db
      .select({
        id: projectInvites.id,
        projectId: projectInvites.projectId,
        email: projectInvites.email,
        role: projectInvites.role,
        extraPermissions: projectInvites.extraPermissions,
        revokedPermissions: projectInvites.revokedPermissions,
        expiresAt: projectInvites.expiresAt,
        createdAt: projectInvites.createdAt,
      })
      .from(projectInvites)
      .where(and(eq(projectInvites.projectId, projectId), isNull(projectInvites.acceptedAt)))
      .orderBy(desc(projectInvites.createdAt))
      .limit(50);

    return rows.map((invite) => ({
      ...invite,
      extraPermissions: (invite.extraPermissions ?? []) as Permission[],
      revokedPermissions: (invite.revokedPermissions ?? []) as Permission[],
      status: invite.expiresAt > now ? 'pending' : 'expired',
    }));
  }

  async revokeInvite(projectId: string, inviteId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.MEMBERS_INVITE);

    const [invite] = await this.db
      .select({
        id: projectInvites.id,
        email: projectInvites.email,
        role: projectInvites.role,
      })
      .from(projectInvites)
      .where(
        and(
          eq(projectInvites.id, inviteId),
          eq(projectInvites.projectId, projectId),
          isNull(projectInvites.acceptedAt),
        ),
      )
      .limit(1);

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    await this.db.delete(projectInvites).where(eq(projectInvites.id, invite.id));

    this.emitActivity({
      projectId,
      userId: actorUserId,
      action: ActivityAction.MEMBER_INVITE_REVOKED,
      resourceType: 'invite',
      resourceId: invite.id,
      metadata: { email: invite.email, role: invite.role },
    });

    return { success: true };
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

    return { projectId: invite.projectId, success: true };
  }
}
