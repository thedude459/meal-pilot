export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DUPLICATE_NAME: "DUPLICATE_NAME",
  MEMBER_LIMIT: "MEMBER_LIMIT",
  UNKNOWN_RESTRICTION: "UNKNOWN_RESTRICTION",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function validationError(message: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, message, 400);
}

export function duplicateNameError(message = "A family member with this name already exists"): DomainError {
  return new DomainError(ErrorCode.DUPLICATE_NAME, message, 409);
}

export function memberLimitError(message = "Household member limit of 12 reached"): DomainError {
  return new DomainError(ErrorCode.MEMBER_LIMIT, message, 409);
}

export function unknownRestrictionError(id: string): DomainError {
  return new DomainError(
    ErrorCode.UNKNOWN_RESTRICTION,
    `Unknown dietary restriction: ${id}`,
    400,
  );
}

export function notFoundError(message = "Family member not found"): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, message, 404);
}
