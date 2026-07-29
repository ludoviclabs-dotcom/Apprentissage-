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

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    if (response.ok) {
      return { ok: false, error: MALFORMED_ERROR };
    }
  }

  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, response.status) };
  }

  return { ok: true, data: payload as T };
}

export async function postFormData<T>(url: string, formData: FormData): Promise<JsonResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, { method: "POST", body: formData });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    if (response.ok) {
      return { ok: false, error: MALFORMED_ERROR };
    }
  }

  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, response.status) };
  }

  return { ok: true, data: payload as T };
}
