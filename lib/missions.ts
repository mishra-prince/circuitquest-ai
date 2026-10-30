import {
  type Board,
  type Signal,
  type Runtime,
  device,
  createRuntime,
  advance,
  drive,
  pinValue,
  componentCost,
  boardSchema,
} from "./bench";
import { compileExpressions } from "./digital";
export type Mission = {
  id: string;
  name: string;
  subtitle: string;
  story: string;
  brief: string;
  budget: number;
  hints: string[];
  starter: () => Board;
  solution: () => Board;
  category: string;
};
function wire(b: Board, source: string, target: string) {
  const [node, pin] = source.split("."),
    [to, input] = target.split(".");
  b.wires.push({
    id: "w" + (b.wires.length + 1),
    from: { node, pin },
    to: { node: to, pin: input },
  });
}
function circuit(
  name: string,
  inputs: string[],
  expressions: Record<string, string>,
): Board {
  const c = compileExpressions(name, expressions, inputs);
  const b: Board = { name, nodes: [], wires: [], modules: [] };
  inputs.forEach((i, j) =>
    b.nodes.push(device(i.toLowerCase(), "SWITCH", 50, 80 + j * 125, i)),
  );
  for (const [j, n] of c.nodes.entries())
    b.nodes.push(
      device(
        n.id,
        n.gate,
        300 + (j % 4) * 210,
        80 + Math.floor(j / 4) * 180,
        n.id,
      ),
    );
  const ref = (s: string) =>
    inputs.includes(s)
      ? s.toLowerCase() + ".OUT"
      : s === "0" || s === "1"
        ? "constant" + s + ".OUT"
        : s + ".Y";
  for (const k of ["0", "1"])
    if (
      c.nodes.some((n) => n.inputs.includes(k)) ||
      Object.values(c.outputs).includes(k)
    )
      b.nodes.push(
        device(
          "constant" + k,
          k === "0" ? "ZERO" : "ONE",
          50,
          600,
          "Logic " + k,
        ),
      );
  for (const n of c.nodes)
    n.inputs.forEach((i, j) =>
      wire(
        b,
        ref(i),
        n.id + "." + (["NOT", "BUFFER"].includes(n.gate) ? "A" : j ? "B" : "A"),
      ),
    );
  Object.entries(c.outputs).forEach(([label, r], i) => {
    b.nodes.push(
      device(label.toLowerCase(), "LED", 1150, 100 + i * 160, label),
    );
    wire(b, ref(r), label.toLowerCase() + ".IN");
  });
  return b;
}
function lock(): Board {
  const b: Board = {
    name: "Rolling 101 lock",
    nodes: [
      device("d", "SWITCH", 50, 90, "Serial D"),
      device("clk", "CLOCK", 50, 230, "Clock"),
      device("rst", "SWITCH", 50, 380, "Reset"),
      device("q1", "DFF", 300, 100, "Recent bit"),
      device("q2", "DFF", 520, 100, "Middle bit"),
      device("q3", "DFF", 740, 100, "Oldest bit"),
      device("inv", "NOT", 740, 310, "Invert middle"),
      device("outer", "AND", 960, 100, "Outer bits"),
      device("detect", "AND", 1180, 160, "Pattern detector"),
      device("unlock", "LED", 1400, 160, "Unlock"),
    ],
    wires: [],
    modules: [],
  };
  for (const n of ["q1", "q2", "q3"]) {
    wire(b, "clk.OUT", n + ".CLK");
    wire(b, "rst.OUT", n + ".RST");
  }
  wire(b, "d.OUT", "q1.D");
  wire(b, "q1.Q", "q2.D");
  wire(b, "q2.Q", "q3.D");
  wire(b, "q2.Q", "inv.A");
  wire(b, "q1.Q", "outer.A");
  wire(b, "q3.Q", "outer.B");
  wire(b, "outer.Y", "detect.A");
  wire(b, "inv.Y", "detect.B");
  wire(b, "detect.Y", "unlock.IN");
  return b;
}
function traffic(): Board {
  const b: Board = {
    name: "Traffic light controller",
    nodes: [
      device("clk", "CLOCK", 50, 80, "Clock"),
      device("en", "SWITCH", 50, 220, "Enable"),
      device("rst", "SWITCH", 50, 360, "Reset"),
      device("count", "COUNTER4", 300, 100, "Phase counter"),
      device("n1", "NOT", 550, 70, "Not Q1"),
      device("n0", "NOT", 550, 230, "Not Q0"),
      device("green_gate", "AND", 780, 180, "Green logic"),
      device("yellow_gate", "AND", 780, 360, "Yellow logic"),
      device("red", "LED", 1050, 50, "Red"),
      device("green", "LED", 1050, 220, "Green"),
      device("yellow", "LED", 1050, 390, "Yellow"),
    ],
    wires: [],
    modules: [],
  };
  b.nodes.find((n) => n.id === "en")!.value = 1;
  wire(b, "clk.OUT", "count.CLK");
  wire(b, "en.OUT", "count.EN");
  wire(b, "rst.OUT", "count.RST");
  wire(b, "count.Q1", "n1.A");
  wire(b, "count.Q0", "n0.A");
  wire(b, "n1.Y", "red.IN");
  wire(b, "count.Q1", "green_gate.A");
  wire(b, "n0.Y", "green_gate.B");
  wire(b, "count.Q1", "yellow_gate.A");
  wire(b, "count.Q0", "yellow_gate.B");
  wire(b, "green_gate.Y", "green.IN");
  wire(b, "yellow_gate.Y", "yellow.IN");
  return b;
}
function display(): Board {
  const b = circuit("Seven-segment rescue", ["A", "B"], {
    SegA: "A OR NOT B",
    SegC: "NOT A OR B",
    SegE: "NOT B",
    SegF: "NOT A AND NOT B",
  });
  const refs = Object.fromEntries(
    b.wires.filter((w) => w.to.pin === "IN").map((w) => [w.to.node, w.from]),
  );
  b.wires = b.wires.filter((w) => w.to.pin !== "IN");
  b.nodes = b.nodes.filter((n) => n.kind !== "LED");
  b.nodes.push(
    device("one", "ONE", 50, 440, "Logic 1"),
    device("display", "DISPLAY7", 1250, 160, "Digit display"),
  );
  for (const [pin, ref] of Object.entries({
    a: refs.sega,
    b: { node: "one", pin: "OUT" },
    c: refs.segc,
    d: refs.sega,
    e: refs.sege,
    f: refs.segf,
    g: { node: "a", pin: "OUT" },
  }))
    wire(b, ref.node + "." + ref.pin, "display." + pin);
  return b;
}
function alu(): Board {
  const b: Board = {
    name: "One-bit arithmetic arena",
    nodes: [
      device("a", "SWITCH", 50, 60, "A"),
      device("b", "SWITCH", 50, 200, "B"),
      device("s", "SWITCH", 50, 340, "Select S"),
      device("sum", "XOR", 300, 80, "Sum"),
      device("and", "AND", 300, 260, "AND result"),
      device("select", "MUX2", 600, 80, "Operation selector"),
      device("ns", "NOT", 300, 450, "Not S"),
      device("cg", "AND", 600, 340, "Carry enable"),
      device("y", "LED", 900, 80, "Y"),
      device("carry", "LED", 900, 340, "Carry"),
    ],
    wires: [],
    modules: [],
  };
  for (const g of ["sum", "and"]) {
    wire(b, "a.OUT", g + ".A");
    wire(b, "b.OUT", g + ".B");
  }
  wire(b, "sum.Y", "select.D0");
  wire(b, "and.Y", "select.D1");
  wire(b, "s.OUT", "select.S");
  wire(b, "s.OUT", "ns.A");
  wire(b, "ns.Y", "cg.A");
  wire(b, "and.Y", "cg.B");
  wire(b, "select.Y", "y.IN");
  wire(b, "cg.Y", "carry.IN");
  return b;
}
export const benchMissions: Mission[] = [
  {
    id: "airlock",
    name: "Spaceship repair",
    subtitle: "Combinational diagnosis",
    category: "REPAIR",
    story:
      "The station airlock must never open while the emergency sensor is active.",
    brief:
      "Output Y = A AND B AND NOT C. Repair the faulty gate; all 8 input combinations must work. Gate budget: 3.",
    budget: 3,
    hints: [
      "The emergency input must be inverted before it can enable the airlock.",
      "Inspect g2: a buffer passes C through unchanged.",
      "Set g2 to NOT. Keep the existing AND gates and wiring.",
    ],
    solution: () =>
      circuit("Spaceship airlock", ["A", "B", "C"], { Y: "A AND B AND NOT C" }),
    starter: () => {
      const b = circuit("Spaceship airlock", ["A", "B", "C"], {
        Y: "A AND B AND NOT C",
      });
      b.nodes.find((n) => n.kind === "NOT")!.kind = "BUFFER";
      return b;
    },
  },
  {
    id: "lock",
    name: "Combination lock",
    subtitle: "Clocked sequence detector",
    category: "SEQUENTIAL",
    story: "Recover the access code from a rolling stream of bits.",
    brief:
      "Sample Serial D on rising clock edges. Unlock exactly when the most recent three bits are 101 (oldest to newest). Reset clears the history. Gate/device budget: 6.",
    budget: 6,
    hints: [
      "Three D flip-flops store recent, middle and oldest bits. They must share one clock and reset.",
      "The detector needs oldest AND recent AND NOT middle.",
      "The final input detect.B must come from inv.Y, not directly from q2.Q.",
    ],
    solution: lock,
    starter: () => {
      const b = lock();
      b.wires.find((w) => w.to.node === "detect" && w.to.pin === "B")!.from = {
        node: "q2",
        pin: "Q",
      };
      return b;
    },
  },
  {
    id: "traffic",
    name: "Traffic-light controller",
    subtitle: "Counter-driven state machine",
    category: "CONTROL",
    story:
      "Restore a crossing controller without ever enabling conflicting lights.",
    brief:
      "From reset, phase cycles RED → RED → GREEN → YELLOW → repeat on rising edges. EN=0 holds the phase; RST=1 asynchronously returns RED. Exactly one light must be on. Device budget: 5.",
    budget: 5,
    hints: [
      "Only the counter’s two lowest bits are needed for a four-phase sequence.",
      "Red is NOT Q1; green is Q1 AND NOT Q0; yellow is Q1 AND Q0.",
      "Reconnect n1.A from count.Q0 to count.Q1.",
    ],
    solution: traffic,
    starter: () => {
      const b = traffic();
      b.wires.find((w) => w.to.node === "n1")!.from.pin = "Q0";
      return b;
    },
  },
  {
    id: "display",
    name: "Seven-segment rescue",
    subtitle: "Decoder construction",
    category: "DISPLAY",
    story:
      "The navigation panel is showing corrupted digits. Restore its segment logic.",
    brief:
      "A is the high bit and B the low bit. Display decimal 0, 1, 2, 3 for AB = 00, 01, 10, 11. Every one of the seven segments is checked. Gate budget: 8.",
    budget: 8,
    hints: [
      "Segments a and d share the function A OR NOT B.",
      "Segment b is always on; g follows A; e follows NOT B.",
      "The OR gate feeding SegA (g2) must be OR, not AND.",
    ],
    solution: display,
    starter: () => {
      const b = display();
      b.nodes.find((n) => n.id === "g2")!.kind = "AND";
      return b;
    },
  },
  {
    id: "alu",
    name: "Arithmetic arena",
    subtitle: "A selectable one-bit ALU",
    category: "ARITHMETIC",
    story:
      "The ship computer needs one circuit that can add or perform logical AND.",
    brief:
      "S=0: Y=A XOR B and Carry=A AND B. S=1: Y=A AND B and Carry=0. Gate/device budget: 5.",
    budget: 5,
    hints: [
      "MUX2 selects D0 when S=0 and D1 when S=1.",
      "The XOR result belongs on D0; the AND result belongs on D1.",
      "Swap the wires connected to select.D0 and select.D1.",
    ],
    solution: alu,
    starter: () => {
      const b = alu();
      for (const w of b.wires)
        if (w.to.node === "select" && w.to.pin === "D0") w.to.pin = "D1";
        else if (w.to.node === "select" && w.to.pin === "D1") w.to.pin = "D0";
      return b;
    },
  },
  {
    id: "optimizer",
    name: "K-map optimizer",
    subtitle: "Equivalent behavior, fewer gates",
    category: "OPTIMIZE",
    story:
      "An oversized control circuit is draining the backup supply. Simplify it.",
    brief:
      "Preserve Y = Σm(2,3,6,7,12,13,14,15) over ABCD, with A the high bit. D does not affect the result. Reduce to at most 4 gates. All 16 combinations are checked; reusable blocks count their internal gates.",
    budget: 4,
    hints: [
      "Use the K-map tool with four variables and minterms 2,3,6,7,12,13,14,15.",
      "Group the cells into A·B and A′·C. Variable D disappears.",
      "Use NOT A, AND(A,B), AND(NOT A,C), then OR the two AND outputs. Delete the old gates.",
    ],
    solution: () =>
      circuit("Optimized control", ["A", "B", "C", "D"], {
        Y: "(A AND B) OR (NOT A AND C)",
      }),
    starter: () =>
      circuit("Oversized control", ["A", "B", "C", "D"], {
        Y: "(NOT A AND NOT B AND C) OR (NOT A AND B AND C) OR (A AND B AND NOT C) OR (A AND B AND C)",
      }),
  },
];
export type CheckResult = {
  pass: boolean;
  cases: number;
  failures: string[];
  cost: number;
  budget: number;
};
export function checkMission(mission: Mission, board: Board): CheckResult {
  const failures: string[] = [];
  let cases = 0;
  try {
    boardSchema.parse(board);
  } catch {
    return {
      pass: false,
      cases: 0,
      failures: [
        "The circuit is invalid. Fix its component and wire definitions.",
      ],
      cost: 0,
      budget: mission.budget,
    };
  }
  const requiredSources =
    mission.id === "lock"
      ? ["d", "clk", "rst"]
      : mission.id === "traffic"
        ? ["clk", "rst", "en"]
        : mission.id === "airlock"
          ? ["a", "b", "c"]
          : mission.id === "display"
            ? ["a", "b"]
            : mission.id === "alu"
              ? ["a", "b", "s"]
              : ["a", "b", "c", "d"];
  if (
    requiredSources.some(
      (id) =>
        !board.nodes.some(
          (n) =>
            n.id === id &&
            ["SWITCH", "CLOCK", "PATTERN", "BUTTON"].includes(n.kind),
        ),
    )
  )
    return {
      pass: false,
      cases: 0,
      failures: [
        "A supplied input/clock component is missing or has been replaced. Restore the mission starter, or keep its input IDs and source types.",
      ],
      cost: componentCost(board),
      budget: mission.budget,
    };
  if (mission.id === "optimizer") {
    const allowed = new Set([
      "SWITCH",
      "LED",
      "PROBE",
      "ZERO",
      "ONE",
      "AND",
      "OR",
      "XOR",
      "NAND",
      "NOR",
      "XNOR",
      "NOT",
      "BUFFER",
      "MODULE",
    ]);
    if (
      [...board.nodes, ...board.modules.flatMap((m) => m.nodes)].some(
        (n) => !allowed.has(n.kind),
      )
    )
      failures.push(
        "Optimizer accepts primitive logic gates and combinational reusable blocks only; no mux, memory or state devices.",
      );
  }
  const cost = componentCost(board);
  if (cost > mission.budget)
    failures.push(`Device budget exceeded: ${cost}/${mission.budget}.`);
  const record = (
    rt: Runtime,
    node: string,
    pin: string,
    want: number,
    context: string,
  ) => {
    cases++;
    const got = pinValue(board, rt.outputs, node, pin);
    if (got !== want && failures.length < 8)
      failures.push(
        `${context}: ${node}.${pin} expected ${want}, received ${got}.`,
      );
  };
  const sources =
    mission.id === "airlock"
      ? ["a", "b", "c"]
      : mission.id === "display"
        ? ["a", "b"]
        : mission.id === "alu"
          ? ["a", "b", "s"]
          : ["a", "b", "c", "d"];
  if (["airlock", "display", "alu", "optimizer"].includes(mission.id)) {
    for (let i = 0; i < 2 ** sources.length; i++) {
      const values = Object.fromEntries(
        sources.map((name, j) => [name, (i >> (sources.length - j - 1)) & 1]),
      );
      const rt = advance(board, createRuntime(board, values), 500);
      const { a, b, c, s } = values,
        ctx = sources.map((k) => k.toUpperCase() + "=" + values[k]).join(" ");
      if (mission.id === "airlock")
        record(rt, "y", "IN", Number(!!a && !!b && !c), ctx);
      if (mission.id === "optimizer")
        record(rt, "y", "IN", Number((!!a && !!b) || (!a && !!c)), ctx);
      if (mission.id === "alu") {
        record(rt, "y", "IN", s ? a & b : a ^ b, ctx);
        record(rt, "carry", "IN", s ? 0 : a & b, ctx);
      }
      if (mission.id === "display") {
        const mask = [0x3f, 0x06, 0x5b, 0x4f][i];
        "abcdefg"
          .split("")
          .forEach((p, j) => record(rt, "display", p, (mask >> j) & 1, ctx));
      }
    }
  } else if (mission.id === "lock") {
    for (let sequence = 0; sequence < 64; sequence++) {
      let rt = advance(
        board,
        createRuntime(board, { clk: 0, rst: 1, d: 0 }),
        100,
      );
      rt = advance(board, drive(board, rt, "rst", 0), 100);
      let history = 0;
      for (let bit = 5; bit >= 0; bit--) {
        const value = (sequence >> bit) & 1;
        rt = advance(board, drive(board, rt, "clk", 0), 100);
        rt = advance(board, drive(board, rt, "d", value), 100);
        rt = advance(board, drive(board, rt, "clk", 1), 100);
        history = ((history << 1) | value) & 7;
        record(
          rt,
          "unlock",
          "IN",
          Number(history === 5),
          `Stream ${sequence
            .toString(2)
            .padStart(6, "0")
            .slice(0, 6 - bit)}`,
        );
      }
      rt = advance(board, drive(board, rt, "rst", 1), 100);
      record(rt, "unlock", "IN", 0, "Asynchronous reset");
    }
  } else {
    let rt = advance(
      board,
      createRuntime(board, { clk: 0, rst: 1, en: 1 }),
      100,
    );
    let phase = 0;
    const check = (context: string) => {
      record(rt, "red", "IN", Number(phase < 2), context);
      record(rt, "green", "IN", Number(phase === 2), context);
      record(rt, "yellow", "IN", Number(phase === 3), context);
    };
    check("Reset");
    rt = advance(board, drive(board, rt, "rst", 0), 100);
    for (let i = 0; i < 12; i++) {
      const en = i === 4 || i === 5 ? 0 : 1;
      rt = advance(board, drive(board, rt, "clk", 0), 100);
      rt = advance(board, drive(board, rt, "en", en), 100);
      rt = advance(board, drive(board, rt, "clk", 1), 100);
      phase = (phase + en) % 4;
      check(`Clock ${i + 1}, EN=${en}`);
    }
    rt = advance(board, drive(board, rt, "rst", 1), 100);
    phase = 0;
    check("Asynchronous reset after running");
  }
  return {
    pass: failures.length === 0,
    cases,
    failures,
    cost,
    budget: mission.budget,
  };
}
