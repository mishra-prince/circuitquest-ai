import { describe, it, expect } from "vitest";
import {
  apply,
  gates,
  problemSchema,
  samples,
  truthTable,
  initialChoices,
  parseModel,
  score,
} from "../lib/logic";
describe("Boolean engine", () => {
  it("implements every gate for every input pair", () => {
    const expected = {
      AND: [0, 0, 0, 1],
      OR: [0, 1, 1, 1],
      XOR: [0, 1, 1, 0],
      NAND: [1, 1, 1, 0],
      NOR: [1, 0, 0, 0],
      XNOR: [1, 0, 0, 1],
      NOT: [1, 1, 0, 0],
      BUFFER: [0, 0, 1, 1],
    };
    for (const g of gates)
      expect(
        [
          [false, false],
          [false, true],
          [true, false],
          [true, true],
        ].map(([a, b]) => Number(apply(g, a, b))),
      ).toEqual(expected[g]);
  });
  it("exhaustively verifies all three input combinations", () => {
    expect(truthTable(samples[2]).map((r) => Number(r.expected))).toEqual([
      0, 1, 0, 1, 0, 1, 1, 1,
    ]);
    expect(truthTable(samples[4]).map((r) => Number(r.expected))).toEqual([
      0, 1, 1, 0, 1, 0, 0, 1,
    ]);
  });
  it("accepts equivalent gate behavior, not just identical choices", () => {
    const p = problemSchema.parse({
      ...samples[0],
      nodes: [{ id: "g1", gate: "OR", inputs: ["A", "A"] }],
    });
    expect(
      truthTable(p, { g1: "AND" }).every((r) => r.actual === r.expected),
    ).toBe(true);
  });
  it("starts every mission unsolved, and correct choices solve it", () => {
    for (const p of samples) {
      expect(problemSchema.safeParse(p).success).toBe(true);
      expect(
        truthTable(p, initialChoices(p)).some((r) => r.actual !== r.expected),
      ).toBe(true);
      expect(
        truthTable(
          p,
          Object.fromEntries(p.nodes.map((n) => [n.id, n.gate])),
        ).every((r) => r.actual === r.expected),
      ).toBe(true);
    }
  });
  it("guarantees an unsolved challenge even for a constant function", () => {
    const p = problemSchema.parse({
      ...samples[0],
      nodes: [
        { id: "g1", gate: "XOR", inputs: ["A", "A"] },
        { id: "g2", gate: "AND", inputs: ["g1", "B"] },
      ],
      output: "g2",
    });
    expect(
      truthTable(p, initialChoices(p)).some((r) => r.actual !== r.expected),
    ).toBe(true);
  });
  it("supports repairing a unary NOT gate", () => {
    const p = problemSchema.parse({
      ...samples[0],
      nodes: [{ id: "g1", gate: "NOT", inputs: ["A"] }],
    });
    expect(initialChoices(p)).toEqual({ g1: "BUFFER" });
    expect(
      truthTable(p, initialChoices(p)).every((r) => r.actual !== r.expected),
    ).toBe(true);
  });
  it("scores with retry and hint penalties, with a floor", () => {
    expect(score(1, 0)).toBe(150);
    expect(score(2, 1)).toBe(110);
    expect(score(100, 3)).toBe(25);
  });
});
describe("untrusted model validation", () => {
  it.each([
    { ...samples[0], inputs: ["A", "A"] },
    { ...samples[0], nodes: [{ id: "g1", gate: "AND", inputs: ["g1", "B"] }] },
    { ...samples[0], nodes: [{ id: "g1", gate: "AND", inputs: ["X", "B"] }] },
    { ...samples[0], nodes: [{ id: "g1", gate: "AND", inputs: ["A"] }] },
    { ...samples[0], nodes: [{ id: "g1", gate: "NOT", inputs: ["A", "B"] }] },
    {
      ...samples[0],
      nodes: [
        { id: "g1", gate: "AND", inputs: ["A", "B"] },
        { id: "g1", gate: "OR", inputs: ["A", "B"] },
      ],
    },
    { ...samples[0], output: "A" },
    {
      ...samples[0],
      nodes: [
        { id: "g1", gate: "AND", inputs: ["A", "B"] },
        { id: "g2", gate: "OR", inputs: ["A", "B"] },
      ],
    },
    { ...samples[0], script: "alert(1)" },
    { ...samples[0], nodes: [{ id: "g1", gate: "eval", inputs: ["A", "B"] }] },
  ])("rejects malformed or unsupported circuits", (p) =>
    expect(problemSchema.safeParse(p).success).toBe(false),
  );
  it("parses fenced JSON but rejects prose and executable text", () => {
    expect(
      parseModel("```json\n" + JSON.stringify(samples[0]) + "\n```"),
    ).toEqual(samples[0]);
    expect(() => parseModel("alert(1)")).toThrow();
  });
});
