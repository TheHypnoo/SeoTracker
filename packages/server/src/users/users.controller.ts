import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Obtener preferencias del usuario autenticado' })
  getPreferences(@CurrentUser() user: { sub: string }) {
    return this.usersService.getPreferences(user.sub);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Actualizar preferencias del usuario autenticado' })
  updatePreferences(@CurrentUser() user: { sub: string }, @Body() body: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.sub, body);
  }
}
