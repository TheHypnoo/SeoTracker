import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CrawlConfigService } from './crawl-config.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { ListSitesQueryDto } from './dto/list-sites.query.dto';
import { UpdateCrawlConfigDto } from './dto/update-crawl-config.dto';
import { UpdatePublicBadgeDto } from './dto/update-public-badge.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { PublicBadgeAdminService } from './public-badge-admin.service';
import { SitesService } from './sites.service';

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites')
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly crawlConfigService: CrawlConfigService,
    private readonly publicBadgeAdminService: PublicBadgeAdminService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear proyecto' })
  create(@CurrentUser() user: { sub: string }, @Body() body: CreateSiteDto) {
    return this.sitesService.create(user.sub, body);
  }

  @Get()
  @ApiOperation({ summary: 'Listar proyectos (filtrable por projectId)' })
  list(@CurrentUser() user: { sub: string }, @Query() query: ListSitesQueryDto) {
    const { projectId, search, status, automation, limit, offset } = query;
    if (projectId) {
      return this.sitesService.listForProject(projectId, user.sub, {
        search,
        status,
        automation,
        pagination: resolvePagination({ limit, offset }),
      });
    }

    return this.sitesService.listByUser(user.sub);
  }

  @Get(':siteId')
  @ApiOperation({ summary: 'Detalle de proyecto' })
  getById(@CurrentUser() user: { sub: string }, @Param('siteId') siteId: string) {
    return this.sitesService.getById(siteId, user.sub);
  }

  @Patch(':siteId')
  @ApiOperation({ summary: 'Actualizar proyecto' })
  update(
    @CurrentUser() user: { sub: string },
    @Param('siteId') siteId: string,
    @Body() body: UpdateSiteDto,
  ) {
    return this.sitesService.update(siteId, user.sub, body);
  }

  @Delete(':siteId')
  @ApiOperation({ summary: 'Eliminar proyecto' })
  remove(@CurrentUser() user: { sub: string }, @Param('siteId') siteId: string) {
    return this.sitesService.delete(siteId, user.sub);
  }

  @Put(':siteId/schedule')
  @ApiOperation({ summary: 'Crear o actualizar schedule del proyecto' })
  upsertSchedule(
    @CurrentUser() user: { sub: string },
    @Param('siteId') siteId: string,
    @Body() body: UpsertScheduleDto,
  ) {
    return this.sitesService.upsertSchedule(siteId, user.sub, body);
  }

  @Get(':siteId/schedule')
  @ApiOperation({ summary: 'Obtener schedule del proyecto' })
  getSchedule(@CurrentUser() user: { sub: string }, @Param('siteId') siteId: string) {
    return this.sitesService.getSchedule(siteId, user.sub);
  }

  @Get(':siteId/crawl-config')
  @ApiOperation({ summary: 'Obtener config de crawler del sitio (resuelta con defaults)' })
  getCrawlConfig(@CurrentUser() user: { sub: string }, @Param('siteId') siteId: string) {
    return this.crawlConfigService.getForUser(siteId, user.sub);
  }

  @Put(':siteId/crawl-config')
  @ApiOperation({ summary: 'Crear o actualizar config de crawler del sitio' })
  updateCrawlConfig(
    @CurrentUser() user: { sub: string },
    @Param('siteId') siteId: string,
    @Body() body: UpdateCrawlConfigDto,
  ) {
    return this.crawlConfigService.update(siteId, user.sub, body);
  }

  @Get(':siteId/public-badge')
  @ApiOperation({ summary: 'Estado del badge público del sitio' })
  getPublicBadge(@CurrentUser() user: { sub: string }, @Param('siteId') siteId: string) {
    return this.publicBadgeAdminService.getForUser(siteId, user.sub);
  }

  @Put(':siteId/public-badge')
  @ApiOperation({ summary: 'Activar o desactivar el badge público del sitio' })
  updatePublicBadge(
    @CurrentUser() user: { sub: string },
    @Param('siteId') siteId: string,
    @Body() body: UpdatePublicBadgeDto,
  ) {
    return this.publicBadgeAdminService.update(siteId, user.sub, body);
  }
}
