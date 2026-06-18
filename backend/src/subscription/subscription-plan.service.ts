import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlansDto } from './dto/update-plans.dto';

@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async updatePlans(dto: UpdatePlansDto) {
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const plan of dto.plans) {
        if (plan.id) {
          const updated = await tx.subscriptionPlan.update({
            where: { id: plan.id },
            data: {
              name: plan.name,
              price: plan.price,
              periodDays: plan.periodDays,
              active: plan.active,
            },
          });
          results.push(updated);
        } else {
          const created = await tx.subscriptionPlan.create({
            data: {
              name: plan.name,
              price: plan.price,
              periodDays: plan.periodDays,
              active: plan.active,
            },
          });
          results.push(created);
        }
      }
      return results;
    });
  }
}
