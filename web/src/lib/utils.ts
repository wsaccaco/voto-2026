import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Con pocos votos no se muestran los conteos (solo %) para no desincentivar la
// participación; a partir de este total aparecen los números de votos.
export const VOTES_THRESHOLD = 100

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
