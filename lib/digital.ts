import { z } from "zod";
import { apply, gates, type Gate } from "./logic";
export type CircuitNode = { id: string; gate: Gate; inputs: string[] };
export type Circuit = {
  name: string;
  inputs: string[];
  nodes: CircuitNode[];
  outputs: Record<string, string>;
};
export const circuitSchema = z
  .object({
    name: z.string().min(1).max(100),
    inputs: z
      .array(z.enum(["A", "B", "C", "D"]))
      .min(1)
      .max(4),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^g\d{1,2}$/),
            gate: z.enum(gates),
            inputs: z.array(z.string()).min(1).max(2),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    outputs: z.record(
      z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/),
      z.string(),
    ),
  })
  .strict()
  .superRefine((c, ctx) => {
    const seen = new Set(["0", "1", ...c.inputs]);
    if (new Set(c.inputs).size !== c.inputs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate input" });
    for (const n of c.nodes) {
      if (
        seen.has(n.id) ||
        n.inputs.some((i) => !seen.has(i)) ||
        n.inputs.length !== (["NOT", "BUFFER"].includes(n.gate) ? 1 : 2)
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid wiring, duplicate id, or gate arity",
        });
      seen.add(n.id);
    }
    if (
      Object.keys(c.outputs).length < 1 ||
      Object.keys(c.outputs).length > 8 ||
      Object.values(c.outputs).some((i) => !seen.has(i))
    )
      ctx.addIssue({ code: "custom", message: "Choose 1–8 valid outputs" });
  });
