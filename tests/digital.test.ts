import { describe, it, expect } from "vitest";
import {
  compileExpressions,
  circuitSchema,
  circuitTable,
  simulate,
  presets,
  minimize,
  cubeMatches,
  grayOrder,
  numberRepresentations,
  sequentialStep,
  type Cell,
  sopExpression,
} from "../lib/digital";
describe("digital circuit compiler and simulator", () => {
  it("evaluates full-adder arithmetic for all inputs", () => {
    const p = presets[1],
      c = compileExpressions(p.name, p.expressions, p.inputs);
    for (const r of circuitTable(c)) {
      const sum = Number(r.values.A) + Number(r.values.B) + Number(r.values.C);
      expect(Number(r.outputs.Sum) + 2 * Number(r.outputs.Carry)).toBe(sum);
    }
  });
  it("evaluates every preset without undefined signals", () => {
    for (const p of presets) {
      const c = compileExpressions(p.name, p.expressions, p.inputs);
      expect(circuitSchema.safeParse(c).success).toBe(true);
      for (const row of circuitTable(c))
        for (const output of Object.values(row.outputs))
          expect(typeof output).toBe("boolean");
    }
  });
  it("honors precedence, explicit parentheses and apostrophe negation", () => {
    for (const exp of ["A + B * C", "A OR (B AND C)", "A + (B'') . C"]) {
      const c = compileExpressions("test", { Y: exp }, ["A", "B", "C"]);
      for (const r of circuitTable(c))
        expect(r.outputs.Y).toBe(r.values.A || (r.values.B && r.values.C));
    }
  });
  it("supports NAND, NOR, XNOR and constants", () => {
    expect(simulate(compileExpressions("constant", { Y: "1" }), {}).g1).toBe(
      true,
    );
    for (const r of circuitTable(
      compileExpressions(
        "test",
        { Y: "A NAND B", N: "A NOR B", X: "A XNOR B" },
        ["A", "B"],
      ),
    )) {
      expect(r.outputs.Y).toBe(!(r.values.A && r.values.B));
      expect(r.outputs.N).toBe(!(r.values.A || r.values.B));
      expect(r.outputs.X).toBe(r.values.A === r.values.B);
    }
  });
  it.each([
    "A B",
    "alert(1)",
    "A + E",
    "(A OR B",
    "A +",
    "A;process.exit()",
    "",
    "NOT ".repeat(40) + "A",
  ])("rejects invalid, unsupported or excessive expressions: %s", (s) =>
    expect(() => compileExpressions("bad", { Y: s })).toThrow(),
  );
  it("rejects cycles, bad arity, invalid probes, duplicate variables and invalid IDs", () => {
    const c = compileExpressions("test", { Y: "A AND B" }, ["A", "B"]);
    for (const bad of [
      { ...c, nodes: [{ id: "g1", gate: "AND", inputs: ["g1", "A"] }] },
      { ...c, nodes: [{ id: "g1", gate: "AND", inputs: ["A"] }] },
      { ...c, outputs: { Y: "missing" } },
      { ...c, inputs: ["A", "A"] },
      { ...c, nodes: [{ id: "bad", gate: "AND", inputs: ["A", "B"] }] },
      { ...c, outputs: {} },
    ])
      expect(circuitSchema.safeParse(bad).success).toBe(false);
  });
  it("routes mux and decoder outputs correctly for all combinations", () => {
    const mux = circuitTable(
      compileExpressions(
        presets[4].name,
        presets[4].expressions,
        presets[4].inputs,
      ),
    );
    for (const r of mux)
      expect(r.outputs.Y).toBe(r.values.C ? r.values.B : r.values.A);
    for (const r of circuitTable(
      compileExpressions(
        presets[6].name,
        presets[6].expressions,
        presets[6].inputs,
      ),
    )) {
      expect(Object.values(r.outputs).filter(Boolean)).toHaveLength(1);
      expect(
        r.outputs["Y" + (Number(r.values.A) * 2 + Number(r.values.B))],
      ).toBe(true);
    }
  });
});
function check(cells: Cell[], n: number) {
  for (const pos of [false, true]) {
    const result = minimize(cells, n, pos);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === "X") continue;
      const covered = result.groups.some((g) => cubeMatches(g.pattern, i));
      expect(pos ? !covered : covered).toBe(!!cells[i]);
    }
    for (const g of result.groups) {
      expect(Number.isInteger(Math.log2(g.cells.length))).toBe(true);
      expect(
        g.cells.every((i) => cells[i] === "X" || cells[i] === (pos ? 0 : 1)),
      ).toBe(true);
    }
  }
}
describe("exact Karnaugh minimizer", () => {
  it("uses Gray ordering", () => expect(grayOrder(2)).toEqual([0, 1, 3, 2]));
  it("proves SOP and POS equivalent for every 2 and 3 variable Boolean function", () => {
    for (const n of [2, 3])
      for (let fn = 0; fn < 2 ** (2 ** n); fn++)
        check(
          Array.from({ length: 2 ** n }, (_, i) => ((fn >> i) & 1) as Cell),
          n,
        );
  });
  it("verifies deterministic 4-variable functions including dont-cares", () => {
    let seed = 42;
    for (let k = 0; k < 120; k++) {
      const cells = Array.from({ length: 16 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return [0, 1, "X"][seed % 3] as Cell;
      });
      check(cells, 4);
    }
  });
  it("joins four wraparound corners into one two-literal group", () => {
    const cells = Array<Cell>(16).fill(0);
    for (const i of [0, 2, 8, 10]) cells[i] = 1;
    const r = minimize(cells, 4);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].pattern).toBe("-0-0");
    expect(r.expression).toBe("B' · D'");
  });
  it("allows dont-cares to remove a variable and compiles the solution", () => {
    const cells: Cell[] = [0, 1, 0, "X"];
    const r = minimize(cells, 2);
    expect(r.expression).toBe("B");
    const c = compileExpressions("minimized", { Y: sopExpression(r.groups) }, [
      "A",
      "B",
    ]);
    for (const row of circuitTable(c)) expect(row.outputs.Y).toBe(row.values.B);
  });
  it("handles constant zero, one, and all dont-cares", () => {
    expect(minimize([0, 0, 0, 0], 2).expression).toBe("0");
    expect(minimize([1, 1, 1, 1], 2).expression).toBe("1");
    expect(minimize([1, 1, 1, 1], 2, true).expression).toBe("1");
    expect(minimize(["X", "X", "X", "X"], 2).expression).toBe("0");
    expect(minimize(["X", "X", "X", "X"], 2, true).expression).toBe("1");
  });
  it("rejects unsupported map dimensions", () =>
    expect(() => minimize([0, 1], 1)).toThrow());
});
describe("sequential devices", () => {
  it("implements JK characteristic table for both previous states", () => {
    for (const q of [0, 1])
      for (const J of [false, true])
        for (const K of [false, true])
          expect(sequentialStep("JK flip-flop", q, { J, K }).q).toBe(
            J ? (K ? q ^ 1 : 1) : K ? 0 : q,
          );
  });
  it("captures D, toggles T and holds when T is low", () => {
    expect(sequentialStep("D flip-flop", 0, { D: true }).q).toBe(1);
    expect(sequentialStep("T flip-flop", 1, { T: true }).q).toBe(0);
    expect(sequentialStep("T flip-flop", 1, { T: false }).q).toBe(1);
  });
  it("flags forbidden SR inputs without inventing valid hardware behavior", () => {
    const r = sequentialStep("SR flip-flop", 1, { S: true, R: true });
    expect(r.q).toBe(1);
    expect(r.warning).toContain("undefined");
  });
  it("wraps a modulo-16 counter and respects enable", () => {
    expect(sequentialStep("4-bit counter", 15, { EN: true }).q).toBe(0);
    expect(sequentialStep("4-bit counter", 7, { EN: false }).q).toBe(7);
  });
  it("shifts serial input into Q0 and discards overflow", () => {
    expect(sequentialStep("4-bit shift register", 10, { D: true }).q).toBe(5);
  });
});
describe("number representation", () => {
  it("represents signed, unsigned, complements, Gray and BCD accurately", () => {
    const r = numberRepresentations(-1, 8);
    expect(r.binary).toBe("11111111");
    expect(r.unsigned).toBe(255);
    expect(r.signed).toBe(-1);
    expect(r.hex).toBe("FF");
    expect(r.onesComplement).toBe("00000000");
    expect(r.twosComplement).toBe("00000001");
    expect(numberRepresentations(13, 8).bcd).toBe("0001 0011");
    expect(numberRepresentations(13, 8).gray).toBe("00001011");
  });
  it("Gray neighbors differ by exactly one bit", () => {
    for (let i = 0; i < 255; i++) {
      const a = i ^ (i >> 1),
        b = (i + 1) ^ ((i + 1) >> 1),
        d = a ^ b;
      expect(d & (d - 1)).toBe(0);
    }
  });
  it("rejects overflow, fractions and unsupported widths", () => {
    for (const [n, w] of [
      [256, 8],
      [-129, 8],
      [1.5, 8],
      [1, 3],
    ])
      expect(() => numberRepresentations(n, w)).toThrow();
  });
});
