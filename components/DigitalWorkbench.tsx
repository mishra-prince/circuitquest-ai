"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCw,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Move,
  Download,
  Upload,
  Save,
  Check,
  Lightbulb,
  Trophy,
  ArrowRight,
  Cable,
  MousePointer2,
} from "lucide-react";
import {
  type Board,
  type Device,
  type Kind,
  type Signal,
  type Runtime,
  type Wire,
  deviceKinds,
  device,
  pins,
  blankBoard,
  boardDemo,
  boardSchema,
  createRuntime,
  advance,
  drive,
  pinValue,
  diagnostics,
  pinPoint,
  packageModule,
  isSource,
} from "@/lib/bench";
import { benchMissions, checkMission, type CheckResult } from "@/lib/missions";
type Progress = Record<string, { stars: number; xp: number }>;
type SaveState = {
  board: Board;
  mission: string;
  progress: Progress;
  attempts: number;
  hints: number;
  revealed: boolean;
};
const initial: SaveState = {
  board: boardDemo(),
  mission: "",
  progress: {},
  attempts: 0,
  hints: 0,
  revealed: false,
};
const categories: { name: string; kinds: Kind[] }[] = [
  {
    name: "Inputs & sources",
    kinds: ["SWITCH", "BUTTON", "CLOCK", "PATTERN", "ZERO", "ONE"],
  },
  {
    name: "Logic & routing",
    kinds: [
      "AND",
      "OR",
      "XOR",
      "NAND",
      "NOR",
      "XNOR",
      "NOT",
      "BUFFER",
      "TRI",
      "MUX2",
      "DECODER2",
    ],
  },
  { name: "Indicators & instruments", kinds: ["LED", "PROBE", "DISPLAY7"] },
  {
    name: "State & memory",
    kinds: ["DFF", "TFF", "JKFF", "REGISTER4", "COUNTER4", "ROM4", "RAM4"],
  },
  { name: "Buses", kinds: ["PACK4", "UNPACK4"] },
];
const names: Partial<Record<Kind, string>> = {
  SWITCH: "Toggle switch",
  BUTTON: "Push button",
  CLOCK: "Clock",
  PATTERN: "Pattern generator",
  ZERO: "Logic 0",
  ONE: "Logic 1",
  TRI: "Tri-state buffer",
  PROBE: "Logic probe",
  DISPLAY7: "7-segment display",
  MUX2: "2:1 multiplexer",
  DECODER2: "2:4 decoder",
  DFF: "D flip-flop",
  TFF: "T flip-flop",
  JKFF: "JK flip-flop",
  REGISTER4: "4-bit register",
  COUNTER4: "4-bit counter",
  ROM4: "4×4 ROM",
  RAM4: "4×4 RAM",
  PACK4: "4-bit bus packer",
  UNPACK4: "4-bit bus splitter",
};
const color = (v: Signal) =>
  v === "X"
    ? "#ffb573"
    : v === "Z"
      ? "#7b8aa0"
      : v === 0
        ? "#718aa9"
        : "#b5f36e";
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function height(n: Device, b: Board) {
  const p = pins(n, b.modules);
  return Math.max(88, Math.max(p.inputs.length, p.outputs.length) * 22 + 45);
}
export default function DigitalWorkbench() {
  const [save, setSave] = useState<SaveState>(initial),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState("gate"),
    [selectedWire, setSelectedWire] = useState(""),
    [pending, setPending] = useState<{ node: string; pin: string } | null>(
      null,
    ),
    [running, setRunning] = useState(false),
    [runtime, setRuntime] = useState<Runtime>(() =>
      createRuntime(initial.board),
    ),
    [samples, setSamples] = useState<
      { time: number; values: Record<string, Signal> }[]
    >([]),
    [view, setView] = useState({ x: 0, y: 0, zoom: 1 }),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<CheckResult | null>(null),
    [search, setSearch] = useState(""),
    [pan, setPan] = useState(false),
    [wireFrom, setWireFrom] = useState(""),
    [wireTo, setWireTo] = useState(""),
    [moduleName, setModuleName] = useState("My logic block");
  const undo = useRef<Board[]>([]),
    redo = useRef<Board[]>([]),
    svg = useRef<SVGSVGElement | null>(null),
    drag = useRef<{
      kind: "node" | "pan";
      id?: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      before?: Board;
    } | null>(null),
    stateRef = useRef(save),
    rtRef = useRef(runtime);
  stateRef.current = save;
  rtRef.current = runtime;
  const b = save.board,
    mission = benchMissions.find((m) => m.id === save.mission),
    node = b.nodes.find((n) => n.id === selected),
    issues = diagnostics(b, runtime);
  const totalXP = Object.values(save.progress).reduce(
    (sum, v) => sum + v.xp,
    0,
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("circuitquest-workbench-v1");
      if (raw) {
        const s = JSON.parse(raw);
        const parsed = boardSchema.parse(s.board);
        if (
          typeof s.mission !== "string" ||
          (s.mission && !benchMissions.some((m) => m.id === s.mission)) ||
          !Number.isInteger(s.attempts) ||
          s.attempts < 0 ||
          !Number.isInteger(s.hints) ||
          s.hints < 0 ||
          s.hints > 3 ||
          typeof s.revealed !== "boolean" ||
          !s.progress ||
          typeof s.progress !== "object" ||
          Object.entries(s.progress).some(
            ([id, v]) =>
              !benchMissions.some((m) => m.id === id) ||
              !v ||
              typeof v !== "object" ||
              !Number.isInteger((v as { stars: number }).stars) ||
              (v as { stars: number }).stars < 1 ||
              (v as { stars: number }).stars > 3 ||
              !Number.isInteger((v as { xp: number }).xp) ||
              (v as { xp: number }).xp < 0 ||
              (v as { xp: number }).xp > 200,
          )
        )
          throw Error();
        setSave({ ...s, board: parsed });
        setRuntime(createRuntime(parsed));
        setSelected(parsed.nodes[0]?.id || "");
      }
    } catch {
      setMessage(
        "Saved workbench could not be read. The demo circuit is ready.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("circuitquest-workbench-v1", JSON.stringify(save));
      } catch {
        setMessage(
          "Browser storage is unavailable. Export your board to keep it.",
        );
      }
  }, [save, ready]);
  function capture(board: Board, rt: Runtime) {
    const values: Record<string, Signal> = {};
    board.nodes
      .filter((n) => ["LED", "PROBE", "CLOCK"].includes(n.kind))
      .slice(0, 10)
      .forEach((n) => {
        values[`${n.label} [${n.id}]`] =
          n.kind === "CLOCK"
            ? rt.outputs[n.id + ".OUT"]
            : pinValue(board, rt.outputs, n.id, "IN");
      });
    setSamples((s) => [...s, { time: rt.time, values }].slice(-48));
  }
  function step(delta = 10) {
    const board = stateRef.current.board;
    const next = advance(board, rtRef.current, delta);
    rtRef.current = next;
    setRuntime(next);
    capture(board, next);
  }
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => step(10), 100);
    return () => clearInterval(timer);
  }, [running]);
  function resetRuntime(board = b) {
    setRunning(false);
    const rt = createRuntime(board);
    rtRef.current = rt;
    setRuntime(rt);
    setSamples([]);
    setPending(null);
    setResult(null);
  }
  function edit(next: Board, record = true) {
    const parsed = boardSchema.safeParse(next);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }
    if (record) {
      undo.current = [...undo.current, b].slice(-60);
      redo.current = [];
    }
    setSave((s) => ({ ...s, board: parsed.data }));
    resetRuntime(parsed.data);
    setMessage("");
  }
  function load(board: Board, missionId = "") {
    undo.current = [];
    redo.current = [];
    setSave((s) => ({
      ...s,
      board,
      mission: missionId,
      attempts: 0,
      hints: 0,
      revealed: false,
    }));
    setSelected(board.nodes[0]?.id || "");
    setSelectedWire("");
    setView({ x: 0, y: 0, zoom: 1 });
    setMessage("");
    resetRuntime(board);
  }
  function nextId(prefix = "n") {
    let id = 1;
    while (
      b.nodes.some((n) => n.id === prefix + id) ||
      b.modules.some((m) => m.id === prefix + id)
    )
      id++;
    return prefix + id;
  }
  function add(
    kind: Kind,
    x = view.x + 100 + ((b.nodes.length % 3) * 200) / view.zoom,
    y = view.y + 80 + ((Math.floor(b.nodes.length / 3) % 3) * 120) / view.zoom,
    moduleId?: string,
  ) {
    if (b.nodes.length >= 64) {
      setMessage("Board limit: 64 components.");
      return;
    }
    const n = device(
      nextId(),
      kind,
      Math.round(x / 20) * 20,
      Math.round(y / 20) * 20,
      names[kind] || kind,
    );
    n.moduleId = moduleId;
    if (kind === "MODULE")
      n.label = b.modules.find((m) => m.id === moduleId)?.name || "Logic block";
    edit({ ...b, nodes: [...b.nodes, n] });
    setSelected(n.id);
  }
  function removeNode() {
    if (!node) return;
    edit({
      ...b,
      nodes: b.nodes.filter((n) => n.id !== node.id),
      wires: b.wires.filter(
        (w) => w.from.node !== node.id && w.to.node !== node.id,
      ),
    });
    setSelected("");
  }
  function patch(fields: Partial<Device>) {
    if (node)
      edit({
        ...b,
        nodes: b.nodes.map((n) => (n.id === node.id ? { ...n, ...fields } : n)),
      });
  }
  function connect(
    from: { node: string; pin: string },
    to: { node: string; pin: string },
  ) {
    let i = 1;
    while (b.wires.some((w) => w.id === "w" + i)) i++;
    edit({ ...b, wires: [...b.wires, { id: "w" + i, from, to }] });
    setPending(null);
  }
  function sourceValue(n: Device, value: number) {
    const next = advance(b, drive(b, rtRef.current, n.id, value), 0);
    rtRef.current = next;
    setRuntime(next);
    capture(b, next);
  }
  function toggle(n: Device) {
    if (["ZERO", "ONE"].includes(n.kind)) return;
    sourceValue(n, runtime.outputs[n.id + ".OUT"] === 1 ? 0 : 1);
  }
  function coordinate(clientX: number, clientY: number) {
    const pt = svg.current!.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  }
  function verify() {
    if (!mission) return;
    setRunning(false);
    const r = checkMission(mission, b);
    setResult(r);
    setSave((s) => {
      const attempts = s.attempts + 1;
      if (!r.pass || s.revealed || s.progress[mission.id])
        return { ...s, attempts };
      const stars = s.hints === 0 && attempts === 1 ? 3 : s.hints <= 1 ? 2 : 1,
        xp = Math.max(30, 200 - (attempts - 1) * 15 - s.hints * 30);
      return {
        ...s,
        attempts,
        progress: { ...s.progress, [mission.id]: { stars, xp } },
      };
    });
  }
  const endpointOptions = (output: boolean) =>
    b.nodes.flatMap((n) =>
      (output ? pins(n, b.modules).outputs : pins(n, b.modules).inputs).map(
        (p) => ({
          ref: n.id + "." + p.name,
          label: n.label + " · " + p.name + (p.width === 4 ? " [4-bit]" : ""),
        }),
      ),
    );
  return (
    <div className="workbench">
      <div className="bench-mode-bar">
        <div>
          <span className="badge green">BUILD · MEASURE · PLAY</span>
          <h2>Digital workbench</h2>
          <p>
            A connected digital sandbox and six engineering missions. No API key
            needed.
          </p>
        </div>
        <span className="bench-xp">
          <Trophy size={18} />
          {totalXP} XP · {Object.keys(save.progress).length}/6 missions
        </span>
      </div>
      <div className="bench-mission-nav">
        <button
          className={!mission ? "chosen" : ""}
          onClick={() => {
            if (!mission) return;
            load(boardDemo());
          }}
        >
          Sandbox
        </button>
        {benchMissions.map((m, i) => (
          <button
            key={m.id}
            disabled={i > 0 && !save.progress[benchMissions[i - 1].id]}
            className={mission?.id === m.id ? "chosen" : ""}
            onClick={() => load(m.starter(), m.id)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {m.name}
            {save.progress[m.id] && (
              <b>{"★".repeat(save.progress[m.id].stars)}</b>
            )}
          </button>
        ))}
      </div>
      {mission && (
        <section className="bench-brief">
          <div>
            <span className="eyebrow">
              {mission.category} · {mission.subtitle}
            </span>
            <h3>{mission.name}</h3>
            <p>{mission.story}</p>
            <p className="mission-objective">{mission.brief}</p>
            <small>
              Keep the supplied input and output components so the test harness
              can drive and measure them.
            </small>
          </div>
          <div className="bench-mission-actions">
            <button className="primary" onClick={verify}>
              <Check size={16} /> Test mission
            </button>
            <button
              className="secondary"
              disabled={save.hints >= 3}
              onClick={() =>
                setSave((s) => ({ ...s, hints: Math.min(3, s.hints + 1) }))
              }
            >
              <Lightbulb size={16} /> Hint ({save.hints}/3)
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (
                  confirm(
                    "Load the worked solution? This attempt becomes practice and earns no stars or XP.",
                  )
                ) {
                  edit(mission.solution());
                  setSave((s) => ({ ...s, revealed: true }));
                }
              }}
            >
              Load worked example
            </button>
          </div>
        </section>
      )}
      {mission && save.hints > 0 && (
        <div className="hint-box">
          <Lightbulb size={17} />
          <p>{mission.hints[save.hints - 1]}</p>
        </div>
      )}
      {result && (
        <div
          className={
            result.pass ? "bench-result success" : "bench-result notice"
          }
          role="status"
        >
          <div>
            <b>
              {result.pass
                ? save.revealed
                  ? "Worked example verified — practice only"
                  : `Mission verified! ${save.progress[mission!.id] ? "★".repeat(save.progress[mission!.id].stars) : ""}`
                : "Keep investigating"}
            </b>
            <p>
              {result.cases} assertions · {result.cost}/{result.budget} devices
            </p>
            <p className="mini-note">
              Tests use fresh simulation runs; the live canvas keeps its current
              inputs and time.
            </p>
            {result.failures.map((f) => (
              <p key={f} className="failure-line">
                {f}
              </p>
            ))}
          </div>
          {result.pass &&
            mission &&
            benchMissions.indexOf(mission) < 5 &&
            save.progress[mission.id] && (
              <button
                className="primary"
                onClick={() => {
                  const next =
                    benchMissions[benchMissions.indexOf(mission) + 1];
                  load(next.starter(), next.id);
                }}
              >
                Next mission <ArrowRight size={15} />
              </button>
            )}
        </div>
      )}
      <div className="bench-toolbar">
        <button className="primary" onClick={() => setRunning(!running)}>
          {running ? <Pause size={15} /> : <Play size={15} />}{" "}
          {running ? "Pause simulation" : "Run simulation"}
        </button>
        <button
          className="secondary"
          onClick={() => step(10)}
          disabled={running}
        >
          Step 10 ns
        </button>
        <button className="secondary" onClick={() => resetRuntime()}>
          <RotateCw size={14} /> Reset time
        </button>
        <span className="time-readout" data-testid="bench-time">
          {runtime.time} ns
        </span>
        <div className="toolbar-spacer" />
        <button
          className="icon-button"
          aria-label="Undo edit"
          disabled={!undo.current.length}
          onClick={() => {
            const prev = undo.current.pop()!;
            redo.current.push(b);
            edit(prev, false);
          }}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Redo edit"
          disabled={!redo.current.length}
          onClick={() => {
            const next = redo.current.pop()!;
            undo.current.push(b);
            edit(next, false);
          }}
        >
          <Redo2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.min(2, v.zoom + 0.2) }))
          }
        >
          <ZoomIn size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.max(0.4, v.zoom - 0.2) }))
          }
        >
          <ZoomOut size={17} />
        </button>
        <button
          className={`icon-button ${pan ? "chosen" : ""}`}
          aria-label="Pan canvas"
          aria-pressed={pan}
          onClick={() => setPan(!pan)}
        >
          <Move size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Fit board"
          onClick={() => {
            const minX = Math.min(0, ...b.nodes.map((n) => n.x - 30)),
              minY = Math.min(0, ...b.nodes.map((n) => n.y - 30)),
              maxX = Math.max(950, ...b.nodes.map((n) => n.x + 200)),
              maxY = Math.max(
                560,
                ...b.nodes.map((n) => n.y + height(n, b) + 40),
              );
            setView({
              x: minX,
              y: minY,
              zoom: Math.min(950 / (maxX - minX), 560 / (maxY - minY), 1),
            });
          }}
        >
          <MousePointer2 size={17} />
        </button>
      </div>
      <div className="bench-layout">
        <aside className="component-palette">
          <label htmlFor="palette-search">COMPONENTS</label>
          <input
            id="palette-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a component…"
          />
          {categories.map((cat) => (
            <div key={cat.name}>
              <h4>{cat.name}</h4>
              <div className="palette-grid">
                {cat.kinds
                  .filter((k) =>
                    (k + " " + names[k])
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((k) => (
                    <button
                      key={k}
                      draggable
                      aria-label={`Add ${names[k] || k}`}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("application/circuitquest", k)
                      }
                      onClick={() => add(k)}
                      title="Drag onto canvas, or click to add"
                    >
                      <span>
                        {k === "LED"
                          ? "◉"
                          : k === "CLOCK"
                            ? "◷"
                            : k === "DISPLAY7"
                              ? "8"
                              : k === "PROBE"
                                ? "⌁"
                                : "◇"}
                      </span>
                      <b>{names[k] || k}</b>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {b.modules.length > 0 && (
            <>
              <h4>Your reusable blocks</h4>
              {b.modules.map((m) => (
                <button
                  className="module-palette"
                  key={m.id}
                  onClick={() => add("MODULE", 200, 200, m.id)}
                >
                  {m.name}
                </button>
              ))}
            </>
          )}
        </aside>
        <div className="canvas-area">
          <div className="canvas-heading">
            <span>
              <span className="live-dot" /> {b.name}
            </span>
            <span>
              {b.nodes.length}/64 components · {b.wires.length} wires
            </span>
          </div>
          <div
            className="canvas-container"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData(
                "application/circuitquest",
              ) as Kind;
              if (deviceKinds.includes(kind) && kind !== "MODULE") {
                const pt = coordinate(e.clientX, e.clientY);
                add(kind, pt.x - 74, pt.y - 40);
              }
            }}
          >
            <svg
              ref={svg}
              id="advanced-board-svg"
              className="bench-canvas"
              viewBox={`${view.x} ${view.y} ${950 / view.zoom} ${560 / view.zoom}`}
              xmlns="http://www.w3.org/2000/svg"
              role="group"
              aria-label="Interactive digital circuit canvas"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                drag.current = {
                  kind: "pan",
                  startX: e.clientX,
                  startY: e.clientY,
                  x: view.x,
                  y: view.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                if (d.kind === "pan") {
                  const rect = svg.current!.getBoundingClientRect();
                  setView((v) => ({
                    ...v,
                    x:
                      d.x -
                      ((e.clientX - d.startX) * 950) / (rect.width * v.zoom),
                    y:
                      d.y -
                      ((e.clientY - d.startY) * 560) / (rect.height * v.zoom),
                  }));
                } else {
                  const pt = coordinate(e.clientX, e.clientY);
                  const x = Math.max(
                      -3000,
                      Math.min(
                        5800,
                        Math.round((d.x + pt.x - d.startX) / 20) * 20,
                      ),
                    ),
                    y = Math.max(
                      -3000,
                      Math.min(
                        5800,
                        Math.round((d.y + pt.y - d.startY) / 20) * 20,
                      ),
                    );
                  setSave((s) => ({
                    ...s,
                    board: {
                      ...s.board,
                      nodes: s.board.nodes.map((n) =>
                        n.id === d.id ? { ...n, x, y } : n,
                      ),
                    },
                  }));
                }
              }}
              onPointerUp={() => {
                if (drag.current?.kind === "node" && drag.current.before) {
                  undo.current = [...undo.current, drag.current.before].slice(
                    -60,
                  );
                  redo.current = [];
                  setSave((s) => ({ ...s }));
                }
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <defs>
                <pattern
                  id="bench-grid"
                  x="0"
                  y="0"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r=".8" fill="#35485d" />
                </pattern>
              </defs>
              <rect
                x={view.x}
                y={view.y}
                width={950 / view.zoom}
                height={560 / view.zoom}
                fill="#101720"
              />
              <rect
                x={view.x}
                y={view.y}
                width={950 / view.zoom}
                height={560 / view.zoom}
                fill="url(#bench-grid)"
              />
              {b.wires.map((w) => {
                const a = b.nodes.find((n) => n.id === w.from.node)!,
                  d = b.nodes.find((n) => n.id === w.to.node)!;
                const ap = pins(a, b.modules).outputs,
                  dp = pins(d, b.modules).inputs;
                const p = pinPoint(
                    a,
                    ap.findIndex((p) => p.name === w.from.pin),
                    ap.length,
                    true,
                    b.modules,
                  ),
                  q = pinPoint(
                    d,
                    dp.findIndex((p) => p.name === w.to.pin),
                    dp.length,
                    false,
                    b.modules,
                  ),
                  v = runtime.outputs[w.from.node + "." + w.from.pin] ?? "X";
                const path = `M ${p.x} ${p.y} C ${p.x + 70} ${p.y}, ${q.x - 70} ${q.y}, ${q.x} ${q.y}`;
                return (
                  <g
                    key={w.id}
                    role="button"
                    aria-label={`Select wire ${w.id}`}
                    tabIndex={0}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedWire(w.id);
                      setSelected("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelectedWire(w.id);
                    }}
                  >
                    <title>{`${w.from.node}.${w.from.pin} → ${w.to.node}.${w.to.pin}: ${v}`}</title>
                    <path
                      d={path}
                      stroke="transparent"
                      strokeWidth="15"
                      fill="none"
                    />
                    <path
                      d={path}
                      stroke={selectedWire === w.id ? "#86baff" : color(v)}
                      strokeWidth={
                        ap.find((p) => p.name === w.from.pin)?.width === 4
                          ? 5
                          : 2.5
                      }
                      strokeDasharray={v === "Z" ? "5 5" : undefined}
                      fill="none"
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
              {b.nodes.map((n) => {
                const ps = pins(n, b.modules),
                  h = height(n, b),
                  out =
                    runtime.outputs[n.id + "." + (ps.outputs[0]?.name || "")],
                  input = pinValue(b, runtime.outputs, n.id, "IN");
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x} ${n.y}) rotate(${n.rotation} 74 ${h / 2})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (pan) {
                        drag.current = {
                          kind: "pan",
                          startX: e.clientX,
                          startY: e.clientY,
                          x: view.x,
                          y: view.y,
                        };
                        svg.current!.setPointerCapture(e.pointerId);
                      }
                    }}
                  >
                    <rect
                      width="148"
                      height={h}
                      rx="10"
                      fill={n.id === selected ? "#233447" : "#1a2736"}
                      stroke={n.id === selected ? "#b5f36e" : "#58718f"}
                      strokeWidth={n.id === selected ? 2 : 1}
                    />
                    <g
                      role="button"
                      aria-label={`Select component ${n.label}`}
                      tabIndex={0}
                      style={{ cursor: pan ? "grab" : "move" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setSelected(n.id);
                          setSelectedWire("");
                        }
                      }}
                      onPointerDown={(e) => {
                        if (pan) return;
                        e.stopPropagation();
                        setRunning(false);
                        const pt = coordinate(e.clientX, e.clientY);
                        drag.current = {
                          kind: "node",
                          id: n.id,
                          startX: pt.x,
                          startY: pt.y,
                          x: n.x,
                          y: n.y,
                          before: structuredClone(b),
                        };
                        setSelected(n.id);
                        setSelectedWire("");
                        svg.current!.setPointerCapture(e.pointerId);
                      }}
                      onClick={() => {
                        setSelected(n.id);
                        setSelectedWire("");
                      }}
                    >
                      <rect width="148" height="29" rx="9" fill="#29394d" />
                      <text
                        x="74"
                        y="19"
                        fill="#d9e5f3"
                        textAnchor="middle"
                        fontFamily="sans-serif"
                        fontSize="10"
                      >
                        {n.label.length > 21
                          ? n.label.slice(0, 20) + "…"
                          : n.label}
                      </text>
                    </g>
                    <text
                      x="74"
                      y={h - 9}
                      textAnchor="middle"
                      fill="#859fbd"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {n.kind === "MODULE" ? "REUSABLE BLOCK" : n.kind}{" "}
                      {n.delay > 0 ? `· ${n.delay}ns` : ""}
                    </text>
                    {isSource(n.kind) && (
                      <g
                        role="button"
                        aria-disabled={["ZERO", "ONE"].includes(n.kind)}
                        aria-label={`Toggle ${n.label}`}
                        aria-pressed={out === 1}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (n.kind === "BUTTON") sourceValue(n, 1);
                            else toggle(n);
                          }
                        }}
                        onKeyUp={(e) => {
                          if (
                            n.kind === "BUTTON" &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            sourceValue(n, 0);
                          }
                        }}
                        onClick={() => {
                          if (n.kind !== "BUTTON") toggle(n);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (n.kind === "BUTTON") {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            sourceValue(n, 1);
                          }
                        }}
                        onPointerUp={() => {
                          if (n.kind === "BUTTON") sourceValue(n, 0);
                        }}
                        onPointerCancel={() => {
                          if (n.kind === "BUTTON") sourceValue(n, 0);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect
                          x="45"
                          y="40"
                          width="58"
                          height="27"
                          rx="13"
                          fill={out === 1 ? "#4c6e2f" : "#34475e"}
                          stroke={color(out ?? "X")}
                        />
                        <text
                          x="74"
                          y="58"
                          fill={color(out ?? "X")}
                          textAnchor="middle"
                          fontSize="15"
                          fontFamily="monospace"
                        >
                          {out ?? "X"}
                        </text>
                      </g>
                    )}
                    {["LED", "PROBE"].includes(n.kind) && (
                      <g data-testid={`bench-indicator-${n.id}`}>
                        <circle
                          cx="74"
                          cy="54"
                          r="16"
                          fill={input === 1 ? "#5b8334" : "#233143"}
                          stroke={color(input)}
                          strokeWidth="2"
                        />
                        <text
                          x="74"
                          y="59"
                          textAnchor="middle"
                          fill={color(input)}
                          fontFamily="monospace"
                          fontSize="14"
                        >
                          {input}
                        </text>
                      </g>
                    )}
                    {n.kind === "DISPLAY7" && (
                      <SevenSegment
                        n={n}
                        board={b}
                        rt={runtime}
                        x={51}
                        y={48}
                      />
                    )}
                    {!isSource(n.kind) &&
                      !["LED", "PROBE", "DISPLAY7"].includes(n.kind) && (
                        <text
                          x="74"
                          y="57"
                          textAnchor="middle"
                          fill={color(out ?? "X")}
                          fontFamily="monospace"
                          fontSize="13"
                        >
                          {ps.outputs
                            .map(
                              (p) =>
                                runtime.outputs[n.id + "." + p.name] ?? "X",
                            )
                            .reverse()
                            .join("")}
                        </text>
                      )}
                    {(["inputs", "outputs"] as const).flatMap((side) =>
                      ps[side].map((p, i) => {
                        const output = side === "outputs",
                          y = 38 + ((i + 0.5) * (h - 42)) / ps[side].length,
                          x = output ? 148 : 0,
                          v = output
                            ? (runtime.outputs[n.id + "." + p.name] ?? "X")
                            : pinValue(b, runtime.outputs, n.id, p.name);
                        return (
                          <g
                            key={side + p.name}
                            role="button"
                            aria-label={`${n.label} ${output ? "output" : "input"} ${p.name}`}
                            tabIndex={0}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              if (output) {
                                setPending({ node: n.id, pin: p.name });
                                setMessage(
                                  `Connect ${n.label}.${p.name}: click a compatible input pin.`,
                                );
                              } else if (pending)
                                connect(pending, { node: n.id, pin: p.name });
                              else {
                                setSelected(n.id);
                                setMessage(
                                  "Choose an output pin first, then this input pin.",
                                );
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (output)
                                  setPending({ node: n.id, pin: p.name });
                                else if (pending)
                                  connect(pending, { node: n.id, pin: p.name });
                              }
                            }}
                            style={{ cursor: "crosshair" }}
                          >
                            <circle cx={x} cy={y} r="9" fill="transparent" />
                            <circle
                              cx={x}
                              cy={y}
                              r={p.width === 4 ? 5 : 4}
                              stroke={
                                pending?.node === n.id && pending.pin === p.name
                                  ? "#86baff"
                                  : color(v)
                              }
                              fill="#111b27"
                              strokeWidth="2"
                            />
                            <text
                              x={output ? 137 : 11}
                              y={y + 3}
                              textAnchor={output ? "end" : "start"}
                              fill="#acbfd5"
                              fontSize="8"
                              fontFamily="monospace"
                            >
                              {p.name}
                            </text>
                          </g>
                        );
                      }),
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="canvas-caption">
            <span>
              {pending
                ? `Wiring from ${pending.node}.${pending.pin}`
                : "Drag components by their headers · wire output → input · drag empty space to pan"}
            </span>
            <button
              className="text-button"
              onClick={() => {
                setPending(null);
                setSelectedWire("");
              }}
            >
              Cancel selection
            </button>
          </div>
          <div className="bench-legend">
            <span style={{ color: color(1) }}>● HIGH / bus value</span>
            <span style={{ color: color(0) }}>● LOW</span>
            <span style={{ color: color("X") }}>● X unknown/conflict</span>
            <span style={{ color: color("Z") }}>┄ Z floating</span>
          </div>
        </div>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="bench-inspect-grid">
        <section className="panel studio-card">
          <h2>Component inspector</h2>
          <label className="field-label">
            Inspect component
            <select
              aria-label="Inspect component"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setSelectedWire("");
              }}
            >
              <option value="">Choose component</option>
              {b.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} ({n.id})
                </option>
              ))}
            </select>
          </label>
          {node ? (
            <>
              <div className="editor-fields">
                <label>
                  Label
                  <input
                    aria-label="Component label"
                    value={node.label}
                    maxLength={30}
                    onChange={(e) => {
                      if (e.target.value) patch({ label: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Type
                  <select
                    aria-label="Component type"
                    value={node.kind}
                    onChange={(e) => {
                      const kind = e.target.value as Kind;
                      const replacement = { ...node, kind };
                      const inputs = pins(replacement, b.modules).inputs.map(
                          (p) => p.name,
                        ),
                        outputs = pins(replacement, b.modules).outputs.map(
                          (p) => p.name,
                        );
                      edit({
                        ...b,
                        nodes: b.nodes.map((n) =>
                          n.id === node.id ? replacement : n,
                        ),
                        wires: b.wires.filter(
                          (w) =>
                            (w.to.node !== node.id ||
                              inputs.includes(w.to.pin)) &&
                            (w.from.node !== node.id ||
                              outputs.includes(w.from.pin)),
                        ),
                      });
                    }}
                  >
                    {deviceKinds
                      .filter((k) => k !== "MODULE" || node.kind === "MODULE")
                      .map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Delay (ns)
                  <input
                    aria-label="Propagation delay"
                    type="number"
                    min="0"
                    max="100"
                    value={node.delay}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isInteger(v) && v >= 0 && v <= 100)
                        patch({ delay: v });
                    }}
                  />
                </label>
              </div>
              {["CLOCK", "PATTERN"].includes(node.kind) && (
                <div className="editor-fields">
                  <label>
                    Period (ns)
                    <input
                      aria-label="Clock period"
                      type="number"
                      min="2"
                      max="1000"
                      value={node.period}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v >= 2 && v <= 1000)
                          patch({ period: v });
                      }}
                    />
                  </label>
                  {node.kind === "PATTERN" && (
                    <label>
                      Bit pattern
                      <input
                        aria-label="Pattern bits"
                        value={node.pattern}
                        maxLength={32}
                        onChange={(e) => {
                          if (/^[01]{1,32}$/.test(e.target.value))
                            patch({ pattern: e.target.value });
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
              {node.kind === "ROM4" && (
                <div className="editor-fields">
                  {node.words.map((v, i) => (
                    <label key={i}>
                      Word {i}
                      <input
                        aria-label={`Memory word ${i}`}
                        type="number"
                        min="0"
                        max="15"
                        value={v}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isInteger(value) &&
                            value >= 0 &&
                            value <= 15
                          )
                            patch({
                              words: node.words.map((w, j) =>
                                j === i ? value : w,
                              ),
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="editor-actions">
                <button
                  className="secondary"
                  onClick={() =>
                    patch({ rotation: (node.rotation + 90) % 360 })
                  }
                >
                  <RotateCw size={14} /> Rotate
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const copy = {
                      ...node,
                      id: nextId(),
                      label: node.label.slice(0, 24) + " copy",
                      x: Math.min(5800, node.x + 40),
                      y: Math.min(5800, node.y + 40),
                    };
                    edit({ ...b, nodes: [...b.nodes, copy] });
                    setSelected(copy.id);
                  }}
                >
                  <Copy size={14} /> Duplicate
                </button>
                <button className="secondary" onClick={removeNode}>
                  <Trash2 size={14} /> Delete component
                </button>
              </div>
              <p className="mini-note">
                ID {node.id} · {node.rotation}° · x={node.x}, y={node.y}.
                Editing topology resets simulation time. ROM words are initial
                data; RAM resets to zero and is written on rising edges.
              </p>
            </>
          ) : (
            <p>
              Select a component header to edit its operation, delay, or
              configuration.
            </p>
          )}
        </section>
        <section className="panel studio-card">
          <h2>Wiring & probes</h2>
          <p>
            Click canvas pins or use these selectors. Multiple drivers are
            permitted; opposing values resolve to X.
          </p>
          <div className="editor-fields">
            <label>
              From output
              <select
                aria-label="Wire from output"
                value={wireFrom}
                onChange={(e) => setWireFrom(e.target.value)}
              >
                <option value="">Choose output</option>
                {endpointOptions(true).map((p) => (
                  <option key={p.ref} value={p.ref}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To input
              <select
                aria-label="Wire to input"
                value={wireTo}
                onChange={(e) => setWireTo(e.target.value)}
              >
                <option value="">Choose input</option>
                {endpointOptions(false).map((p) => (
                  <option key={p.ref} value={p.ref}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="secondary"
            disabled={!wireFrom || !wireTo}
            onClick={() => {
              const [a, p] = wireFrom.split("."),
                [d, q] = wireTo.split(".");
              connect({ node: a, pin: p }, { node: d, pin: q });
            }}
          >
            <Cable size={15} /> Connect pins
          </button>
          <div className="editor-fields">
            <label>
              Existing wire
              <select
                aria-label="Existing wire"
                value={selectedWire}
                onChange={(e) => setSelectedWire(e.target.value)}
              >
                <option value="">Select a wire</option>
                {b.wires.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.id}: {w.from.node}.{w.from.pin} → {w.to.node}.{w.to.pin}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="text-button"
            disabled={!selectedWire}
            onClick={() => {
              edit({
                ...b,
                wires: b.wires.filter((w) => w.id !== selectedWire),
              });
              setSelectedWire("");
            }}
          >
            <Trash2 size={14} /> Remove selected wire
          </button>
        </section>
      </div>
      <div className="bench-inspect-grid">
        <section className="panel studio-card">
          <h2>Logic analyzer</h2>
          <p>
            Connect PROBE or LED components to observe nets. Captures up to ten
            clock/probe/LED channels and the last 48 samples. Time is simulated
            nanoseconds; the run button advances 10 ns every 100 ms. Traces are
            sampled at each step; shorter intermediate pulses may be missed.
          </p>
          <Analyzer samples={samples} />
          <button
            className="text-button"
            onClick={() => {
              const labels = [
                ...new Set(samples.flatMap((s) => Object.keys(s.values))),
              ];
              download(
                "logic-analyzer.csv",
                [
                  "time_ns," + labels.join(","),
                  ...samples.map((s) =>
                    [s.time, ...labels.map((k) => s.values[k] ?? "Z")].join(
                      ",",
                    ),
                  ),
                ].join("\n"),
                "text/csv",
              );
            }}
          >
            Export trace CSV
          </button>
        </section>
        <section className="panel studio-card">
          <h2>Diagnostic panel</h2>
          {issues.length ? (
            <>
              <p>
                {issues.length} diagnostic{issues.length === 1 ? "" : "s"}{" "}
                detected.
              </p>
              <ul className="diagnostic-list">
                {issues.slice(0, 12).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="high">
              All input pins are connected; no conflicting drivers detected.
            </p>
          )}
          <p className="mini-note">
            0/1 logic with X (unknown) and Z (high impedance). Gate delays use
            an inertial model: pulses shorter than a component’s delay may be
            suppressed. Setup/hold, analog voltages, and transistor behavior are
            outside this model.
          </p>
        </section>
      </div>
      <section className="panel studio-card bench-files">
        <div>
          <h2>Keep & reuse your circuit</h2>
          <p>
            Board edits and mission progress save on this device. Export a
            portable copy or turn a combinational design into a component.
          </p>
        </div>
        <div className="editor-actions">
          <button
            className="secondary"
            onClick={() =>
              download(
                "circuitquest-workbench.json",
                JSON.stringify(b, null, 2),
              )
            }
          >
            <Download size={14} /> Export board
          </button>
          <label className="secondary import-label">
            <Upload size={14} /> Import board
            <input
              aria-label="Import workbench board"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 250000) throw Error();
                  const parsed = boardSchema.parse(JSON.parse(await f.text()));
                  load(parsed);
                  setMessage("Board imported into sandbox.");
                } catch {
                  setMessage(
                    "Invalid board. Import a CircuitQuest workbench JSON file under 250 KB.",
                  );
                }
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              const el = svg.current;
              if (el)
                download(
                  "digital-workbench.svg",
                  new XMLSerializer().serializeToString(el),
                  "image/svg+xml",
                );
            }}
          >
            Export canvas SVG
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (
                confirm(
                  "Replace the current circuit with an empty sandbox? Saved mission stars remain.",
                )
              )
                load({
                  ...blankBoard,
                  nodes: [],
                  wires: [],
                  modules: b.modules,
                });
            }}
          >
            New blank board
          </button>
        </div>
        <div className="editor-fields">
          <label>
            Reusable block name
            <input
              aria-label="Reusable block name"
              value={moduleName}
              maxLength={40}
              onChange={(e) => setModuleName(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              try {
                const m = packageModule(b, moduleName, nextId("m"));
                edit({ ...b, modules: [...b.modules, m] });
                setMessage(
                  `Saved ${m.name}. It is available in Your reusable blocks. Inputs I0… follow switch order; outputs O0… follow LED/probe order.`,
                );
              } catch {
                setMessage(
                  "Use 1–8 switches as inputs and 1–8 LED/probe outputs. Reusable blocks must be acyclic combinational circuits, without clocks, state, ROM, or nested blocks.",
                );
              }
            }}
          >
            <Save size={14} /> Save as component
          </button>
        </div>
        <p className="mini-note">
          Reusable blocks evaluate their internal combinational function with
          one configurable boundary delay. Internal delays are not preserved.
          Digital workbench is an original implementation; no Multisim software
          or component assets are bundled.
        </p>
      </section>
    </div>
  );
}
function Analyzer({
  samples,
}: {
  samples: { time: number; values: Record<string, Signal> }[];
}) {
  const names = [...new Set(samples.flatMap((s) => Object.keys(s.values)))];
  const plotWidth = Math.max(540, samples.length * 24 + 100);
  const first = samples[0]?.time || 0;
  const scale =
    (plotWidth - 110) / Math.max(1, (samples.at(-1)?.time || first) - first);
  return (
    <div className="diagram-scroll">
      <svg
        role="img"
        aria-label="Workbench logic analyzer waveform"
        viewBox={`0 0 ${Math.max(540, samples.length * 24 + 100)} ${Math.max(100, names.length * 45 + 40)}`}
        style={{ width: "100%", minWidth: 450 }}
      >
        <text x="100" y="15" fill="#829bb8" fontSize="10">
          {samples.length
            ? `${samples[0].time} ns → ${samples.at(-1)!.time} ns`
            : "Run or step the simulation to capture signals"}
        </text>
        {names.map((name, j) => {
          const y = 35 + j * 45;
          return (
            <g key={name}>
              <text
                x="0"
                y={y + 14}
                fill="#a5b9d0"
                fontFamily="monospace"
                fontSize="10"
              >
                {name.slice(0, 13)}
              </text>
              {samples.map((s, i) => {
                const v = s.values[name] ?? "Z",
                  x = 100 + (s.time - first) * scale,
                  py = y + (v === 0 ? 22 : v === 1 ? 0 : 11),
                  prev = i ? (samples[i - 1].values[name] ?? "Z") : v,
                  prevY = y + (prev === 0 ? 22 : prev === 1 ? 0 : 11);
                return (
                  <g key={i}>
                    <path
                      d={`M ${x} ${prevY} V ${py} H ${i + 1 < samples.length ? 100 + (samples[i + 1].time - first) * scale : plotWidth - 10}`}
                      fill="none"
                      stroke={color(v)}
                      strokeWidth="2"
                      strokeDasharray={v === "Z" ? "3 3" : undefined}
                    />
                    {v !== 0 && v !== 1 && (
                      <text x={x + 5} y={py - 3} fill={color(v)} fontSize="8">
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function SevenSegment({
  n,
  board,
  rt,
  x,
  y,
}: {
  n: Device;
  board: Board;
  rt: Runtime;
  x: number;
  y: number;
}) {
  const segments = [
    "M 5 0 H 35",
    "M 39 4 V 30",
    "M 39 38 V 64",
    "M 5 68 H 35",
    "M 1 38 V 64",
    "M 1 4 V 30",
    "M 5 34 H 35",
  ];
  return (
    <g transform={`translate(${x} ${y})`}>
      {segments.map((d, i) => {
        const v = pinValue(board, rt.outputs, n.id, "abcdefg"[i]);
        return (
          <path
            key={i}
            d={d}
            stroke={v === 1 ? "#b5f36e" : v === "X" ? "#d3985b" : "#314156"}
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </g>
  );
}
