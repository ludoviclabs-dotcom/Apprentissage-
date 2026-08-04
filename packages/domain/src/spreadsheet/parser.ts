import {
  FUNCTION_ALIASES,
  type FormulaNode,
  type BinaryOperator,
  type RefNode
} from "./ast";
import { FormulaParseError } from "./errors";
import { MAX_AST_DEPTH, MAX_CALL_ARGS } from "./limits";
import { columnIndex, isWithinSheet } from "./refs";
import { prepareFormulaSource, tokenize, type Token } from "./tokenizer";

/**
 * Recursive-descent parser for the bounded grammar:
 *
 *   comparison := additive (("=" | "<>" | "<" | "<=" | ">" | ">=") additive)*
 *   additive   := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := unary (("*" | "/") unary)*
 *   unary      := ("+" | "-") unary | primary
 *   primary    := number | string | reference | range | call | "(" comparison ")"
 *
 * The grammar is everything the engine will ever run. There is no identifier
 * lookup outside `FUNCTION_ALIASES`, no member access, no way to name anything
 * that is not a cell, a range or one of seven functions — which is what "no
 * arbitrary execution" means concretely: the language cannot express it.
 */

const REFERENCE_PATTERN = /^(\$?)([A-Z]{1,3})(\$?)([1-9][0-9]*)$/;

class Parser {
  private readonly tokens: Token[];
  private index = 0;
  private depth = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): FormulaNode {
    const node = this.comparison();
    const token = this.peek();

    if (token.type !== "end") {
      throw new FormulaParseError(
        `Élément inattendu « ${token.text} » après la fin de l'expression.`,
        token.position
      );
    }

    return node;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private enter(): void {
    this.depth += 1;

    if (this.depth > MAX_AST_DEPTH) {
      throw new FormulaParseError(
        `Formule trop imbriquée (profondeur maximale ${MAX_AST_DEPTH}).`,
        this.peek().position
      );
    }
  }

  private leave(): void {
    this.depth -= 1;
  }

  private comparison(): FormulaNode {
    this.enter();
    let left = this.additive();

    while (this.peek().type === "operator" && isComparison(this.peek().text)) {
      const op = this.next().text as BinaryOperator;
      left = { kind: "binary", op, left, right: this.additive() };
    }

    this.leave();
    return left;
  }

  private additive(): FormulaNode {
    this.enter();
    let left = this.multiplicative();

    while (this.peek().type === "operator" && (this.peek().text === "+" || this.peek().text === "-")) {
      const op = this.next().text as BinaryOperator;
      left = { kind: "binary", op, left, right: this.multiplicative() };
    }

    this.leave();
    return left;
  }

  private multiplicative(): FormulaNode {
    this.enter();
    let left = this.unary();

    while (this.peek().type === "operator" && (this.peek().text === "*" || this.peek().text === "/")) {
      const op = this.next().text as BinaryOperator;
      left = { kind: "binary", op, left, right: this.unary() };
    }

    this.leave();
    return left;
  }

  private unary(): FormulaNode {
    const token = this.peek();

    if (token.type === "operator" && (token.text === "+" || token.text === "-")) {
      this.enter();
      this.next();
      const node: FormulaNode = { kind: "unary", op: token.text, operand: this.unary() };
      this.leave();
      return node;
    }

    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.next();

    switch (token.type) {
      case "number":
        return { kind: "number", value: token.numberValue as number };

      case "string":
        return { kind: "string", value: token.stringValue as string };

      case "open-paren": {
        this.enter();
        const inner = this.comparison();
        const closing = this.next();

        if (closing.type !== "close-paren") {
          throw new FormulaParseError("Parenthèse fermante manquante.", closing.position);
        }

        this.leave();
        return inner;
      }

      case "identifier":
        return this.identifier(token);

      case "end":
        throw new FormulaParseError("Expression incomplète.", token.position);

      default:
        throw new FormulaParseError(`Élément inattendu : « ${token.text} ».`, token.position);
    }
  }

  /** An identifier is a function call when `(` follows, a reference otherwise. */
  private identifier(token: Token): FormulaNode {
    if (this.peek().type === "open-paren") {
      return this.call(token);
    }

    const ref = parseReference(token);

    if (!ref) {
      throw new FormulaParseError(
        `« ${token.text} » n'est ni une référence de cellule ni une fonction connue.`,
        token.position
      );
    }

    if (this.peek().type === "colon") {
      this.next();
      const endToken = this.next();
      const end = endToken.type === "identifier" ? parseReference(endToken) : null;

      if (!end) {
        throw new FormulaParseError(
          `Une plage doit se terminer par une référence de cellule (ex. B2:B10).`,
          endToken.position
        );
      }

      return normalizeRange(ref, end);
    }

    return ref;
  }

  private call(nameToken: Token): FormulaNode {
    this.enter();
    this.next(); // consume "("

    const args: FormulaNode[] = [];

    if (this.peek().type === "close-paren") {
      this.next();
    } else {
      for (;;) {
        args.push(this.comparison());

        if (args.length > MAX_CALL_ARGS) {
          throw new FormulaParseError(
            `Trop d'arguments (maximum ${MAX_CALL_ARGS}).`,
            this.peek().position
          );
        }

        const token = this.next();

        if (token.type === "close-paren") {
          break;
        }

        if (token.type !== "separator") {
          throw new FormulaParseError(
            `Séparateur d'arguments attendu, trouvé « ${token.text} ».`,
            token.position
          );
        }
      }
    }

    this.leave();

    const known = FUNCTION_ALIASES[nameToken.text] ?? null;

    return { kind: "call", name: nameToken.text, known, args };
  }
}

function isComparison(text: string): boolean {
  return text === "=" || text === "<>" || text === "<" || text === "<=" || text === ">" || text === ">=";
}

function parseReference(token: Token): RefNode | null {
  const match = REFERENCE_PATTERN.exec(token.text);

  if (!match) {
    return null;
  }

  const address = { column: columnIndex(match[2]), row: Number(match[4]) };

  if (!isWithinSheet(address)) {
    // Out-of-sheet is a *reference* problem, not a syntax one, but at parse
    // time the distinction has no audience: the reference can never designate
    // a cell, so refusing it immediately gives the error a position.
    throw new FormulaParseError(
      `La référence ${token.text} sort des limites de la feuille.`,
      token.position
    );
  }

  return {
    kind: "ref",
    address,
    absoluteColumn: match[1] === "$",
    absoluteRow: match[3] === "$"
  };
}

/** `B10:B2` and `B2:B10` are the same range; the corner order is normalised. */
function normalizeRange(a: RefNode, b: RefNode): FormulaNode {
  const startAddress = {
    column: Math.min(a.address.column, b.address.column),
    row: Math.min(a.address.row, b.address.row)
  };
  const endAddress = {
    column: Math.max(a.address.column, b.address.column),
    row: Math.max(a.address.row, b.address.row)
  };

  const start: RefNode = { ...a, address: startAddress };
  const end: RefNode = { ...b, address: endAddress };

  return { kind: "range", start, end };
}

/**
 * Parses a formula source (`=B2+B3` or `B2+B3`) into its AST.
 *
 * Throws `FormulaParseError` — with a position and a French message — when the
 * text is not a sentence of the grammar. Never returns a partial tree.
 */
export function parseFormula(raw: string): FormulaNode {
  const source = prepareFormulaSource(raw);

  if (source === "") {
    throw new FormulaParseError("Formule vide.", 0);
  }

  return new Parser(tokenize(source)).parse();
}
