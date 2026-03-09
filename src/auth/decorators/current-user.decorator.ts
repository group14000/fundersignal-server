import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const auth = getAuth(request);
    return auth;
  },
);
