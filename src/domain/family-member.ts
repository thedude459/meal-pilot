import { validationError } from "./errors.js";

export const MAX_HOUSEHOLD_MEMBERS = 12;

export type FamilyMember = {
  id: string;
  householdId: string;
  displayName: string;
  displayNameKey: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

export function toDisplayNameKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

export function assertValidDisplayName(raw: string): string {
  const displayName = normalizeDisplayName(raw);
  if (displayName.length === 0) {
    throw validationError("Display name is required");
  }
  return displayName;
}
