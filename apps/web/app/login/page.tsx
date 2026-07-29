import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { getFeatures } from "@/lib/features";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(next);

  if (await getCurrentUser()) {
    redirect(nextPath);
  }

  return (
    <div className="page-stack">
      <AuthForm mode="login" auth={getFeatures().auth} nextPath={nextPath} />
    </div>
  );
}
