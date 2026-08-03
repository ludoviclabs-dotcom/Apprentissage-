import { FormulaParseError } from "./errors";
import { MAX_FORMULA_LENGTH } from "./limits";

/**
 * Tokenizer for the bounded formula grammar.
 *
 * The token set is closed: numbers, double-quoted strings, identifiers (which
 * the parser resolves into cell references or function names), and a fixed list
 * of operators. Anything else is a parse error carrying its position, in
 * French, because the person reading it is the learner who just typed the
 * character.
 *
 * Two localisation decisions live here rather than in the parser:
 *
 * - The decimal separator is the dot. French Excel writes `1,5`, but the comma
 *   is also Excel's argument separator, and a grammar where `SOMME(1,5)` could
 *   mean either one number or two is not a grammar a learner can trust. The
 *   grid displays numbers with French formatting; formulas are typed with dots.
 * - Both `;` (French Excel) and `,` (English Excel) separate arguments, and
 *   they are the same token. `SOMME.SI(B2:B10;">0")` and `SUMIF(B2:B10,">0")`
 *   tokenize identically.
 */

export type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator" // + - * / = <> < <= > >=
  | "open-paren"
  | "close-paren"
  | "separator" // , or ;
  | "colon"
  | "end";

export interface Token {
  readonly type: TokenType;
  /** Uppercased for identifiers; raw source text otherwise. */
  readonly text: string;
  /** Zero-based offset into the formula source, for error messages. */
  readonly position: number;
  /** Parsed value for number tokens. */
  readonly numberValue?: number;
  /** Unescaped content for string tokens. */
  readonly stringValue?: string;
}

const IDENTIFIER_START = /[A-Za-z_]/;
/** Dots are allowed inside identifiers for the French names: SOMME.SI.ENS. */
const IDENTIFIER_PART = /[A-Za-z0-9_.$]/;
const DIGIT = /[0-9]/;

/**
 * Strips the leading `=` when present and refuses over-long sources before any
 * scanning happens: the length limit is the first line of defence, so nothing
 * downstream ever sees an unbounded input.
 */
export function prepareFormulaSource(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length > MAX_FORMULA_LENGTH) {
    throw new FormulaParseError(
      `Formule trop longue (${trimmed.length} caractères, maximum ${MAX_FORMULA_LENGTH}).`,
      MAX_FORMULA_LENGTH
    );
  }

  return trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "open-paren", text: "(", position: index });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "close-paren", text: ")", position: index });
      index += 1;
      continue;
    }

    if (char === "," || char === ";") {
      tokens.push({ type: "separator", text: char, position: index });
      index += 1;
      continue;
    }

    if (char === ":") {
      tokens.push({ type: "colon", text: ":", position: index });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "=") {
      tokens.push({ type: "operator", text: char, position: index });
      index += 1;
      continue;
    }

    if (char === "<") {
      const next = source[index + 1];
      const text = next === "=" ? "<=" : next === ">" ? "<>" : "<";
      tokens.push({ type: "operator", text, position: index });
      index += text.length;
      continue;
    }

    if (char === ">") {
      const text = source[index + 1] === "=" ? ">=" : ">";
      tokens.push({ type: "operator", text, position: index });
      index += text.length;
      continue;
    }

    if (char === '"') {
      const start = index;
      let value = "";
      index += 1;

      for (;;) {
        if (index >= source.length) {
          throw new FormulaParseError("Chaîne de caractères non fermée.", start);
        }

        if (source[index] === '"') {
          // Excel escapes a quote by doubling it: "a""b" is a"b.
          if (source[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }

          index += 1;
          break;
        }

        value += source[index];
        index += 1;
      }

      tokens.push({ type: "string", text: source.slice(start, index), position: start, stringValue: value });
      continue;
    }

    if (DIGIT.test(char) || (char === "." && DIGIT.test(source[index + 1] ?? ""))) {
      const start = index;

      while (index < source.length && DIGIT.test(source[index])) {
        index += 1;
      }

      if (source[index] === ".") {
        index += 1;

        while (index < source.length && DIGIT.test(source[index])) {
          index += 1;
        }
      }

      const text = source.slice(start, index);
      const numberValue = Number(text);

      if (!Number.isFinite(numberValue)) {
        throw new FormulaParseError(`Nombre invalide : « ${text} ».`, start);
      }

      tokens.push({ type: "number", text, position: start, numberValue });
      continue;
    }

    if (IDENTIFIER_START.test(char) || char === "$") {
      const start = index;

      while (index < source.length && IDENTIFIER_PART.test(source[index])) {
        index += 1;
      }

      const text = source.slice(start, index).toUpperCase();

      if (text === "" || text === "$") {
        throw new FormulaParseError(`Caractère inattendu : « ${char} ».`, start);
      }

      tokens.push({ type: "identifier", text, position: start });
      continue;
    }

    throw new FormulaParseError(`Caractère inattendu : « ${char} ».`, index);
  }

  tokens.push({ type: "end", text: "", position: source.length });

  return tokens;
}
