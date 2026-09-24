// Light / Dark / System. The choice is kept in a cookie so the server can
// render <html data-theme> with the right value on the first byte (no
// flash of the wrong theme); "system" leaves the attribute off and the CSS
// follows prefers-color-scheme.
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

// Browser UI colour (<meta name="theme-color">), matching --background.
export const THEME_COLORS = { light: "#fafafa", dark: "#09090b" } as const;
