/**
 * Typed browser -> route-handler client.
 *
 * Every form in this app used to call `fetch` directly, so a rejected request or
 * a non-JSON response left the submit button disabled forever with no message.
 * Going through this helper guarantees two things: the caller always gets a
 * resolved result (never a rejection), and a failure always carries a sentence
 * that can be shown to the user.
 */
export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NETWORK_ERROR = "Requête impossible : vérifie que le serveur local répond.";
const MALFORMED_ERROR = "Réponse illisible du serveur.";

/** Statuses that are defined to carry no body at all. */
const BODILESS_STATUSES = new Set([204, 205, 304]);

/**
 * Reads a JSON body, tolerating responses that legitimately have none.
 *
 * Calling `.json()` unconditionally made every 204 look like a malformed
 * response, which is why signing out reported "réponse illisible" and never
 * navigated even though the server had succeeded.
 */
async function readPayload(response: Response): Promise<{ payload: unknown; malformed: boolean }> {
  if (BODILESS_STATUSES.has(response.status) || response.headers.get("content-length") === "0") {
    return { payload: null, malformed: false };
  }

  try {
    return { payload: await response.json(), malformed: false };
  } catch {
    return { payload: null, malformed: true };
  }
}

function readErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = (payload as { error?: unknown }).error;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return `Erreur ${status}`;
}

export async function postJson<T>(url: string, body: unknown): Promise<JsonResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  return toResult<T>(response);
}

export async function postFormData<T>(url: string, formData: FormData): Promise<JsonResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, { method: "POST", body: formData });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  return toResult<T>(response);
}

async function toResult<T>(response: Response): Promise<JsonResult<T>> {
  const { payload, malformed } = await readPayload(response);

  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, response.status) };
  }

  if (malformed) {
    return { ok: false, error: MALFORMED_ERROR };
  }

  return { ok: true, data: payload as T };
}
