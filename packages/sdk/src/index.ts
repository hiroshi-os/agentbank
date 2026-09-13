export type AgentBankClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export class AgentBankError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "AgentBankError";
  }
}

export class AgentBankClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AgentBankClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : `AgentBank request failed (${response.status})`;
      throw new AgentBankError(message, response.status, body);
    }
    return body as T;
  }

  me() {
    return this.request<Record<string, unknown>>("/api/v1/me");
  }

  balance() {
    return this.request<Record<string, unknown>>("/api/v1/balance");
  }

  transactions(limit = 25) {
    return this.request<Record<string, unknown>>(`/api/v1/transactions?limit=${limit}`);
  }

  salary() {
    return this.request<Record<string, unknown>>("/api/v1/salary");
  }

  notifications(unread = false) {
    return this.request<Record<string, unknown>>(`/api/v1/notifications${unread ? "?unread=1" : ""}`);
  }

  markNotificationRead(id: string) {
    return this.request<Record<string, unknown>>(`/api/v1/notifications/${id}/read`, { method: "POST" });
  }

  cards() {
    return this.request<Record<string, unknown>>("/api/v1/cards");
  }

  merchants() {
    return this.request<Record<string, unknown>>("/api/v1/merchants");
  }

  purchase(input: {
    merchantId?: string;
    merchantSlug?: string;
    amountAgc: number;
    memo?: string;
    cardId?: string;
  }) {
    return this.request<Record<string, unknown>>("/api/v1/purchases", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  transfer(input: { toHandle?: string; to?: "checking" | "savings"; from?: "checking" | "savings"; amountAgc: number; memo?: string }) {
    return this.request<Record<string, unknown>>("/api/v1/transfers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

export function agentBankFromEnv() {
  const baseUrl = process.env.AGENTBANK_BASE_URL;
  const apiKey = process.env.AGENTBANK_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Set AGENTBANK_BASE_URL and AGENTBANK_API_KEY");
  }
  return new AgentBankClient({ baseUrl, apiKey });
}
