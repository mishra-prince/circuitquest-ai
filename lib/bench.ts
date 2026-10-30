import { z } from "zod";
export type Signal = number | "X" | "Z";
export const deviceKinds = [
  "SWITCH",
  "BUTTON",
  "CLOCK",
  "PATTERN",
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
  "TRI",
  "LED",
  "PROBE",
  "DISPLAY7",
  "MUX2",
  "DECODER2",
  "DFF",
  "TFF",
  "JKFF",
  "REGISTER4",
  "COUNTER4",
  "ROM4",
  "RAM4",
  "PACK4",
  "UNPACK4",
  "MODULE",
] as const;
export type Kind = (typeof deviceKinds)[number];
export type Pin = { name: string; width: 1 | 4 };
export type Device = {
  id: string;
  kind: Kind;
  label: string;
  x: number;
  y: number;
  rotation: number;
  value: number;
  delay: number;
  period: number;
  pattern: string;
  words: number[];
  moduleId?: string;
};
export type Wire = {
  id: string;
  from: { node: string; pin: string };
  to: { node: string; pin: string };
};
export type Module = {
  id: string;
  name: string;
  nodes: Device[];
  wires: Wire[];
  inputs: { name: string; node: string }[];
  outputs: { name: string; node: string }[];
};
export type Board = {
  name: string;
  nodes: Device[];
  wires: Wire[];
  modules: Module[];
};
const scalar = (...names: string[]): Pin[] =>
  names.map((name) => ({ name, width: 1 }));
const seq = new Set<Kind>([
  "DFF",
  "TFF",
  "JKFF",
  "REGISTER4",
  "COUNTER4",
  "RAM4",
]);
export const isSequential = (kind: Kind) => seq.has(kind);
export const isSource = (kind: Kind) =>
  ["SWITCH", "BUTTON", "CLOCK", "PATTERN", "ZERO", "ONE"].includes(kind);
export function pins(
  d: Device,
  modules: Module[] = [],
): { inputs: Pin[]; outputs: Pin[] } {
  const bits = ["Q0", "Q1", "Q2", "Q3"];
  if (isSource(d.kind)) return { inputs: [], outputs: scalar("OUT") };
  if (["AND", "OR", "XOR", "NAND", "NOR", "XNOR"].includes(d.kind))
    return { inputs: scalar("A", "B"), outputs: scalar("Y") };
  switch (d.kind) {
    case "NOT":
    case "BUFFER":
      return { inputs: scalar("A"), outputs: scalar("Y") };
    case "TRI":
      return { inputs: scalar("A", "EN"), outputs: scalar("Y") };
    case "LED":
    case "PROBE":
      return { inputs: scalar("IN"), outputs: [] };
    case "DISPLAY7":
      return { inputs: scalar("a", "b", "c", "d", "e", "f", "g"), outputs: [] };
    case "MUX2":
      return { inputs: scalar("D0", "D1", "S"), outputs: scalar("Y") };
    case "DECODER2":
      return {
        inputs: scalar("A0", "A1"),
        outputs: scalar("Y0", "Y1", "Y2", "Y3"),
      };
    case "DFF":
      return { inputs: scalar("D", "CLK", "RST"), outputs: scalar("Q", "NQ") };
    case "TFF":
      return { inputs: scalar("T", "CLK", "RST"), outputs: scalar("Q", "NQ") };
    case "JKFF":
      return {
        inputs: scalar("J", "K", "CLK", "RST"),
        outputs: scalar("Q", "NQ"),
      };
    case "REGISTER4":
      return {
        inputs: scalar("D0", "D1", "D2", "D3", "CLK", "RST"),
        outputs: scalar(...bits),
      };
    case "COUNTER4":
      return { inputs: scalar("EN", "CLK", "RST"), outputs: scalar(...bits) };
    case "ROM4":
      return { inputs: scalar("A0", "A1"), outputs: scalar(...bits) };
    case "RAM4":
      return {
        inputs: scalar("A0", "A1", "D0", "D1", "D2", "D3", "WE", "CLK", "RST"),
        outputs: scalar(...bits),
      };
    case "PACK4":
      return {
        inputs: scalar("A0", "A1", "A2", "A3"),
        outputs: [{ name: "BUS", width: 4 }],
      };
    case "UNPACK4":
      return { inputs: [{ name: "BUS", width: 4 }], outputs: scalar(...bits) };
    case "MODULE": {
      const m = modules.find((m) => m.id === d.moduleId);
      return {
        inputs: scalar(...(m?.inputs.map((p) => p.name) || [])),
        outputs: scalar(...(m?.outputs.map((p) => p.name) || [])),
      };
    }
    default:
      return { inputs: [], outputs: [] };
  }
}
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,35}$/);
const deviceSchema = z
  .object({
    id,
    kind: z.enum(deviceKinds),
    label: z.string().min(1).max(30),
    x: z.number().finite().min(-3000).max(6000),
    y: z.number().finite().min(-3000).max(6000),
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    value: z.number().int().min(0).max(1),
    delay: z.number().int().min(0).max(100),
    period: z.number().int().min(2).max(1000),
    pattern: z.string().regex(/^[01]{1,32}$/),
    words: z.array(z.number().int().min(0).max(15)).length(4),
    moduleId: id.optional(),
  })
  .strict();
