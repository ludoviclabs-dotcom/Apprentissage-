import { domains, learningPath, type DomainId } from "@finance/domain";
import { z } from "zod";

const diagnosticSchema = z.object({
  levels: z.record(z.string(), z.coerce.number().min(0).max(100))
});

function priorityFromLevel(level: number) {
  if (level < 35) {
    return "Reprendre les fondamentaux";
  }

  if (level < 60) {
    return "Consolider par cas guidé";
  }

  return "Passer en entraînement métier";
}

export async function POST(request: Request) {
  const body = diagnosticSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid diagnostic", details: body.error.flatten() }, { status: 400 });
  }

  const priorities = domains
    .map((domain) => {
      const level = body.data.levels[domain.id] ?? 0;

      return {
        domainId: domain.id as DomainId,
        domain: domain.name,
        level,
        priority: priorityFromLevel(level)
      };
    })
    .sort((left, right) => left.level - right.level);

  return Response.json({
    recommendedStart: priorities[0],
    priorities,
    path: {
      ...learningPath,
      goal: "Parcours recalibré depuis le diagnostic saisi."
    }
  });
}
