export type TokenMap = Record<string, string>;

export function render(template: string, tokens: TokenMap): string {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}
