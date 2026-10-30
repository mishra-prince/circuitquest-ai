"use client";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Play,
  Pause,
  Plus,
  Trash2,
  Upload,
  Grid3X3,
  Cable,
  Clock3,
  Binary,
  BookOpen,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { gates, type Gate } from "@/lib/logic";
import {
  type Circuit,
  type Cell,
  type SequentialKind,
  circuitSchema,
  compileExpressions,
  presets,
  simulate,
  circuitTable,
  minimize,
  grayOrder,
  sopExpression,
  sequentialKinds,
  sequentialStep,
  numberRepresentations,
} from "@/lib/digital";
import CircuitDiagram from "./CircuitDiagram";
import DigitalWorkbench from "./DigitalWorkbench";
const defaultCircuit = compileExpressions(
  presets[1].name,
  presets[1].expressions,
  presets[1].inputs,
);
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const sections = [
  { id: "workbench", name: "Build & play", icon: Cable },
  { id: "simulator", name: "Circuit simulator", icon: Cable },
  { id: "kmap", name: "Karnaugh maps", icon: Grid3X3 },
  { id: "sequential", name: "Sequential lab", icon: Clock3 },
  { id: "numbers", name: "Number systems", icon: Binary },
  { id: "reference", name: "Learning library", icon: BookOpen },
];
export default function ElectronicsStudio() {
  const [section, setSection] = useState("workbench"),
    [circuit, setCircuit] = useState<Circuit>(defaultCircuit),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("circuitquest-studio");
      if (raw) setCircuit(circuitSchema.parse(JSON.parse(raw)));
    } catch {
      setMessage(
        "The saved studio circuit could not be read. A full adder is ready.",
      );
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem("circuitquest-studio", JSON.stringify(circuit));
      } catch {
        setMessage(
          "Studio storage unavailable; use Export JSON to keep your circuit.",
        );
      }
  }, [circuit, loaded]);
  return (
    <div className="studio">
      <div
        className="studio-tabs"
        role="tablist"
        aria-label="Digital electronics tools"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => {
              setSection(s.id);
              setMessage("");
            }}
          >
            <s.icon size={17} />
            {s.name}
          </button>
        ))}
      </div>
      <div className="studio-intro">
        <span className="badge green">DETERMINISTIC DIGITAL ENGINE</span>
        <p>
          Build, inspect, simplify, and clock real Boolean state transitions.
          Runs locally without AI or asset downloads.
        </p>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {section === "workbench" ? (
        <DigitalWorkbench />
      ) : section === "simulator" ? (
        <Simulator
          circuit={circuit}
          setCircuit={setCircuit}
          message={setMessage}
        />
      ) : section === "kmap" ? (
        <KMap
          onBuild={(c) => {
            setCircuit(c);
            setSection("simulator");
            setMessage(
              "Your minimized function is now a connected, simulated circuit.",
            );
          }}
        />
      ) : section === "sequential" ? (
        <Sequential />
      ) : section === "numbers" ? (
        <Numbers />
      ) : (
        <Reference
          onPreset={(i) => {
            const p = presets[i];
            setCircuit(compileExpressions(p.name, p.expressions, p.inputs));
            setSection("simulator");
          }}
        />
      )}
      <div className="simulation-note">
        <b>Model boundaries</b>
        <p>
          The simple circuit simulator uses zero-delay gates. Build & play adds
          propagation delays, four-valued logic, and clocked devices. No analog
          voltages, metastability, transistor physics, or SPICE analysis is
          modeled. The AI upload feature continues to accept the validated 2–3
          input repair format.
        </p>
      </div>
    </div>
  );
}
function Simulator({
  circuit: c,
  setCircuit,
  message,
}: {
  circuit: Circuit;
  setCircuit: (c: Circuit) => void;
  message: (s: string) => void;
}) {
  const [values, setValues] = useState<Record<string, boolean>>({}),
    [expression, setExpression] = useState("(A XOR B) XOR C"),
    [selected, setSelected] = useState("g1"),
    [history, setHistory] = useState<
      { values: Record<string, boolean>; outputs: Record<string, boolean> }[]
    >([]);
  const s = simulate(c, values),
    rows = circuitTable(c);
  const node = c.nodes.find((n) => n.id === selected) || c.nodes[0];
  const prior = [
    "0",
    "1",
    ...c.inputs,
    ...c.nodes.slice(0, c.nodes.indexOf(node)).map((n) => n.id),
  ];
  function update(next: Circuit) {
    const parsed = circuitSchema.safeParse(next);
    if (parsed.success) {
      setCircuit(parsed.data);
      setHistory([]);
      message("");
    } else message("Invalid circuit: " + parsed.error.issues[0].message);
  }
  function toggle(input: string) {
    const next = { ...values, [input]: !values[input] };
    setValues(next);
    const signals = simulate(c, next);
    setHistory((h) =>
      [
        ...(h.length
          ? h
          : [
              {
                values,
                outputs: Object.fromEntries(
                  Object.entries(c.outputs).map(([k, v]) => [k, s[v]]),
                ),
              },
            ]),
        {
          values: next,
          outputs: Object.fromEntries(
            Object.entries(c.outputs).map(([k, v]) => [k, signals[v]]),
          ),
        },
      ].slice(-20),
    );
  }
  function patchNode(gate: Gate, refs = node.inputs) {
    const unary = ["NOT", "BUFFER"].includes(gate);
    update({
      ...c,
      name: "Custom circuit",
      nodes: c.nodes.map((n) =>
        n.id === node.id
          ? {
              ...n,
              gate,
              inputs: unary ? [refs[0]] : [refs[0], refs[1] || c.inputs[0]],
            }
          : n,
      ),
    });
  }
  return (
    <>
      <div className="studio-toolbar">
        <label>
          Explore a circuit
          <select
            aria-label="Circuit preset"
            value={presets.some((p) => p.name === c.name) ? c.name : ""}
            onChange={(e) => {
              const p = presets.find((p) => p.name === e.target.value)!;
              update(compileExpressions(p.name, p.expressions, p.inputs));
              setSelected("g1");
              setValues({});
            }}
          >
            <option value="" disabled>
              Custom circuit
            </option>
            {presets.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          onClick={() =>
            download("circuitquest-circuit.json", JSON.stringify(c, null, 2))
          }
        >
          <Download size={15} /> Export JSON
        </button>
        <label className="secondary import-label">
          <Upload size={15} /> Import JSON
          <input
            aria-label="Import circuit JSON"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 50000)
                  throw Error("Maximum circuit file size is 50 KB.");
                update(circuitSchema.parse(JSON.parse(await f.text())));
                setSelected("g1");
              } catch {
                message(
                  "Could not import this circuit. Use a valid CircuitQuest JSON file under 50 KB.",
                );
              }
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            const svg = document.getElementById("studio-diagram");
            if (svg)
              download(
                "circuitquest-diagram.svg",
                new XMLSerializer().serializeToString(svg),
                "image/svg+xml",
              );
          }}
        >
          <Download size={15} /> Export SVG
        </button>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>{c.name}</h2>
          <span className="badge">
            {c.nodes.length} GATES · {rows.length} CASES
          </span>
        </div>
        <p className="studio-subtitle">
          {presets.find((p) => p.name === c.name)?.detail ||
            "Your custom combinational logic network."}{" "}
          Click inputs to toggle; select a gate to edit its operation and
          wiring.
        </p>
        <CircuitDiagram
          id="studio-diagram"
          circuit={c}
          values={values}
          onInput={toggle}
          onGate={setSelected}
          selected={node.id}
        />
        <div className="signal-bar">
          {c.inputs.map((input) => (
            <button
              aria-label={`Studio input ${input}`}
              aria-pressed={!!values[input]}
              key={input}
              className={values[input] ? "chosen" : ""}
              onClick={() => toggle(input)}
            >
              {input} = {Number(!!values[input])}
            </button>
          ))}
          <span className="signal-divider" />
          {Object.entries(c.outputs).map(([name, ref]) => (
            <strong
              className={s[ref] ? "high" : ""}
              key={name}
              data-testid={"output-" + name}
            >
              {name} = {Number(s[ref])}
            </strong>
          ))}
        </div>
      </section>
      <div className="studio-two-col">
        <section className="panel studio-card">
          <h2>Gate & wiring editor</h2>
          <p>
            Only earlier signals are selectable, so feedback loops cannot be
            introduced.
          </p>
          <div className="editor-fields">
            <label>
              Selected gate
              <select
                aria-label="Edit gate"
                value={node.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {c.nodes.map((n) => (
                  <option key={n.id}>{n.id}</option>
                ))}
              </select>
            </label>
            <label>
              Operation
              <select
                aria-label="Gate operation"
                value={node.gate}
                onChange={(e) => patchNode(e.target.value as Gate)}
              >
                {gates.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            {node.inputs.map((ref, i) => (
              <label key={i}>
                Input {i + 1}
                <select
                  aria-label={`Gate input ${i + 1}`}
                  value={ref}
                  onChange={(e) =>
                    patchNode(
                      node.gate,
                      node.inputs.map((r, j) => (j === i ? e.target.value : r)),
                    )
                  }
                >
                  {prior.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="editor-actions">
            <button
              className="secondary"
              disabled={c.nodes.length >= 32}
              onClick={() => {
                const id =
                  "g" +
                  (Math.max(0, ...c.nodes.map((n) => Number(n.id.slice(1)))) +
                    1);
                update({
                  ...c,
                  name: "Custom circuit",
                  nodes: [
                    ...c.nodes,
                    {
                      id,
                      gate: "AND",
                      inputs: [c.inputs[0], c.inputs[1] || c.inputs[0]],
                    },
                  ],
                });
                setSelected(id);
              }}
            >
              <Plus size={15} /> Add gate
            </button>
            <button
              className="secondary"
              disabled={
                c.nodes.length === 1 ||
                c.nodes.some((n) => n.inputs.includes(node.id)) ||
                Object.values(c.outputs).includes(node.id)
              }
              onClick={() => {
                update({
                  ...c,
                  nodes: c.nodes.filter((n) => n.id !== node.id),
                });
                setSelected(c.nodes[0].id);
              }}
            >
              <Trash2 size={15} /> Delete unused gate
            </button>
          </div>
          <div className="editor-fields">
            {Object.entries(c.outputs).map(([name, ref]) => (
              <label key={name}>
                {name} probe
                <select
                  aria-label={`${name} output probe`}
                  value={ref}
                  onChange={(e) =>
                    update({
                      ...c,
                      outputs: { ...c.outputs, [name]: e.target.value },
                    })
                  }
                >
                  {[...c.inputs, "0", "1", ...c.nodes.map((n) => n.id)].map(
                    (r) => (
                      <option key={r}>{r}</option>
                    ),
                  )}
                </select>
              </label>
            ))}
          </div>
          <p className="mini-note">
            To remove a connected gate, first reroute its dependent wires and
            output probes.
          </p>
        </section>
        <section className="panel studio-card">
          <h2>Expression → circuit</h2>
          <p>
            Compile an expression into connected gates, without executing code.
            Precedence: NOT → AND → XOR → OR.
          </p>
          <label className="field-label" htmlFor="studio-expression">
            Boolean expression
          </label>
          <textarea
            id="studio-expression"
            value={expression}
            maxLength={1200}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="(A AND B) OR (NOT C AND D)"
          />
          <button
            className="primary"
            onClick={() => {
              try {
                update(
                  compileExpressions("Custom expression", { Y: expression }),
                );
                setSelected("g1");
              } catch (e) {
                message(e instanceof Error ? e.message : "Invalid expression");
              }
            }}
          >
            Build expression <ArrowRight size={16} />
          </button>
          <p className="mini-note">
            A–D, 0/1, parentheses, AND/NAND/OR/NOR/XOR/XNOR/NOT; aliases + * ^ !
            and postfix apostrophes. Explicit AND operators are required.
          </p>
        </section>
      </div>
      <div className="studio-two-col">
        <section className="panel">
          <div className="panel-title">
            <h2>Exhaustive truth table</h2>
            <button
              className="text-button"
              onClick={() =>
                download(
                  "truth-table.csv",
                  [
                    [...c.inputs, ...Object.keys(c.outputs)].join(","),
                    ...rows.map((r) =>
                      [
                        ...c.inputs.map((k) => Number(r.values[k])),
                        ...Object.keys(c.outputs).map((k) =>
                          Number(r.outputs[k]),
                        ),
                      ].join(","),
                    ),
                  ].join("\n"),
                  "text/csv",
                )
              }
            >
              Export CSV
            </button>
          </div>
          <div className="studio-table">
            <table>
              <thead>
                <tr>
                  {[...c.inputs, ...Object.keys(c.outputs)].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={
                      c.inputs.every((k) => r.values[k] === !!values[k])
                        ? "active-row"
                        : ""
                    }
                  >
                    {c.inputs.map((k) => (
                      <td key={k}>{Number(r.values[k])}</td>
                    ))}
                    {Object.keys(c.outputs).map((k) => (
                      <td key={k} className={r.outputs[k] ? "high" : ""}>
                        {Number(r.outputs[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel studio-card">
          <h2>Signal trace</h2>
          <p>
            Each input toggle records a settled sample. Horizontal axis is event
            order, not propagation time.
          </p>
          <Waveform
            samples={history.map((r) => ({ ...r.values, ...r.outputs }))}
            names={[...c.inputs, ...Object.keys(c.outputs)]}
          />
          {!history.length && (
            <p className="mini-note">Toggle an input to start recording.</p>
          )}
          <button className="text-button" onClick={() => setHistory([])}>
            Clear trace
          </button>
        </section>
      </div>
    </>
  );
}
function Waveform({
  samples,
  names,
}: {
  samples: Record<string, boolean>[];
  names: string[];
}) {
  const width = Math.max(400, 100 + samples.length * 28);
  return (
    <div className="diagram-scroll">
      <svg
        role="img"
        aria-label="Digital timing waveform"
        viewBox={`0 0 ${width} ${Math.max(90, names.length * 48 + 25)}`}
        style={{ minWidth: 400, width: "100%" }}
      >
        {names.map((name, j) => {
          const y = 20 + j * 48;
          let d = "";
          samples.forEach((sample, i) => {
            const sy = y + (sample[name] ? 0 : 22),
              x = 95 + i * 28;
            d += `${i ? "L" : "M"} ${x} ${sy} L ${x + 28} ${sy} `;
          });
          return (
            <g key={name}>
              <text
                x="5"
                y={y + 15}
                fill="#9bacc1"
                fontFamily="monospace"
                fontSize="11"
              >
                {name}
              </text>
              <path
                d={`M 90 ${y + 25} H ${width}`}
                stroke="#293445"
                fill="none"
              />
              <path d={d} stroke="#b5f36e" strokeWidth="2" fill="none" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function KMap({ onBuild }: { onBuild: (c: Circuit) => void }) {
  const [n, setN] = useState(3),
    [cells, setCells] = useState<Cell[]>([0, 1, 0, 1, 0, 1, 1, 1]),
    [mode, setMode] = useState<"SOP" | "POS">("SOP"),
    [active, setActive] = useState(-1),
    [task, setTask] = useState(false),
    [selection, setSelection] = useState<number[]>([]),
    [answer, setAnswer] = useState("");
  const result = minimize(cells, n, mode === "POS"),
    rBits = n === 4 ? 2 : 1,
    cBits = n - rBits,
    row = grayOrder(rBits),
    col = grayOrder(cBits),
    vars = "ABCD".slice(0, n),
    ones = cells.flatMap((v, i) => (v === 1 ? [i] : [])),
    dc = cells.flatMap((v, i) => (v === "X" ? [i] : []));
  function validGroup() {
    if (
      !selection.length ||
      !Number.isInteger(Math.log2(selection.length)) ||
      selection.some((i) => cells[i] === 0) ||
      !selection.some((i) => cells[i] === 1)
    )
      return false;
    const bits = selection.map((i) => i.toString(2).padStart(n, "0"));
    const pattern = [...bits[0]]
      .map((v, j) => (bits.every((b) => b[j] === v) ? v : "-"))
      .join("");
    const group = Array.from({ length: 2 ** n }, (_, i) => i).filter((i) =>
      [...pattern].every(
        (v, j) => v === "-" || v === i.toString(2).padStart(n, "0")[j],
      ),
    );
    return (
      group.length === selection.length &&
      group.every((i) => selection.includes(i))
    );
  }
  return (
    <>
      <div className="studio-toolbar">
        <label>
          Variables
          <select
            aria-label="K-map variables"
            value={n}
            onChange={(e) => {
              const v = Number(e.target.value);
              setN(v);
              setCells(Array(2 ** v).fill(0));
              setActive(-1);
              setSelection([]);
              setAnswer("");
            }}
          >
            {[2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v} variables
              </option>
            ))}
          </select>
        </label>
        <label>
          Normal form
          <select
            aria-label="K-map form"
            disabled={task}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "SOP" | "POS");
              setActive(-1);
            }}
          >
            <option>SOP</option>
            <option>POS</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            setCells(Array(2 ** n).fill(0));
            setActive(-1);
            setSelection([]);
            setAnswer("");
          }}
        >
          <RotateCcw size={15} /> Clear map
        </button>
        <button
          className="secondary"
          onClick={() => {
            setTask(!task);
            setSelection([]);
            setAnswer("");
          }}
        >
          {task ? "Edit map" : "Practice grouping"}
        </button>
      </div>
      <div className="studio-two-col">
        <section className="panel studio-card">
          <h2>{n}-variable Karnaugh map</h2>
          <p>
            {task
              ? "Select a valid SOP group, including wraparound neighbors. Groups must form a Boolean cube."
              : "Click a cell to cycle 0 → 1 → X (don’t-care). Rows and columns follow Gray-code order; opposite edges are adjacent."}
          </p>
          <div className="kmap-scroll">
            <table className="kmap">
              <thead>
                <tr>
                  <th>
                    {vars.slice(0, rBits)} \ {vars.slice(rBits)}
                  </th>
                  {col.map((c) => (
                    <th key={c}>{c.toString(2).padStart(cBits, "0")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row.map((r) => (
                  <tr key={r}>
                    <th>{r.toString(2).padStart(rBits, "0")}</th>
                    {col.map((co) => {
                      const index = (r << cBits) | co;
                      const group = result.groups[active];
                      return (
                        <td key={co}>
                          <button
                            aria-label={`K-map cell ${index}`}
                            aria-pressed={
                              task
                                ? selection.includes(index)
                                : group?.cells.includes(index) || false
                            }
                            className={`${cells[index] === 1 ? "one" : cells[index] === "X" ? "dontcare" : ""} ${selection.includes(index) ? "selected-cell" : ""} ${group?.cells.includes(index) ? "group-cell" : ""}`}
                            onClick={() => {
                              setAnswer("");
                              if (task)
                                setSelection((s) =>
                                  s.includes(index)
                                    ? s.filter((i) => i !== index)
                                    : [...s, index],
                                );
                              else {
                                setCells((c) =>
                                  c.map((v, i) =>
                                    i === index
                                      ? v === 0
                                        ? 1
                                        : v === 1
                                          ? "X"
                                          : 0
                                      : v,
                                  ),
                                );
                                setActive(-1);
                              }
                            }}
                          >
                            <small>m{index}</small>
                            {cells[index]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mini-note">
            Σm({ones.join(", ") || "∅"}){" "}
            {dc.length ? `+ d(${dc.join(", ")})` : ""}
          </p>
          {task && (
            <>
              <button
                className="primary"
                onClick={() =>
                  setAnswer(
                    validGroup()
                      ? "Valid group: power-of-two size, Boolean adjacency, and no zero cells."
                      : "Invalid group. Select a full power-of-two Boolean cube containing at least one 1, and no 0s.",
                  )
                }
              >
                Check selected group
              </button>
              <p role="status" className="group-feedback">
                {answer}
              </p>
            </>
          )}
        </section>
        <section className="panel studio-card">
          <span className="badge green">EXACT MINIMUM COVER</span>
          <h2 className="spaced-title">Simplified {mode}</h2>
          <div className="expression-result" data-testid="minimized-expression">
            Y = {result.expression}
          </div>
          <p>
            Minimum number of {mode === "SOP" ? "product" : "sum"} terms, then
            minimum total literals. X cells may be used to simplify; they do not
            have to be covered.
          </p>
          <div className="group-list">
            {result.groups.map((g, i) => (
              <button
                key={g.pattern}
                className={i === active ? "chosen" : ""}
                onClick={() => setActive(active === i ? -1 : i)}
              >
                <span>Group {i + 1}</span>
                <b>{g.term}</b>
                <small>
                  {g.cells.length} cells · {g.pattern}
                </small>
              </button>
            ))}
          </div>
          <button
            className="primary wide"
            onClick={() => {
              const sop = minimize(cells, n);
              onBuild(
                compileExpressions(
                  "K-map minimized circuit",
                  { Y: sopExpression(sop.groups) },
                  vars.split(""),
                ),
              );
            }}
          >
            Simulate minimized function <ArrowRight size={16} />
          </button>
          <p className="mini-note">
            Build generates an equivalent SOP implementation. Don't-care outputs
            use the chosen cover.
          </p>
        </section>
      </div>
    </>
  );
}
function Sequential() {
  const [kind, setKind] = useState<SequentialKind>("D flip-flop"),
    [inputs, setInputs] = useState<Record<string, boolean>>({
      D: false,
      T: false,
      J: false,
      K: false,
      S: false,
      R: false,
      EN: true,
    }),
    [run, setRun] = useState(false),
    [state, setState] = useState({
      q: 0,
      clock: false,
      warning: "",
      history: [] as Record<string, boolean>[],
    });
  const inputRef = useRef(inputs);
  inputRef.current = inputs;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const tick = () =>
    setState((prev) => {
      const clk = !prev.clock;
      const next = clk
        ? sequentialStep(kindRef.current, prev.q, inputRef.current)
        : { q: prev.q, warning: prev.warning };
      const signals = {
        ...inputRef.current,
        CLK: clk,
        Q: !!(next.q & 1),
        Q3: !!(next.q & 8),
        Q2: !!(next.q & 4),
        Q1: !!(next.q & 2),
        Q0: !!(next.q & 1),
      };
      return {
        q: next.q,
        clock: clk,
        warning: next.warning,
        history: [...prev.history, signals].slice(-24),
      };
    });
  useEffect(() => {
    if (!run) return;
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [run]);
  const names =
    kind === "JK flip-flop"
      ? ["J", "K"]
      : kind === "SR flip-flop"
        ? ["S", "R"]
        : kind === "T flip-flop"
          ? ["T"]
          : kind === "4-bit counter"
            ? ["EN"]
            : ["D"];
  const multi = kind.startsWith("4-bit");
  return (
    <>
      <div className="studio-toolbar">
        <label>
          Sequential device
          <select
            aria-label="Sequential device"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SequentialKind);
              setRun(false);
              setState({ q: 0, clock: false, warning: "", history: [] });
            }}
          >
            {sequentialKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => setRun(!run)}>
          {run ? <Pause size={15} /> : <Play size={15} />}{" "}
          {run ? "Pause clock" : "Run clock"}
        </button>
        <button className="secondary" disabled={run} onClick={tick}>
          Step half-cycle
        </button>
        <button
          className="secondary"
          onClick={() => {
            setRun(false);
            setState({ q: 0, clock: false, warning: "", history: [] });
          }}
        >
          <RotateCcw size={15} /> Reset state
        </button>
      </div>
      <div className="studio-two-col">
        <section className="panel studio-card">
          <h2>{kind}</h2>
          <p>
            Positive-edge triggered. Change inputs, then step LOW → HIGH to
            sample them. HIGH → LOW holds state. Auto clock is 1 Hz.
          </p>
          <div className="sequential-device">
            <div className="seq-pins">
              {names.map((name) => (
                <button
                  aria-pressed={!!inputs[name]}
                  aria-label={`Sequential input ${name}`}
                  key={name}
                  className={inputs[name] ? "chosen" : ""}
                  onClick={() => setInputs((i) => ({ ...i, [name]: !i[name] }))}
                >
                  {name}: {Number(!!inputs[name])}
                </button>
              ))}
              <span className={state.clock ? "high" : ""}>
                ▷ CLK: {Number(state.clock)}
              </span>
            </div>
            <div className="seq-block">
              <Clock3 size={32} />
              <b>{kind.replace("4-bit ", "")}</b>
              <span>RISING EDGE</span>
            </div>
            <div className="seq-state">
              <b data-testid="sequential-state">
                {state.q.toString(2).padStart(multi ? 4 : 1, "0")}
              </b>
              <span>Q {multi ? `= ${state.q} decimal` : ""}</span>
              {!multi && <span>Q̅ = {1 - state.q}</span>}
            </div>
          </div>
          {state.warning && (
            <div role="status" className="notice">
              {state.warning}
            </div>
          )}
          <div className="equation-box">
            {kind === "D flip-flop"
              ? "Q(next) = D"
              : kind === "T flip-flop"
                ? "Q(next) = T XOR Q"
                : kind === "JK flip-flop"
                  ? "00: hold · 01: reset · 10: set · 11: toggle"
                  : kind === "SR flip-flop"
                    ? "00: hold · 01: reset · 10: set · 11: forbidden"
                    : kind === "4-bit counter"
                      ? "EN=1: Q(next) = (Q + 1) mod 16; EN=0: hold"
                      : "Q(next) = ((Q << 1) | D) mod 16; D enters Q0"}
          </div>
        </section>
        <section className="panel studio-card">
          <h2>Clock & state waveform</h2>
          <p>Last 24 half-cycle samples. Reset clears state and trace.</p>
          <Waveform
            samples={state.history}
            names={[
              "CLK",
              ...names,
              ...(multi ? ["Q3", "Q2", "Q1", "Q0"] : ["Q"]),
            ]}
          />
        </section>
      </div>
    </>
  );
}
function Numbers() {
  const [value, setValue] = useState("13"),
    [radix, setRadix] = useState(10),
    [width, setWidth] = useState(8);
  let result: ReturnType<typeof numberRepresentations> | null = null,
    error = "";
  try {
    const valid =
      radix === 2
        ? /^-?[01]+$/
        : radix === 8
          ? /^-?[0-7]+$/
          : radix === 16
            ? /^-?[\da-f]+$/i
            : /^-?\d+$/;
    if (!valid.test(value))
      throw Error("Enter valid digits for the selected base.");
    result = numberRepresentations(parseInt(value, radix), width);
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid number";
  }
  return (
    <>
      <div className="studio-toolbar">
        <label htmlFor="number-value">
          Number
          <input
            id="number-value"
            value={value}
            maxLength={20}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Input base
          <select
            aria-label="Input base"
            value={radix}
            onChange={(e) => setRadix(Number(e.target.value))}
          >
            {[
              [2, "Binary"],
              [8, "Octal"],
              [10, "Decimal"],
              [16, "Hexadecimal"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Word size
          <select
            aria-label="Word size"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[4, 8, 16].map((n) => (
              <option key={n} value={n}>
                {n} bits
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div role="status" className="notice">
          {error}
        </div>
      ) : (
        result && (
          <div className="number-grid">
            {Object.entries(result).map(([label, v]) => (
              <section className="panel studio-card" key={label}>
                <span className="eyebrow">
                  {label.replace(/([A-Z])/g, " $1").toUpperCase()}
                </span>
                <div className="number-value">{v}</div>
              </section>
            ))}
          </div>
        )
      )}
      <div className="panel studio-card number-explainer">
        <h2>One bit pattern, several meanings</h2>
        <p>
          The unsigned and signed values interpret the same {width}-bit word.
          Signed uses two’s complement. The complement cards show the bitwise
          one’s complement and modular two’s complement of that word. Gray code
          is binary XOR (binary shifted right by one). BCD encodes each decimal
          magnitude digit separately; the sign is not encoded.
        </p>
      </div>
    </>
  );
}
const lessons = [
  {
    title: "Boolean algebra & De Morgan",
    body: "Identity: A+0=A, A·1=A. Complement: A+A'=1, A·A'=0. De Morgan: (A·B)'=A'+B' and (A+B)'=A'·B'. NAND and NOR are universal gates.",
    preset: 10,
  },
  {
    title: "K-map adjacency & minimization",
    body: "Gray order is 00, 01, 11, 10. Group 1s for SOP or 0s for POS in rectangles of 1, 2, 4, 8 or 16 cells. Groups may overlap and wrap across either edge. Diagonal cells are not adjacent. Eliminate variables that change within a group.",
    preset: 0,
  },
  {
    title: "Adders & subtractors",
    body: "A half adder produces Sum=A XOR B and Carry=A·B. A full adder includes carry-in. Half subtractor Difference=A XOR B, Borrow=A′·B. A full subtractor also handles borrow-in.",
    preset: 1,
  },
  {
    title: "Multiplexers & demultiplexers",
    body: "A multiplexer selects one source for one output. A demultiplexer routes one source to one selected output. For a 2:1 mux, Y=A·S′ + B·S.",
    preset: 4,
  },
  {
    title: "Decoders & priority encoders",
    body: "A decoder maps a binary address to one active output. A priority encoder maps the highest-priority active input to a binary address; a Valid output indicates that any input is active.",
    preset: 6,
  },
  {
    title: "Comparators & parity",
    body: "A comparator reports greater-than, equality, or less-than. XOR computes parity: odd input parity yields 1. Parity can detect any odd number of bit flips but does not locate or correct them.",
    preset: 8,
  },
  {
    title: "Flip-flops & timing",
    body: "D copies data at the active edge. T toggles when enabled. JK adds hold/set/reset/toggle. Clocked SR forbids S=R=1. Real devices need setup/hold times; this ideal simulator does not model their analog timing.",
    preset: 0,
  },
  {
    title: "Counters, registers & finite state",
    body: "A counter is a finite-state machine that advances through a sequence. A shift register moves bits on clock edges. The sequential lab has a synchronous modulo-16 binary counter and a four-bit serial-input shift register; arbitrary FSM editing is outside this version.",
    preset: 11,
  },
  {
    title: "Binary, complements & BCD",
    body: "Unsigned n-bit range is 0 to 2ⁿ−1. Signed two’s complement range is −2ⁿ⁻¹ to 2ⁿ⁻¹−1. BCD uses four bits per decimal digit. Gray code changes one bit between neighboring codes.",
    preset: 11,
  },
  {
    title: "Memory & programmable logic",
    body: "A latch is level-sensitive; a flip-flop is edge-triggered. Registers group state bits. RAM supports reads and writes, ROM stores a fixed mapping, and programmable logic implements configurable functions. These concepts are reference material here, not a memory-chip or FPGA simulator.",
    preset: 6,
  },
];
function Reference({ onPreset }: { onPreset: (i: number) => void }) {
  const [filter, setFilter] = useState("");
  return (
    <>
      <label className="field-label" htmlFor="reference-search">
        Find a digital electronics topic
      </label>
      <input
        id="reference-search"
        className="reference-search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search K-map, parity, flip-flop, memory…"
      />
      <div className="reference-grid">
        {lessons
          .filter((l) =>
            (l.title + " " + l.body)
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((l) => (
            <section className="panel studio-card" key={l.title}>
              <h2>{l.title}</h2>
              <p>{l.body}</p>
              <button
                className="text-button"
                onClick={() => onPreset(l.preset)}
              >
                Explore a related circuit <ArrowRight size={14} />
              </button>
            </section>
          ))}
      </div>
      {!lessons.some((l) =>
        (l.title + " " + l.body).toLowerCase().includes(filter.toLowerCase()),
      ) && <p>No matching topic. Try “counter” or “Boolean”.</p>}
    </>
  );
}
