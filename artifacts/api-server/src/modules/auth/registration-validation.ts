import { ApiError } from "../../middleware/error-handler";

export function assertValidRegistrationPassword(password: string): void {
  const fieldErrors: string[] = [];
  if (password.length < 12) fieldErrors.push("Use at least 12 characters.");
  if (password.length > 128) fieldErrors.push("Use 128 characters or fewer.");
  if (!/[A-Z]/.test(password)) fieldErrors.push("Add an uppercase letter.");
  if (!/[a-z]/.test(password)) fieldErrors.push("Add a lowercase letter.");
  if (!/[0-9]/.test(password)) fieldErrors.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) fieldErrors.push("Add a symbol.");

  if (fieldErrors.length > 0) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Choose a stronger password.",
      { password: fieldErrors },
    );
  }
}
