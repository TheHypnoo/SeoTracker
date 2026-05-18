import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateMemberPermissionsDto } from './dto/update-member-permissions.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  private readonly projectsService: ProjectsService;

  constructor(@Inject(ProjectsService) projectsService: unknown) {
    this.projectsService = projectsService as ProjectsService;
  }

  @Post()
  @ApiOperation({ summary: 'Crear project' })
  create(@CurrentUser() user: { sub: string }, @Body() body: unknown) {
    const dto = parseBodyDto(CreateProjectDto, body);
    return this.projectsService.createProject(user.sub, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'Listar projects del usuario autenticado' })
  list(@CurrentUser() user: { sub: string }) {
    return this.projectsService.listForUser(user.sub);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Detalle de project' })
  getById(@CurrentUser() user: { sub: string }, @Param('projectId') projectId: string) {
    return this.projectsService.getProjectForUser(projectId, user.sub);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Actualizar project' })
  update(
    @CurrentUser() user: { sub: string },
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.projectsService.updateProject(projectId, user.sub, body as UpdateProjectDto);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Eliminar project' })
  delete(@CurrentUser() user: { sub: string }, @Param('projectId') projectId: string) {
    return this.projectsService.deleteProject(projectId, user.sub);
  }

  @Get(':projectId/dashboard')
  @ApiOperation({ summary: 'Resumen ejecutivo del project' })
  dashboard(@CurrentUser() user: { sub: string }, @Param('projectId') projectId: string) {
    return this.projectsService.getDashboard(projectId, user.sub);
  }

  @Get(':projectId/members')
  @ApiOperation({ summary: 'Listar miembros de project' })
  members(@CurrentUser() user: { sub: string }, @Param('projectId') projectId: string) {
    return this.projectsService.listMembers(projectId, user.sub);
  }

  @Delete(':projectId/members/:userId')
  @ApiOperation({ summary: 'Eliminar miembro (solo owner)' })
  removeMember(
    @CurrentUser() user: { sub: string },
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.projectsService.removeMember(projectId, userId, user.sub);
  }

  @Patch(':projectId/members/:userId/permissions')
  @ApiOperation({ summary: 'Actualizar rol y permisos personalizados de un miembro (solo owner)' })
  updateMemberPermissions(
    @CurrentUser() user: { sub: string },
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.projectsService.updateMemberPermissions(
      projectId,
      userId,
      user.sub,
      body as UpdateMemberPermissionsDto,
    );
  }
}

function parseBodyDto<T extends object>(dto: new () => T, body: unknown): T {
  const parsed = plainToInstance(dto, body);
  const errors = validateSync(parsed, { forbidNonWhitelisted: true, whitelist: true });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints as Record<string, string>)),
    );
  }
  return parsed;
}
