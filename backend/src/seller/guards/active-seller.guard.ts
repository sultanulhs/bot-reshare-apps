import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActiveSellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.sub;

    const seller = await this.prisma.seller.findUnique({
      where: { userId },
    });

    if (!seller || seller.status !== 'ACTIVE') {
      throw new ForbiddenException('Seller must be ACTIVE to perform this action');
    }

    request.seller = seller;
    return true;
  }
}
