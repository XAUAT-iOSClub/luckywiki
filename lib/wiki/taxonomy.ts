const invalidTaxonomyCharacterPattern = /[\u0000-\u001F\u007F]/u;

export function decodeTaxonomyParam(value: string) {
  try {
    const decoded = decodeURIComponent(value).normalize("NFC").trim();

    if (!decoded || invalidTaxonomyCharacterPattern.test(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function decodeCategoryParam(value: string) {
  const category = decodeTaxonomyParam(value);

  if (!category || category.includes("/") || category.includes("\\")) {
    return null;
  }

  return category.toLowerCase();
}
