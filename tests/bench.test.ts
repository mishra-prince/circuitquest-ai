import { describe, it, expect } from "vitest";
import {
  advance,
  createRuntime,
  device,
  drive,
  boardDemo,
  boardSchema,
  blankBoard,
  pinValue,
  resolve,
  diagnostics,
  packageModule,
  componentCost,
  type Board,
} from "../lib/bench";
import { benchMissions, checkMission } from "../lib/missions";
function wired(nodes: Board["nodes"], connections: [string, string][]): Board {
  return {
    name: "Test",
    nodes,
    modules: [],
    wires: connections.map(([a, b], i) => {
      const [node, pin] = a.split("."),
        [to, input] = b.split(".");
      return { id: "w" + i, from: { node, pin }, to: { node: to, pin: input } };
    }),
  };
}
describe("four-valued delayed engine", () => {
  it("resolves floating, high impedance, bus values and conflicting drivers", () => {
    expect(resolve([])).toBe("Z");
    expect(resolve(["Z", 1])).toBe(1);
    expect(resolve([0, 1])).toBe("X");
    expect(resolve([9, 9])).toBe(9);
    expect(resolve(["X", 1])).toBe("X");
  });
  it("delays outputs and supports inertial cancellation of short pulses", () => {
    const b = boardDemo();
    let rt = advance(b, createRuntime(b, { a: 1, b: 0 }), 10);
    expect(pinValue(b, rt.outputs, "lamp", "IN")).toBe(0);
    rt = drive(b, rt, "b", 1);
    expect(pinValue(b, rt.outputs, "lamp", "IN")).toBe(0);
    rt = advance(b, rt, 4);
    expect(pinValue(b, rt.outputs, "lamp", "IN")).toBe(0);
    rt = drive(b, rt, "b", 0);
    rt = advance(b, rt, 10);
    expect(pinValue(b, rt.outputs, "lamp", "IN")).toBe(0);
    rt = advance(b, drive(b, rt, "b", 1), 5);
    expect(pinValue(b, rt.outputs, "lamp", "IN")).toBe(1);
  });
  it("masks unknown AND with zero and unknown OR with one", () => {
    for (const [kind, value, result] of [
      ["AND", 0, 0],
      ["OR", 1, 1],
    ] as const) {
      const b = wired(
        [device("a", "SWITCH"), device("g", kind), device("led", "LED")],
        [
          ["a.OUT", "g.A"],
          ["g.Y", "led.IN"],
        ],
      );
      b.nodes[0].value = value;
      const rt = advance(b, createRuntime(b), 50);
      expect(pinValue(b, rt.outputs, "led", "IN")).toBe(result);
      expect(diagnostics(b, rt).some((i) => i.includes("Floating"))).toBe(true);
    }
  });
  it("detects opposing tri-state drivers and permits high-impedance sharing", () => {
    const b = wired(
      [
        device("zero", "ZERO"),
        device("one", "ONE"),
        device("en", "SWITCH"),
        device("tri", "TRI"),
        device("led", "LED"),
      ],
      [
        ["zero.OUT", "tri.A"],
        ["en.OUT", "tri.EN"],
        ["tri.Y", "led.IN"],
        ["one.OUT", "led.IN"],
      ],
    );
    let rt = advance(b, createRuntime(b), 30);
    expect(pinValue(b, rt.outputs, "led", "IN")).toBe(1);
    rt = advance(b, drive(b, rt, "en", 1), 10);
    expect(pinValue(b, rt.outputs, "led", "IN")).toBe("X");
    expect(diagnostics(b, rt).some((i) => i.includes("Conflicting"))).toBe(
      true,
    );
  });
  it("changes configurable clock and pattern sources at simulated half-periods", () => {
    const clock = device("clk", "CLOCK"),
      pattern = device("pat", "PATTERN");
    pattern.pattern = "1100";
    const b = wired([clock, pattern], []);
    let rt = createRuntime(b);
    expect(rt.outputs["clk.OUT"]).toBe(0);
    expect(rt.outputs["pat.OUT"]).toBe(1);
    rt = advance(b, rt, 20);
    expect(rt.outputs["clk.OUT"]).toBe(1);
    expect(rt.outputs["pat.OUT"]).toBe(1);
    rt = advance(b, rt, 20);
    expect(rt.outputs["clk.OUT"]).toBe(0);
    expect(rt.outputs["pat.OUT"]).toBe(0);
  });
  it("captures flip-flops only at rising edges and resets asynchronously", () => {
    const b = wired(
      [
        device("d", "SWITCH"),
        device("clk", "CLOCK"),
        device("rst", "SWITCH"),
        device("ff", "DFF"),
      ],
      [
        ["d.OUT", "ff.D"],
        ["clk.OUT", "ff.CLK"],
        ["rst.OUT", "ff.RST"],
      ],
    );
    let rt = advance(b, createRuntime(b, { clk: 0, d: 1, rst: 0 }), 10);
    expect(rt.outputs["ff.Q"]).toBe(0);
    rt = advance(b, drive(b, rt, "clk", 1), 10);
    expect(rt.outputs["ff.Q"]).toBe(1);
    rt = drive(b, rt, "d", 0);
    rt = advance(b, drive(b, rt, "clk", 0), 10);
    expect(rt.outputs["ff.Q"]).toBe(1);
    rt = advance(b, drive(b, rt, "rst", 1), 10);
    expect(rt.outputs["ff.Q"]).toBe(0);
  });
  it("reads ROM words and packs/unpacks four-bit buses", () => {
    const rom = device("rom", "ROM4");
    rom.words = [10, 3, 12, 7];
    const b = wired(
      [
        device("zero", "ZERO"),
        rom,
        device("pack", "PACK4"),
        device("unpack", "UNPACK4"),
      ],
      [
        ["zero.OUT", "rom.A0"],
        ["zero.OUT", "rom.A1"],
        ...Array.from(
          { length: 4 },
          (_, i) => ["rom.Q" + i, "pack.A" + i] as [string, string],
        ),
        ["pack.BUS", "unpack.BUS"],
      ],
    );
    const rt = advance(b, createRuntime(b), 50);
    expect(rt.outputs["pack.BUS"]).toBe(10);
    expect([0, 1, 2, 3].map((i) => rt.outputs["unpack.Q" + i])).toEqual([
      0, 1, 0, 1,
    ]);
  });
  it("writes RAM on rising edges and clears it on reset", () => {
    const ids = ["a0", "a1", "d0", "d1", "d2", "d3", "we", "clk", "rst"];
    const b = wired(
      [...ids.map((i) => device(i, "SWITCH")), device("ram", "RAM4")],
      ids.map((i) => [i + ".OUT", "ram." + i.toUpperCase()]),
    );
    let rt = advance(
      b,
      createRuntime(b, {
        a0: 1,
        a1: 0,
        d0: 1,
        d1: 0,
        d2: 1,
        d3: 0,
        we: 1,
        clk: 0,
        rst: 0,
      }),
      20,
    );
    rt = advance(b, drive(b, rt, "clk", 1), 20);
    expect([0, 1, 2, 3].map((i) => rt.outputs["ram.Q" + i])).toEqual([
      1, 0, 1, 0,
    ]);
    rt = advance(b, drive(b, rt, "rst", 1), 20);
    expect([0, 1, 2, 3].map((i) => rt.outputs["ram.Q" + i])).toEqual([
      0, 0, 0, 0,
    ]);
  });
  it("validates bounds and wire widths before importing", () => {
    const b = boardDemo();
    expect(boardSchema.safeParse(b).success).toBe(true);
    expect(
      boardSchema.safeParse({ ...b, nodes: [...b.nodes, b.nodes[0]] }).success,
    ).toBe(false);
    expect(
      boardSchema.safeParse({
        ...b,
        wires: [
          ...b.wires,
          {
            id: "bad",
            from: { node: "gate", pin: "MISSING" },
            to: { node: "lamp", pin: "IN" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      boardSchema.safeParse({
        ...b,
        nodes: b.nodes.map((n) => ({ ...n, x: NaN })),
      }).success,
    ).toBe(false);
    expect(() => advance(b, createRuntime(b), Infinity)).toThrow();
  });
  it("packages a working circuit as a reusable block with honest internal cost", () => {
    const demo = boardDemo(),
      m = packageModule(demo, "AND block", "m1");
    const block = device("block", "MODULE");
    block.moduleId = "m1";
    const b = wired(
      [device("one", "ONE"), block, device("led", "LED")],
      [
        ["one.OUT", "block.I0"],
        ["one.OUT", "block.I1"],
        ["block.O0", "led.IN"],
      ],
    );
    b.modules = [m];
    expect(boardSchema.safeParse(b).success).toBe(true);
    expect(
      pinValue(b, advance(b, createRuntime(b), 30).outputs, "led", "IN"),
    ).toBe(1);
    expect(componentCost(b)).toBe(1);
  });
  it("rejects nested/stateful or cyclic reusable modules", () => {
    const b = boardDemo();
    b.nodes[2].kind = "DFF";
    expect(() => packageModule(b, "bad", "m1")).toThrow();
    const cyclic = boardDemo();
    cyclic.wires[0].from = { node: "gate", pin: "Y" };
    expect(() => packageModule(cyclic, "cyclic", "m1")).toThrow();
  });
});
describe("six playable mission verifiers", () => {
  it.each(benchMissions)(
    "$name has a valid starter and a passing worked solution",
    (m) => {
      const starter = m.starter(),
        solution = m.solution();
      expect(boardSchema.safeParse(starter).success).toBe(true);
      expect(boardSchema.safeParse(solution).success).toBe(true);
      expect(checkMission(m, starter).pass).toBe(false);
      const r = checkMission(m, solution);
      expect(r.failures).toEqual([]);
      expect(r.pass).toBe(true);
      expect(r.cases).toBeGreaterThan(0);
    },
  );
  it("counts internal module gates against the optimizer budget", () => {
    const m = benchMissions[5],
      b = m.solution();
    for (let i = 0; i < 5; i++) b.nodes.push(device("extra" + i, "NOT"));
    expect(checkMission(m, b).failures[0]).toContain("budget");
  });
  it("checks all 64 six-bit streams and asynchronous reset for the lock", () => {
    const m = benchMissions[1];
    expect(checkMission(m, m.solution()).cases).toBe(64 * 7);
  });
});

describe("workbench regression boundaries", () => {
  it("reports deleted mission inputs without throwing", () => {
    for (const m of benchMissions) {
      const b = m.solution();
      const first = b.nodes.find((n) => ["SWITCH", "CLOCK"].includes(n.kind))!;
      b.nodes = b.nodes.filter((n) => n.id !== first.id);
      b.wires = b.wires.filter(
        (w) => w.from.node !== first.id && w.to.node !== first.id,
      );
      expect(checkMission(m, b).pass).toBe(false);
    }
  });
  it("keeps constant sources constant and prevents manual overrides", () => {
    const b = {
      ...blankBoard,
      nodes: [device("zero", "ZERO"), device("one", "ONE")],
      wires: [],
      modules: [],
    };
    const rt = createRuntime(b, { zero: 1, one: 0 });
    expect(rt.outputs["zero.OUT"]).toBe(0);
    expect(rt.outputs["one.OUT"]).toBe(1);
    expect(() => drive(b, rt, "zero", 1)).toThrow();
  });
});
