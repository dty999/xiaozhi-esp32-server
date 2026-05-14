import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 类名合并工具，支持条件类名与冲突去重 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
