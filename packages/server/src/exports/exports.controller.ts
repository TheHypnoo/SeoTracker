import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolvePagination } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UUID_V4_PIPE } from '../common/pipes/uuid-v4.pipe';
import { CreateExportDto } from './dto/create-export.dto';
import { ListSiteExportsQueryDto } from './dto/list-site-exports.query.dto';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('sites/:siteId/exports')
  @ApiOperation({ summary: 'Solicitar una exportación de proyecto' })
  create(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Body() body: CreateExportDto,
  ) {
    return this.exportsService.create(siteId, user.sub, body);
  }

  @Get('sites/:siteId/exports')
  @ApiOperation({ summary: 'Listar exportaciones de un proyecto' })
  list(
    @CurrentUser() user: { sub: string },
    @Param('siteId', UUID_V4_PIPE) siteId: string,
    @Query() query: ListSiteExportsQueryDto,
  ) {
    return this.exportsService.listForProject(
      siteId,
      user.sub,
      resolvePagination({ limit: query.limit, offset: query.offset }, { limit: 50, offset: 0 }),
    );
  }

  @Get('projects/:projectId/exports')
  @ApiOperation({ summary: 'Listar exportaciones del proyecto (cross-site)' })
  listForProject(
    @CurrentUser() user: { sub: string },
    @Param('projectId', UUID_V4_PIPE) projectId: string,
    @Query() query: ListSiteExportsQueryDto,
  ) {
    return this.exportsService.listForProjectScope(
      projectId,
      user.sub,
      resolvePagination({ limit: query.limit, offset: query.offset }, { limit: 50, offset: 0 }),
    );
  }

  @Get('exports/:exportId')
  @ApiOperation({ summary: 'Detalle de una exportación' })
  getById(@CurrentUser() user: { sub: string }, @Param('exportId', UUID_V4_PIPE) exportId: string) {
    return this.exportsService.getById(exportId, user.sub);
  }

  @Get('exports/:exportId/download')
  @ApiOperation({ summary: 'Descargar fichero exportado' })
  async download(
    @CurrentUser() user: { sub: string },
    @Param('exportId', UUID_V4_PIPE) exportId: string,
    @Res() response: Response,
  ) {
    const file = await this.exportsService.resolveDownload(exportId, user.sub);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);

    await pipeline(createReadStream(file.storagePath), response);
  }

  @Post('exports/:exportId/retry')
  @ApiOperation({ summary: 'Reintentar una exportación fallida' })
  retry(@CurrentUser() user: { sub: string }, @Param('exportId', UUID_V4_PIPE) exportId: string) {
    return this.exportsService.retry(exportId, user.sub);
  }
}
