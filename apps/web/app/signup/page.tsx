import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = {
  title: "Inscription",
  description: "Créer un compte pour une progression privée et persistante."
};

export default async function SignupPage({
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
      <AuthForm mode="signup" auth={getFeatures().auth} nextPath={nextPath} />
    </div>
  );
}
