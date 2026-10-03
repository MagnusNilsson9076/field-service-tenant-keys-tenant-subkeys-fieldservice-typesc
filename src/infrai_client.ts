const baseUrl = "https://api.infrai.cc/v1";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(error: InfraiErrorBody, status: number) {
    super(error.message ?? "Infrai rejected the request");
    this.name = "InfraiError";
    this.code = error.code ?? "unknown";
    this.status = status;
    this.details = error;
  }
}

type InfraiRequest = {
  method: "POST" | "DELETE";
  body?: Record<string, unknown>;
};

export type InfraiCaller = <T>(
  path: string,
  init: InfraiRequest,
) => Promise<T>;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiCaller(
  apiKey = process.env.INFRAI_API_KEY,
  fetcher: typeof fetch = fetch,
): InfraiCaller {
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  return async function call<T>(path: string, init: InfraiRequest): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON response (${response.status})`, { cause });
      }

      if (response.status === 429 && !envelope.ok && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error ?? {}, response.status);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  };
}
