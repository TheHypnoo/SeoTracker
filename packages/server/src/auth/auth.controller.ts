import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { Env } from '../config/env.schema';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const CREDENTIAL_THROTTLE = { default: { limit: 5, ttl: 60_000 } } as const;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;
  private readonly configService: ConfigService<Env, true>;

  constructor(
    @Inject(AuthService) authService: unknown,
    @Inject(ConfigService) configService: unknown,
  ) {
    this.authService = authService as AuthService;
    this.configService = configService as ConfigService<Env, true>;
  }

  @Post('register')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: 'Crear cuenta' })
  register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.authService.register(body as RegisterDto, response);
  }

  @Post('login')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: 'Iniciar sesion' })
  login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(body as LoginDto, response);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar access token con refresh token' })
  refresh(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      request.cookies?.[this.configService.get('REFRESH_COOKIE_NAME', { infer: true })];
    const csrfCookie =
      request.cookies?.[this.configService.get('CSRF_COOKIE_NAME', { infer: true })];
    return this.authService.refresh(refreshToken, csrfHeader, csrfCookie, response);
  }

  @Get('session')
  @SkipThrottle({ burst: true, default: true })
  @ApiOperation({ summary: 'Validar sesión sin rotar refresh token' })
  session(@Req() request: Request) {
    const refreshToken =
      request.cookies?.[this.configService.get('REFRESH_COOKIE_NAME', { infer: true })];
    return this.authService.getSession(refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Cerrar sesion' })
  logout(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      request.cookies?.[this.configService.get('REFRESH_COOKIE_NAME', { infer: true })];
    const csrfCookie =
      request.cookies?.[this.configService.get('CSRF_COOKIE_NAME', { infer: true })];
    return this.authService.logout(refreshToken, csrfHeader, csrfCookie, response);
  }

  @Post('password/forgot')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: 'Solicitar email de recuperacion de contraseña' })
  forgotPassword(@Body() body: unknown) {
    return this.authService.requestPasswordReset((body as ForgotPasswordDto).email);
  }

  @Post('password/reset')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  resetPassword(@Body() body: unknown) {
    const { token, password } = body as ResetPasswordDto;
    return this.authService.resetPassword(token, password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado actual' })
  me(@CurrentUser() user: { sub: string; email: string } | undefined) {
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    return {
      email: user.email,
      id: user.sub,
    };
  }
}
