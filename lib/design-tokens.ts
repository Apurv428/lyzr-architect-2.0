// Reads brand design tokens from CSS custom properties, W3C Design Token JSON (`$value`), Figma
// variable exports or plain `{ "primary": "#4f46e5" }` JSON, and keeps what the builder can use:
// colours, font families and a corner radius.

export type DesignTokens = {
  source: string;
  colors: { name: string; value: string }[];
  fonts: string[];
  radius: string | null;
  importedAt: string;
};

const MAX_COLORS = 16;
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\))$/i;
// shadcn-style bare HSL channels: "222.2 84% 4.9%"
const HSL_CHANNELS = /^-?\d+(\.\d+)?(deg)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%(\s*\/\s*[\d.]+%?)?$/;
const COLORISH_NAME = /(color|colour|bg|background|foreground|primary|secondary|accent|brand|muted|border|ring|surface|text|success|warning|danger|destructive|info|neutral|gray|grey)/i;

const tidyName = (name: string) => name.replace(/^-+/, "").replace(/[._/\s]+/g, "-").replace(/-+/g, "-").toLowerCase();

function flattenJson(value: unknown, path: string[] = [], out: [string, string][] = []): [string, string][] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // W3C / Style Dictionary / Figma exports keep the value under $value or value.
    const leaf = "$value" in obj ? obj.$value : "value" in obj && typeof obj.value !== "object" ? obj.value : undefined;
    if (leaf !== undefined) {
      if (typeof leaf === "string" || typeof leaf === "number") out.push([path.join("-"), String(leaf)]);
      else if (Array.isArray(leaf)) out.push([path.join("-"), leaf.join(", ")]);
      return out;
    }
    for (const [k, v] of Object.entries(obj)) if (!k.startsWith("$")) flattenJson(v, [...path, k], out);
  } else if (typeof value === "string" || typeof value === "number") {
    out.push([path.join("-"), String(value)]);
  }
  return out;
}

function pairsFromCss(text: string): [string, string][] {
  return [...text.matchAll(/--([\w-]+)\s*:\s*([^;{}]+)/g)].map((m) => [m[1], m[2].trim()]);
}

/** Parses tokens from CSS or JSON text. Throws when nothing usable is found. */
export function parseDesignTokens(text: string, source: string): DesignTokens {
  let pairs: [string, string][] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      pairs = flattenJson(JSON.parse(trimmed));
    } catch {
      throw new Error("That JSON couldn't be read.");
    }
  } else {
    pairs = pairsFromCss(text);
  }

  // Resolve one level of var(--x) / {group.token} references.
  const byName = new Map(pairs.map(([n, v]) => [tidyName(n), v]));
  const resolve = (v: string) => {
    const ref = v.match(/^var\(--([\w-]+)\)$/)?.[1] ?? v.match(/^\{([\w.-]+)\}$/)?.[1];
    return ref ? (byName.get(tidyName(ref)) ?? v) : v;
  };

  const colors: DesignTokens["colors"] = [];
  const fonts = new Set<string>();
  let radius: string | null = null;
  for (const [rawName, rawValue] of pairs) {
    const name = tidyName(rawName);
    const value = resolve(rawValue.replace(/\s*!important$/, "").trim());
    if (/font/.test(name) && /(family|sans|serif|mono|body|heading|display)/.test(name) && !/size|weight|height/.test(name)) {
      const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
      if (first && !/^var\(/.test(first) && first.length < 60) fonts.add(first);
      continue;
    }
    if (/radius|rounded/.test(name) && !radius && /^[\d.]+(px|rem|em)$/.test(value)) {
      radius = value;
      continue;
    }
    const color = COLOR_VALUE.test(value) ? value : HSL_CHANNELS.test(value) && COLORISH_NAME.test(name) ? `hsl(${value})` : null;
    if (color && colors.length < MAX_COLORS && !colors.some((c) => c.name === name)) colors.push({ name, value: color });
  }

  if (!colors.length && !fonts.size && !radius) throw new Error("No colours, fonts or radius found. Use CSS variables or design-token JSON.");
  return { source: source.slice(0, 120), colors, fonts: [...fonts].slice(0, 3), radius, importedAt: new Date().toISOString() };
}

/** The line the builder adds to every turn, so generated apps follow the brand. */
export function tokensForPrompt(tokens: DesignTokens | null | undefined) {
  if (!tokens) return "";
  const parts = [
    tokens.colors.length ? `colours ${tokens.colors.map((c) => `${c.name} ${c.value}`).join("; ")}` : "",
    tokens.fonts.length ? `fonts ${tokens.fonts.join(", ")}` : "",
    tokens.radius ? `corner radius ${tokens.radius}` : "",
  ].filter(Boolean);
  return parts.length
    ? `Brand design tokens: ${parts.join(" · ")}. Use them instead of the default palette, with Tailwind arbitrary values (e.g. bg-[#4f46e5], rounded-[0.75rem], font-['Inter']).`
    : "";
}
