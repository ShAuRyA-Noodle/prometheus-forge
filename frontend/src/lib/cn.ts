/**
 * cn — class merging helper.
 * Combines clsx (conditional class names) with tailwind-merge (deduplicates conflicting tailwind classes).
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
