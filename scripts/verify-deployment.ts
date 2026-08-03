import { pathToFileURL } from "node:url";

export const DEPLOYMENT_PATHS = [
  "/",
  "/api/health",
  "/parcours",
  "/modules/comptabilite-generale",
  "/modules/excel-finance-lab",
  "/billing",
  "/attestations"
] as const;

export const REQUIRED_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "cross-origin-opener-policy": "same-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains"
} as const;

const SENSITIVE_RESPONSE_PATTERNS = [
  { label: "Stripe secret key", pattern: /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+\b/ },
  { label: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9_]+\b/ },
  { label: "PostgreSQL connection string", pattern: /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/i },
  { label: "stack trace", pattern: /\n\s*at\s+[^\n]+\([^\n]+\)/ },
  { label: "Node error stack", pattern: /\b(?:Type|Reference|Syntax|Range|Aggregate)?Error:\s+.+\n\s*at\s+/ }
] as const;

export interface DeploymentCheck {
  path: string;
  status: number;
  issues: string[];
}

export function parseDeploymentUrl(value: string | undefined): URL {
  if (!value) {
    throw new Error("Usage: pnpm verify:deployment -- https://your-deployment.example");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("The deployment URL must be an absolute http(s) URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The deployment URL must use http or https.");
  }

  return url;
}

/** pnpm keeps its `--` separator in argv when forwarding a script argument. */
export function deploymentUrlArgument(args: readonly string[]): string | undefined {
  return args.find((argument) => argument !== "--");
}

export function inspectDeploymentResponse(path: string, response: Response, body: string): DeploymentCheck {
  const issues: string[] = [];

  if (response.status >= 400) {
    issues.push(`unexpected HTTP ${response.status}`);
  }

  for (const [header, expected] of Object.entries(REQUIRED_SECURITY_HEADERS)) {
    if (response.headers.get(header) !== expected) {
      issues.push(`missing or unexpected ${header}`);
    }
  }

  for (const candidate of SENSITIVE_RESPONSE_PATTERNS) {
    if (candidate.pattern.test(body)) {
      issues.push(`response contains ${candidate.label}`);
    }
  }

  return { path, status: response.status, issues };
}

async function requestWithTimeout(url: URL): Promise<Response> {
  const signal = AbortSignal.timeout(15_000);

  return fetch(url, {
    headers: { "user-agent": "finance-learning-hub-deployment-verifier" },
    redirect: "manual",
    signal
  });
}

export async function verifyDeployment(baseUrl: URL): Promise<DeploymentCheck[]> {
  return Promise.all(
    DEPLOYMENT_PATHS.map(async (path) => {
      const url = new URL(path, baseUrl);

      try {
        const response = await requestWithTimeout(url);
        const body = await response.text();

        return inspectDeploymentResponse(path, response, body);
      } catch (error) {
        return {
          path,
          status: 0,
          issues: [error instanceof Error ? `request failed: ${error.name}` : "request failed"]
        };
      }
    })
  );
}

async function main() {
  const checks = await verifyDeployment(parseDeploymentUrl(deploymentUrlArgument(process.argv.slice(2))));
  let failed = false;

  for (const check of checks) {
    const result = check.issues.length === 0 ? "ok" : check.issues.join("; ");
    console.log(`${check.path} ${check.status || "network-error"} ${result}`);
    failed ||= check.issues.length > 0;
  }

  if (failed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
