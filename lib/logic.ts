import { z } from "zod";
export const gates = [
  "AND",
  "OR",
  "XOR",
  "NAND",
  "NOR",
  "XNOR",
  "NOT",
  "BUFFER",
] as const;
export type Gate = (typeof gates)[number];
const nodeSchema = z
  .object({
    id: z.string().regex(/^g[1-6]$/),
    gate: z.enum(gates),
    inputs: z.array(z.string()).min(1).max(2),
  })
  .strict();
export const problemSchema = z
  .object({
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(600),
    inputs: z
      .array(z.enum(["A", "B", "C"]))
      .min(2)
      .max(3),
    nodes: z.array(nodeSchema).min(1).max(6),
    output: z.string(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const seen = new Set(p.inputs);
    if (seen.size !== p.inputs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate inputs" });
    for (const n of p.nodes) {
      if (seen.has(n.id as "A"))
        ctx.addIssue({ code: "custom", message: "Duplicate node" });
      if (n.inputs.some((i) => !seen.has(i as "A")))
        ctx.addIssue({
          code: "custom",
          message: "Unknown or forward reference",
        });
      if (n.inputs.length !== (["NOT", "BUFFER"].includes(n.gate) ? 1 : 2))
        ctx.addIssue({ code: "custom", message: "Invalid gate arity" });
      seen.add(n.id as "A");
    }
    if (!p.nodes.some((n) => n.id === p.output))
      ctx.addIssue({ code: "custom", message: "Output must be a gate" });
    const used = new Set<string>();
    const visit = (id: string) => {
      if (used.has(id)) return;
      used.add(id);
      p.nodes.find((n) => n.id === id)?.inputs.forEach(visit);
    };
    visit(p.output);
    if (p.nodes.some((n) => !used.has(n.id)))
      ctx.addIssue({
        code: "custom",
        message: "All gates must feed the output",
      });
  });
export type Problem = z.infer<typeof problemSchema>;
export function apply(g: Gate, a: boolean, b = false): boolean {
  switch (g) {
    case "AND":
      return a && b;
    case "OR":
      return a || b;
    case "XOR":
      return a !== b;
    case "NAND":
      return !(a && b);
    case "NOR":
      return !(a || b);
    case "XNOR":
      return a === b;
    case "NOT":
      return !a;
    case "BUFFER":
      return a;
  }
}
export function evaluate(
  p: Problem,
  values: Record<string, boolean>,
  choices: Record<string, Gate> = {},
) {
  const signals = { ...values };
  for (const n of p.nodes)
    signals[n.id] = apply(
      choices[n.id] || n.gate,
      signals[n.inputs[0]],
      signals[n.inputs[1]],
    );
  return signals;
}
export function truthTable(p: Problem, choices: Record<string, Gate> = {}) {
  return Array.from({ length: 2 ** p.inputs.length }, (_, i) => {
    const values = Object.fromEntries(
      p.inputs.map((v, j) => [
        v,
        Boolean(i & (1 << (p.inputs.length - j - 1))),
      ]),
    );
    return {
      values,
      expected: evaluate(p, values)[p.output],
      actual: evaluate(p, values, choices)[p.output],
    };
  });
}
export function initialChoices(p: Problem): Record<string, Gate> {
  const choices = Object.fromEntries(
    p.nodes.map((n) => [
      n.id,
      n.gate === "NOT"
        ? "BUFFER"
        : n.gate === "BUFFER"
          ? "NOT"
          : n.gate === "AND"
            ? "OR"
            : "AND",
    ]),
  ) as Record<string, Gate>;
  if (truthTable(p, choices).every((r) => r.actual === r.expected)) {
    for (const n of p.nodes) choices[n.id] = n.gate;
    const out = p.nodes.find((n) => n.id === p.output)!;
    const complement: Record<Gate, Gate> = {
      AND: "NAND",
      NAND: "AND",
      OR: "NOR",
      NOR: "OR",
      XOR: "XNOR",
      XNOR: "XOR",
      NOT: "BUFFER",
      BUFFER: "NOT",
    };
    choices[out.id] = complement[out.gate];
  }
  return choices;
}
export function score(attempts: number, hints: number) {
  return Math.max(25, 150 - Math.max(0, attempts - 1) * 15 - hints * 25);
}
export function parseModel(text: string) {
  return problemSchema.parse(
    JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    ),
  );
}
export const samples: Problem[] = [
  {
    title: "The airlock protocol",
    description:
      "The airlock opens only when both crew switches A and B are on. Repair the gate that controls the lock.",
    inputs: ["A", "B"],
    nodes: [{ id: "g1", gate: "AND", inputs: ["A", "B"] }],
    output: "g1",
  },
  {
    title: "One pilot, one signal",
    description:
      "A distress beacon activates when exactly one of A and B is on. Both on must cancel the signal.",
    inputs: ["A", "B"],
    nodes: [{ id: "g1", gate: "XOR", inputs: ["A", "B"] }],
    output: "g1",
  },
  {
    title: "Emergency override",
    description:
      "Power is available when A AND B are on, OR when emergency override C is on.",
    inputs: ["A", "B", "C"],
    nodes: [
      { id: "g1", gate: "AND", inputs: ["A", "B"] },
      { id: "g2", gate: "OR", inputs: ["g1", "C"] },
    ],
    output: "g2",
  },
  {
    title: "Silent running",
    description:
      "Enable stealth when neither A nor B is active, and authorization C is on.",
    inputs: ["A", "B", "C"],
    nodes: [
      { id: "g1", gate: "NOR", inputs: ["A", "B"] },
      { id: "g2", gate: "AND", inputs: ["g1", "C"] },
    ],
    output: "g2",
  },
  {
    title: "Parity core",
    description:
      "Output is high when an odd number of A, B, C are high. Repair the two parity stages.",
    inputs: ["A", "B", "C"],
    nodes: [
      { id: "g1", gate: "XOR", inputs: ["A", "B"] },
      { id: "g2", gate: "XOR", inputs: ["g1", "C"] },
    ],
    output: "g2",
  },
];
