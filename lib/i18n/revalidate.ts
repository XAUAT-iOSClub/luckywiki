import { revalidatePath } from "next/cache";
import { localizeHref, locales } from "@/lib/i18n/config";

export function getLocalizedRevalidationPaths(pathname: string) {
  return locales.map((locale) => localizeHref(locale, pathname));
}

export function revalidateLocalizedPath(pathname: string) {
  for (const localizedPath of getLocalizedRevalidationPaths(pathname)) {
    revalidatePath(localizedPath);
  }
}
