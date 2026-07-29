import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { resolveWriteUser } from "@/lib/auth/current-user";
import { submitBusinessCaseAttempt } from "@finance/db";
import { z } from "zod";

const businessCaseSubmitSchema = z.object({
  userMemo: z.string().min(24)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const [{ id }, body] = await Promise.all([context.params, businessCaseSubmitSchema.safeParse(await request.json())]);

  if (!body.success) {
    return Response.json({ error: "Invalid business case submission", details: body.error.flatten() }, { status: 400 });
  }

  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  const attempt = await submitBusinessCaseAttempt(writer.userId ?? "", id, body.data.userMemo);

  if (!attempt) {
    return Response.json({ error: "Business case not found" }, { status: 404 });
  }

  return Response.json({ attempt });
}
