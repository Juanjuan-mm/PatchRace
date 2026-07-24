export function tokenizeArguments(input: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  let active = false;
  for (const character of input.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      active = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      active = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else current += character;
      active = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      active = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (active) {
        tokens.push(current);
        current = "";
        active = false;
      }
      continue;
    }
    current += character;
    active = true;
  }
  if (escaping)
    throw new Error("Command arguments end with an incomplete escape.");
  if (quote !== null)
    throw new Error("Command arguments contain an unclosed quote.");
  if (active) tokens.push(current);
  return tokens;
}

export function parseNamedOptions(
  tokens: readonly string[],
  allowed: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (name === undefined || !name.startsWith("--") || !allowed.has(name))
      throw new Error(
        `Unsupported option '${name ?? ""}'. Expected ${[...allowed].join(", ")}.`,
      );
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Option '${name}' requires a value.`);
    if (options.has(name))
      throw new Error(`Option '${name}' was provided twice.`);
    options.set(name, value);
  }
  return options;
}
