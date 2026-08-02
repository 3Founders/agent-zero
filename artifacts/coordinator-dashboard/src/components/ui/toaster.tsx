/**
 * This file replaces the default toaster if not present, to prevent breaking
 * if it's imported but doesn't exist.
 */
export function Toaster() {
  return null;
}