export function simulate(c: Circuit, values: Record<string, boolean>) {
  const s: Record<string, boolean> = { ...values, "0": false, "1": true };
  for (const i of c.inputs) s[i] = !!values[i];
  for (const n of c.nodes)
    s[n.id] = apply(n.gate, s[n.inputs[0]], s[n.inputs[1]]);
  return s;
}
export function circuitTable(c: Circuit) {
  return Array.from({ length: 2 ** c.inputs.length }, (_, i) => {
    const values = Object.fromEntries(
      c.inputs.map((k, j) => [k, !!(i & (1 << (c.inputs.length - j - 1)))]),
    );
    const signals = simulate(c, values);
    return {
      values,
      outputs: Object.fromEntries(
        Object.entries(c.outputs).map(([name, ref]) => [name, signals[ref]]),
      ),
    };
  });
}
// Small recursive-descent Boolean parser. User expressions are never executed as JS.
export function compileExpressions(
  name: string,
  expressions: Record<string, string>,
  inputs = ["A", "B", "C", "D"],
): Circuit {
  const nodes: CircuitNode[] = [];
  function gate(g: Gate, refs: string[]) {
    if (nodes.length >= 32) throw Error("Use at most 32 gates.");
    const id = "g" + (nodes.length + 1);
    nodes.push({ id, gate: g, inputs: refs });
    return id;
  }
  function parse(expression: string) {
    if (!expression.trim() || expression.length > 1200)
      throw Error("Enter an expression up to 1,200 characters.");
    const tokens =
      expression
        .toUpperCase()
        .match(/XNOR|NAND|NOR|XOR|AND|NOT|OR|[A-D01()!~&*.+|^']/g) || [];
    if (tokens.join("") !== expression.toUpperCase().replace(/\s/g, ""))
      throw Error(
        "Use A–D, 0/1, AND/OR/XOR/NOT, +, *, ^, !, parentheses or postfix apostrophes.",
      );
    let pos = 0;
    const unary = (): string => {
      let ref: string;
      const t = tokens[pos++];
      if (t === "!" || t === "~" || t === "NOT") ref = gate("NOT", [unary()]);
      else if (t === "(") {
        ref = or();
        if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
      } else if (t && (["0", "1"].includes(t) || inputs.includes(t))) ref = t;
      else throw Error("Expected an input, constant, NOT or parenthesis.");
      while (tokens[pos] === "'") {
        pos++;
        ref = gate("NOT", [ref]);
      }
      return ref;
    };
    const and = (): string => {
      let ref = unary();
      while (["AND", "NAND", "&", "*", "."].includes(tokens[pos])) {
        const op = tokens[pos++];
        ref = gate(op === "NAND" ? "NAND" : "AND", [ref, unary()]);
      }
      return ref;
    };
    const xor = (): string => {
      let ref = and();
      while (["XOR", "XNOR", "^"].includes(tokens[pos])) {
        const op = tokens[pos++];
        ref = gate(op === "XNOR" ? "XNOR" : "XOR", [ref, and()]);
      }
      return ref;
    };
    const or = (): string => {
      let ref = xor();
      while (["OR", "NOR", "+", "|"].includes(tokens[pos])) {
        const op = tokens[pos++];
        ref = gate(op === "NOR" ? "NOR" : "OR", [ref, xor()]);
      }
      return ref;
    };
    const ref = or();
    if (pos !== tokens.length)
      throw Error("Unexpected token. Put an AND operator between variables.");
    return ref;
  }
  const outputs = Object.fromEntries(
    Object.entries(expressions).map(([label, expression]) => [
      label,
      parse(expression),
    ]),
  );
  if (!nodes.length) gate("BUFFER", [Object.values(outputs)[0]]);
  return circuitSchema.parse({ name, inputs, nodes, outputs });
}
export const presets: {
  name: string;
  detail: string;
  inputs: string[];
  expressions: Record<string, string>;
}[] = [
  {
    name: "Half adder",
    detail: "Add A and B. Sum = A XOR B; Carry = A AND B.",
    inputs: ["A", "B"],
    expressions: { Sum: "A XOR B", Carry: "A AND B" },
  },
  {
    name: "Full adder",
    detail: "Add A, B and carry-in C. Sum and carry-out update together.",
    inputs: ["A", "B", "C"],
    expressions: {
      Sum: "A XOR B XOR C",
      Carry: "(A AND B) OR (C AND (A XOR B))",
    },
  },
  {
    name: "Half subtractor",
    detail: "Compute A − B. Borrow is high when A=0 and B=1.",
    inputs: ["A", "B"],
    expressions: { Difference: "A XOR B", Borrow: "NOT A AND B" },
  },
  {
    name: "Full subtractor",
    detail: "Compute A − B − borrow-in C.",
    inputs: ["A", "B", "C"],
    expressions: {
      Difference: "A XOR B XOR C",
      Borrow: "(NOT A AND B) OR (C AND NOT(A XOR B))",
    },
  },
  {
    name: "2-to-1 multiplexer",
    detail: "C selects the source: 0 routes A; 1 routes B.",
    inputs: ["A", "B", "C"],
    expressions: { Y: "(A AND NOT C) OR (B AND C)" },
  },
  {
    name: "1-to-2 demultiplexer",
    detail: "Route data A to Y0 or Y1 using select B.",
    inputs: ["A", "B"],
    expressions: { Y0: "A AND NOT B", Y1: "A AND B" },
  },
  {
    name: "2-to-4 decoder",
    detail: "Two-bit input AB activates exactly one output.",
    inputs: ["A", "B"],
    expressions: {
      Y0: "NOT A AND NOT B",
      Y1: "NOT A AND B",
      Y2: "A AND NOT B",
      Y3: "A AND B",
    },
  },
  {
    name: "4-to-2 priority encoder",
    detail:
      "D has highest priority, then C, B, A. Valid distinguishes no active input from A.",
    inputs: ["A", "B", "C", "D"],
    expressions: {
      Bit1: "D OR C",
      Bit0: "D OR (B AND NOT C)",
      Valid: "A OR B OR C OR D",
    },
  },
  {
    name: "1-bit comparator",
    detail: "Compare A against B: greater, equal or less.",
    inputs: ["A", "B"],
    expressions: {
      Greater: "A AND NOT B",
      Equal: "A XNOR B",
      Less: "NOT A AND B",
    },
  },
  {
    name: "Odd parity generator",
    detail: "Parity Y is high for an odd number of high inputs.",
    inputs: ["A", "B", "C", "D"],
    expressions: { Y: "A XOR B XOR C XOR D" },
  },
  {
    name: "NAND universality",
    detail:
      "A pair of inversions plus NAND implements OR using only NAND gates.",
    inputs: ["A", "B"],
    expressions: { Y: "(A NAND A) NAND (B NAND B)" },
  },
  {
    name: "Binary to Gray",
    detail: "Convert the four-bit binary number ABCD into Gray code.",
    inputs: ["A", "B", "C", "D"],
    expressions: { G3: "A", G2: "A XOR B", G1: "B XOR C", G0: "C XOR D" },
  },
];
export type Cell = 0 | 1 | "X";
export type Implicant = { pattern: string; cells: number[]; term: string };
export function grayOrder(bits: number) {
  return Array.from({ length: 2 ** bits }, (_, i) => i ^ (i >> 1));
}
export function cubeMatches(pattern: string, index: number) {
  const bits = index.toString(2).padStart(pattern.length, "0");
  return [...pattern].every((b, i) => b === "-" || b === bits[i]);
}
export function termFor(pattern: string, pos = false) {
  const vars = ["A", "B", "C", "D"];
  const literals = [...pattern].flatMap((v, i) =>
    v === "-" ? [] : [vars[i] + ((pos ? v === "1" : v === "0") ? "'" : "")],
  );
  return literals.length
    ? pos
      ? "(" + literals.join(" + ") + ")"
      : literals.join(" · ")
    : pos
      ? "0"
      : "1";
}
// Enumerate every valid cube (at most 81), then solve exact cover by term count,
// breaking ties by literal count. Don't-cares may be covered but never required.
export function minimize(
  cells: Cell[],
  variables: number,
  pos = false,
): { expression: string; groups: Implicant[] } {
  if (
    ![2, 3, 4].includes(variables) ||
    cells.length !== 2 ** variables ||
    cells.some((c) => ![0, 1, "X"].includes(c))
  )
    throw Error("Use a valid 2–4 variable truth table.");
  const target = pos ? 0 : 1,
    required = cells.flatMap((c, i) => (c === target ? [i] : []));
  if (!required.length) return { expression: pos ? "1" : "0", groups: [] };
  let patterns = [""];
  for (let i = 0; i < variables; i++)
    patterns = patterns.flatMap((s) => ["0", "1", "-"].map((v) => s + v));
  const valid = patterns.filter(
    (s) =>
      required.some((i) => cubeMatches(s, i)) &&
      cells.every((c, i) => !cubeMatches(s, i) || c === target || c === "X"),
  );
  const primes = valid.filter(
    (s) =>
      ![...s].some(
        (v, i) =>
          v !== "-" && valid.includes(s.slice(0, i) + "-" + s.slice(i + 1)),
      ),
  );
  const masks = primes.map((s) =>
    required.reduce(
      (m, index, j) => (cubeMatches(s, index) ? m | (1 << j) : m),
      0,
    ),
  );
  const all = (1 << required.length) - 1;
  const memo = new Map<number, number[]>();
  const cost = (a: number[]) => [
    a.length,
    a.reduce((n, i) => n + [...primes[i]].filter((c) => c !== "-").length, 0),
  ];
  const solve = (covered: number): number[] => {
    if (covered === all) return [];
    const cached = memo.get(covered);
    if (cached) return cached;
    const missing = required.findIndex((_, j) => !(covered & (1 << j)));
    let best: number[] | undefined;
    for (let i = 0; i < primes.length; i++) {
      if (!(masks[i] & (1 << missing))) continue;
      const candidate = [i, ...solve(covered | masks[i])];
      const cc = cost(candidate),
        bc = best ? cost(best) : [Infinity, Infinity];
      if (cc[0] < bc[0] || (cc[0] === bc[0] && cc[1] < bc[1])) best = candidate;
    }
    memo.set(covered, best!);
    return best!;
  };
  const groups = solve(0).map((i) => ({
    pattern: primes[i],
    cells: cells.flatMap((_, n) => (cubeMatches(primes[i], n) ? [n] : [])),
    term: termFor(primes[i], pos),
  }));
  return {
    expression: groups.map((g) => g.term).join(pos ? " · " : " + "),
    groups,
  };
}
export function sopExpression(groups: Implicant[]) {
  return groups.length
    ? groups
        .map(
          (g) =>
            [...g.pattern]
              .flatMap((v, i) =>
                v === "-" ? [] : [(v === "0" ? "!" : "") + "ABCD"[i]],
              )
              .join(" AND ") || "1",
        )
        .join(" OR ")
    : "0";
}
export type SequentialKind =
  | "D flip-flop"
  | "T flip-flop"
  | "JK flip-flop"
  | "SR flip-flop"
  | "4-bit counter"
  | "4-bit shift register";
export const sequentialKinds: SequentialKind[] = [
  "D flip-flop",
  "T flip-flop",
  "JK flip-flop",
  "SR flip-flop",
  "4-bit counter",
  "4-bit shift register",
];
export function sequentialStep(
  kind: SequentialKind,
  q: number,
  inputs: Record<string, boolean>,
): { q: number; warning: string } {
  let next = q;
  let warning = "";
  switch (kind) {
    case "D flip-flop":
      next = Number(!!inputs.D);
      break;
    case "T flip-flop":
      next = inputs.T ? q ^ 1 : q;
      break;
    case "JK flip-flop":
      next = inputs.J ? (inputs.K ? q ^ 1 : 1) : inputs.K ? 0 : q;
      break;
    case "SR flip-flop":
      if (inputs.S && inputs.R)
        warning =
          "Forbidden SR input: S=R=1. State is held by this teaching model; real hardware behavior is undefined.";
      else next = inputs.S ? 1 : inputs.R ? 0 : q;
      break;
    case "4-bit counter":
      next = inputs.EN ? (q + 1) & 15 : q;
      break;
    case "4-bit shift register":
      next = ((q << 1) | Number(!!inputs.D)) & 15;
      break;
  }
  return { q: next, warning };
}
export function numberRepresentations(value: number, width: number) {
  if (
    ![4, 8, 16].includes(width) ||
    !Number.isInteger(value) ||
    value < -(2 ** (width - 1)) ||
    value >= 2 ** width
  )
    throw Error("Value does not fit the selected bit width.");
  const mask = 2 ** width - 1,
    u = value & mask;
  return {
    binary: u.toString(2).padStart(width, "0"),
    hex: u
      .toString(16)
      .toUpperCase()
      .padStart(width / 4, "0"),
    octal: u.toString(8),
    unsigned: u,
    signed: u >= 2 ** (width - 1) ? u - 2 ** width : u,
    gray: (u ^ (u >> 1)).toString(2).padStart(width, "0"),
    onesComplement: (mask ^ u).toString(2).padStart(width, "0"),
    twosComplement: (-u & mask).toString(2).padStart(width, "0"),
    bcd: String(Math.abs(value))
      .split("")
      .map((d) => Number(d).toString(2).padStart(4, "0"))
      .join(" "),
  };
}