const endpoint = z
  .object({ node: id, pin: z.string().min(1).max(12) })
  .strict();
const wireSchema = z.object({ id, from: endpoint, to: endpoint }).strict();
const moduleSchema = z
  .object({
    id,
    name: z.string().min(1).max(40),
    nodes: z.array(deviceSchema).min(1).max(64),
    wires: z.array(wireSchema).max(256),
    inputs: z
      .array(
        z.object({ name: z.string().regex(/^I[0-7]$/), node: id }).strict(),
      )
      .min(1)
      .max(8),
    outputs: z
      .array(
        z.object({ name: z.string().regex(/^O[0-7]$/), node: id }).strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
function validateNetwork(
  nodes: Device[],
  wires: Wire[],
  modules: Module[],
): string[] {
  const errors: string[] = [];
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
    errors.push("Duplicate component ID.");
  if (new Set(wires.map((w) => w.id)).size !== wires.length)
    errors.push("Duplicate wire ID.");
  if (
    new Set(
      wires.map((w) => `${w.from.node}.${w.from.pin}>${w.to.node}.${w.to.pin}`),
    ).size !== wires.length
  )
    errors.push("Duplicate wire.");
  for (const n of nodes)
    if (n.kind === "MODULE" && !modules.some((m) => m.id === n.moduleId))
      errors.push("Unknown reusable component.");
  for (const w of wires) {
    const a = nodes.find((n) => n.id === w.from.node),
      b = nodes.find((n) => n.id === w.to.node);
    const out =
        a && pins(a, modules).outputs.find((p) => p.name === w.from.pin),
      input = b && pins(b, modules).inputs.find((p) => p.name === w.to.pin);
    if (!out || !input || out.width !== input.width)
      errors.push("Wire must connect compatible output and input pins.");
  }
  return errors;
}
export const boardSchema = z
  .object({
    name: z.string().min(1).max(80),
    nodes: z.array(deviceSchema).max(64),
    wires: z.array(wireSchema).max(256),
    modules: z.array(moduleSchema).max(8),
  })
  .strict()
  .superRefine((b, ctx) => {
    const errors = validateNetwork(b.nodes, b.wires, b.modules);
    if (new Set(b.modules.map((m) => m.id)).size !== b.modules.length)
      errors.push("Duplicate reusable component ID.");
    for (const m of b.modules) {
      errors.push(...validateNetwork(m.nodes, m.wires, []));
      if (
        m.nodes.some(
          (n) =>
            isSequential(n.kind) ||
            ["CLOCK", "PATTERN", "ROM4", "MODULE"].includes(n.kind),
        )
      )
        errors.push("Reusable blocks must be combinational and cannot nest.");
      for (const list of [m.inputs, m.outputs])
        if (
          new Set(list.map((p) => p.name)).size !== list.length ||
          new Set(list.map((p) => p.node)).size !== list.length
        )
          errors.push("Duplicate module ports.");
      if (
        m.inputs.some(
          (p) => m.nodes.find((n) => n.id === p.node)?.kind !== "SWITCH",
        ) ||
        m.outputs.some(
          (p) =>
            !["LED", "PROBE"].includes(
              m.nodes.find((n) => n.id === p.node)?.kind || "",
            ),
        )
      )
        errors.push("Module ports must map switches to LED/probe sinks.");
      const done = new Set(
        m.nodes.filter((n) => isSource(n.kind)).map((n) => n.id),
      );
      for (let i = 0; i < m.nodes.length; i++)
        for (const n of m.nodes)
          if (
            m.wires
              .filter((w) => w.to.node === n.id)
              .every((w) => done.has(w.from.node))
          )
            done.add(n.id);
      if (done.size !== m.nodes.length)
        errors.push("Reusable blocks cannot contain feedback loops.");
    }
    errors.forEach((message) => ctx.addIssue({ code: "custom", message }));
  });
export function device(
  id: string,
  kind: Kind,
  x = 100,
  y = 100,
  label = id,
): Device {
  return {
    id,
    kind,
    label,
    x,
    y,
    rotation: 0,
    value: 0,
    delay: isSource(kind) ? 0 : 5,
    period: 40,
    pattern: "0101",
    words: [0, 1, 2, 3],
  };
}
export const blankBoard: Board = {
  name: "Untitled digital circuit",
  nodes: [],
  wires: [],
  modules: [],
};
export function resolve(values: Signal[]): Signal {
  const active = values.filter((v) => v !== "Z");
  if (!active.length) return "Z";
  if (active.includes("X") || active.some((v) => v !== active[0])) return "X";
  return active[0];
}
export function pinValue(
  board: Board,
  outputs: Record<string, Signal>,
  node: string,
  pin: string,
): Signal {
  return resolve(
    board.wires
      .filter((w) => w.to.node === node && w.to.pin === pin)
      .map((w) => outputs[w.from.node + "." + w.from.pin] ?? "X"),
  );
}
const bit = (s: Signal): s is number => s === 0 || s === 1;
function gate(kind: Kind, a: Signal, b: Signal): Signal {
  if (["AND", "NAND"].includes(kind)) {
    const v = a === 0 || b === 0 ? 0 : bit(a) && bit(b) ? 1 : "X";
    return kind === "NAND" ? (v === "X" ? "X" : 1 - v) : v;
  }
  if (["OR", "NOR"].includes(kind)) {
    const v = a === 1 || b === 1 ? 1 : bit(a) && bit(b) ? 0 : "X";
    return kind === "NOR" ? (v === "X" ? "X" : 1 - v) : v;
  }
  if (kind === "NOT") return bit(a) ? 1 - a : "X";
  if (kind === "BUFFER") return bit(a) ? a : "X";
  if (kind === "TRI") return b === 0 ? "Z" : b === 1 ? a : "X";
  return bit(a) && bit(b) ? (kind === "XNOR" ? Number(a === b) : a ^ b) : "X";
}
function combine(signals: Signal[]): Signal {
  return signals.every(bit)
    ? signals.reduce<number>((sum, v, i) => sum | ((v as number) << i), 0)
    : "X";
}
function split(
  value: Signal,
  names = ["Q0", "Q1", "Q2", "Q3"],
): Record<string, Signal> {
  return Object.fromEntries(
    names.map((n, i) => [
      n,
      typeof value === "number" ? (value >> i) & 1 : "X",
    ]),
  );
}
function moduleValue(
  m: Module,
  inputs: Record<string, Signal>,
): Record<string, Signal> {
  const b: Board = {
    name: m.name,
    nodes: m.nodes,
    wires: m.wires,
    modules: [],
  };
  let outs: Record<string, Signal> = {};
  const states: Runtime["states"] = {};
  for (let pass = 0; pass <= m.nodes.length; pass++)
    for (const n of m.nodes) {
      const port = m.inputs.find((p) => p.node === n.id);
      const value = port
        ? { OUT: inputs[port.name] ?? "Z" }
        : desired(b, n, outs, states, 0, {});
      for (const [key, v] of Object.entries(value)) outs[n.id + "." + key] = v;
    }
  return Object.fromEntries(
    m.outputs.map((p) => [p.name, pinValue(b, outs, p.node, "IN")]),
  );
}
export type Runtime = {
  time: number;
  outputs: Record<string, Signal>;
  states: Record<string, { q: Signal; clock: Signal; memory: Signal[] }>;
  events: Record<string, { at: number; value: Signal }>;
  drives: Record<string, Signal>;
  warning: string;
};
function desired(
  b: Board,
  n: Device,
  outs: Record<string, Signal>,
  states: Runtime["states"],
  time: number,
  drives: Record<string, Signal>,
): Record<string, Signal> {
  const read = (p: string) => pinValue(b, outs, n.id, p),
    inputs = Object.fromEntries(
      pins(n, b.modules).inputs.map((p) => [p.name, read(p.name)]),
    );
  if (isSource(n.kind)) {
    let value: Signal = drives[n.id] ?? n.value;
    if (drives[n.id] === undefined) {
      if (n.kind === "CLOCK") value = Math.floor(time / (n.period / 2)) % 2;
      if (n.kind === "PATTERN")
        value = Number(
          n.pattern[Math.floor(time / (n.period / 2)) % n.pattern.length],
        );
      if (n.kind === "ZERO") value = 0;
      if (n.kind === "ONE") value = 1;
    }
    if (n.kind === "ZERO") value = 0;
    if (n.kind === "ONE") value = 1;
    return { OUT: value };
  }
  if (n.kind === "MODULE") {
    const m = b.modules.find((m) => m.id === n.moduleId);
    return m ? moduleValue(m, inputs) : {};
  }
  if (n.kind === "MUX2")
    return {
      Y:
        inputs.S === 0
          ? inputs.D0
          : inputs.S === 1
            ? inputs.D1
            : inputs.D0 === inputs.D1
              ? inputs.D0
              : "X",
    };
  if (n.kind === "DECODER2") {
    const a = combine([inputs.A0, inputs.A1]);
    return Object.fromEntries(
      [0, 1, 2, 3].map((i) => [
        "Y" + i,
        typeof a === "number" ? Number(a === i) : "X",
      ]),
    );
  }
  if (n.kind === "PACK4")
    return { BUS: combine([inputs.A0, inputs.A1, inputs.A2, inputs.A3]) };
  if (n.kind === "UNPACK4") return split(inputs.BUS);
  if (n.kind === "ROM4") {
    const a = combine([inputs.A0, inputs.A1]);
    return split(typeof a === "number" ? n.words[a] : "X");
  }
  if (isSequential(n.kind)) {
    const st =
      states[n.id] || (states[n.id] = { q: 0, clock: 0, memory: [0, 0, 0, 0] });
    const clk = inputs.CLK;
    if (inputs.RST === 1) {
      st.q = 0;
      if (n.kind === "RAM4") st.memory = [0, 0, 0, 0];
    } else if (st.clock === 0 && clk === 1) {
      if (inputs.RST !== 0) {
        st.q = "X";
        if (n.kind === "RAM4") st.memory = ["X", "X", "X", "X"];
      } else
        switch (n.kind) {
          case "DFF":
            st.q = bit(inputs.D) ? inputs.D : "X";
            break;
          case "TFF":
            st.q =
              inputs.T === 0
                ? st.q
                : inputs.T === 1 && bit(st.q)
                  ? st.q ^ 1
                  : "X";
            break;
          case "JKFF":
            st.q =
              bit(inputs.J) && bit(inputs.K)
                ? inputs.J
                  ? inputs.K
                    ? bit(st.q)
                      ? st.q ^ 1
                      : "X"
                    : 1
                  : inputs.K
                    ? 0
                    : st.q
                : "X";
            break;
          case "REGISTER4":
            st.q = combine(["D0", "D1", "D2", "D3"].map((p) => inputs[p]));
            break;
          case "COUNTER4":
            st.q =
              inputs.EN === 0
                ? st.q
                : inputs.EN === 1 && typeof st.q === "number"
                  ? (st.q + 1) & 15
                  : "X";
            break;
          case "RAM4": {
            const a = combine([inputs.A0, inputs.A1]);
            if (inputs.WE === 1) {
              if (typeof a === "number")
                st.memory[a] = combine(
                  ["D0", "D1", "D2", "D3"].map((p) => inputs[p]),
                );
              else st.memory = ["X", "X", "X", "X"];
            } else if (inputs.WE !== 0) st.memory = ["X", "X", "X", "X"];
            break;
          }
        }
    }
    st.clock = clk;
    if (n.kind === "RAM4") {
      const a = combine([inputs.A0, inputs.A1]);
      return split(typeof a === "number" ? st.memory[a] : "X");
    }
    return ["DFF", "TFF", "JKFF"].includes(n.kind)
      ? { Q: st.q, NQ: bit(st.q) ? 1 - st.q : "X" }
      : split(st.q);
  }
  if (pins(n, b.modules).outputs.length)
    return {
      Y: gate(n.kind, inputs.A, n.kind === "TRI" ? inputs.EN : inputs.B),
    };
  return {};
}
function recompute(board: Board, rt: Runtime) {
  for (const n of board.nodes)
    for (const [p, v] of Object.entries(
      desired(board, n, rt.outputs, rt.states, rt.time, rt.drives),
    )) {
      const ref = n.id + "." + p;
      if (rt.outputs[ref] === v) {
        delete rt.events[ref];
        continue;
      }
      if (rt.events[ref]?.value !== v)
        rt.events[ref] = { at: rt.time + n.delay, value: v };
    }
}
function process(board: Board, rt: Runtime, target: number) {
  let steps = 0;
  while (true) {
    const pending = Object.values(rt.events).map((e) => e.at);
    const sourceTimes = board.nodes
      .filter(
        (n) =>
          ["CLOCK", "PATTERN"].includes(n.kind) &&
          rt.drives[n.id] === undefined,
      )
      .map(
        (n) =>
          (Math.floor((rt.time + 1e-7) / (n.period / 2)) + 1) * (n.period / 2),
      );
    const next = Math.min(...pending, ...sourceTimes, target);
    if (next > target || !Number.isFinite(next)) break;
    const due = Object.entries(rt.events).filter(([, e]) => e.at <= next);
    const atTarget = next === target;
    rt.time = next;
    for (const [ref, e] of due) {
      rt.outputs[ref] = e.value;
      delete rt.events[ref];
    }
    recompute(board, rt);
    if (++steps > 6000) {
      rt.warning =
        "Event limit reached: zero-delay oscillation or an excessively active network. Increase delays or break the feedback loop.";
      rt.events = {};
      for (const n of board.nodes)
        if (!isSource(n.kind))
          for (const p of pins(n, board.modules).outputs)
            rt.outputs[n.id + "." + p.name] = "X";
      rt.time = target;
      break;
    }
    if (atTarget && !Object.values(rt.events).some((e) => e.at <= target))
      break;
  }
  return rt;
}
export function createRuntime(
  board: Board,
  drives: Record<string, Signal> = {},
): Runtime {
  const rt: Runtime = {
    time: 0,
    outputs: {},
    states: {},
    events: {},
    drives: { ...drives },
    warning: "",
  };
  for (const n of board.nodes)
    for (const p of pins(n, board.modules).outputs)
      rt.outputs[n.id + "." + p.name] = "X";
  recompute(board, rt);
  return process(board, rt, 0);
}
export function advance(
  board: Board,
  runtime: Runtime,
  delta: number,
): Runtime {
  if (!Number.isFinite(delta) || delta < 0 || delta > 10000)
    throw Error("Advance time by 0–10,000 ns.");
  const rt = structuredClone(runtime);
  return process(board, rt, rt.time + delta);
}
export function drive(
  board: Board,
  runtime: Runtime,
  node: string,
  value: Signal,
): Runtime {
  const n = board.nodes.find((n) => n.id === node);
  if (!n || !isSource(n.kind) || ["ZERO", "ONE"].includes(n.kind))
    throw Error("Only source components can be driven.");
  const rt = structuredClone(runtime);
  rt.drives[node] = value;
  recompute(board, rt);
  return process(board, rt, rt.time);
}
export function diagnostics(board: Board, rt: Runtime) {
  const issues: string[] = [];
  for (const n of board.nodes)
    for (const p of pins(n, board.modules).inputs) {
      const wires = board.wires.filter(
        (w) => w.to.node === n.id && w.to.pin === p.name,
      );
      if (!wires.length)
        issues.push(`Floating input: ${n.label}.${p.name} (Z).`);
      else if (
        wires.length > 1 &&
        pinValue(board, rt.outputs, n.id, p.name) === "X"
      )
        issues.push(`Conflicting/unknown drivers: ${n.label}.${p.name} (X).`);
    }
  if (rt.warning) issues.unshift(rt.warning);
  return issues;
}
export function componentCost(board: Board): number {
  return board.nodes.reduce(
    (cost, n) =>
      cost +
      (isSource(n.kind) || ["LED", "PROBE", "DISPLAY7"].includes(n.kind)
        ? 0
        : n.kind === "MODULE"
          ? componentCost({
              name: "block",
              nodes: board.modules.find((m) => m.id === n.moduleId)!.nodes,
              wires: [],
              modules: [],
            })
          : 1),
    0,
  );
}
export function packageModule(board: Board, name: string, id: string): Module {
  const inputs = board.nodes
      .filter((n) => n.kind === "SWITCH")
      .map((n, i) => ({ name: "I" + i, node: n.id })),
    outputs = board.nodes
      .filter((n) => ["LED", "PROBE"].includes(n.kind))
      .map((n, i) => ({ name: "O" + i, node: n.id }));
  const m = {
    id,
    name,
    nodes: structuredClone(board.nodes),
    wires: structuredClone(board.wires),
    inputs,
    outputs,
  };
  boardSchema.parse({ ...blankBoard, modules: [m] });
  return m;
}
export function pinPoint(
  d: Device,
  index: number,
  count: number,
  output = false,
  modules: Module[] = [],
) {
  const w = 148,
    h = Math.max(
      88,
      Math.max(
        pins(d, modules).inputs.length,
        pins(d, modules).outputs.length,
      ) *
        22 +
        45,
    );
  const x = output ? w : 0,
    y = 38 + ((index + 0.5) * (h - 42)) / Math.max(1, count);
  const angle = (d.rotation * Math.PI) / 180,
    cx = w / 2,
    cy = h / 2;
  return {
    x: d.x + cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
    y: d.y + cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle),
  };
}
export function boardDemo(): Board {
  const a = device("a", "SWITCH", 80, 100, "A"),
    b = device("b", "SWITCH", 80, 260, "B"),
    g = device("gate", "AND", 390, 180, "AND gate"),
    led = device("lamp", "LED", 700, 180, "Output LED");
  return {
    name: "First circuit — AND gate",
    nodes: [a, b, g, led],
    modules: [],
    wires: [
      {
        id: "w1",
        from: { node: "a", pin: "OUT" },
        to: { node: "gate", pin: "A" },
      },
      {
        id: "w2",
        from: { node: "b", pin: "OUT" },
        to: { node: "gate", pin: "B" },
      },
      {
        id: "w3",
        from: { node: "gate", pin: "Y" },
        to: { node: "lamp", pin: "IN" },
      },
    ],
  };
}
