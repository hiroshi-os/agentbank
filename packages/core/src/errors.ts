export class BankError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "BankError";
  }
}

export const Errors = {
  notFound: (entity: string) => new BankError(`${entity} not found`, "not_found", 404),
  insufficientFunds: (need: string, have: string) =>
    new BankError(`Insufficient funds: need ${need}, have ${have}`, "insufficient_funds", 402),
  cardDeclined: (reason: string) => new BankError(reason, "card_declined", 402),
  unauthorized: () => new BankError("Invalid or missing agent API key", "unauthorized", 401),
  conflict: (message: string) => new BankError(message, "conflict", 409),
  invalid: (message: string) => new BankError(message, "invalid_request", 400),
  frozen: (message: string) => new BankError(message, "account_frozen", 403),
};
