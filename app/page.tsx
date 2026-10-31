"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import ElectronicsStudio from "@/components/ElectronicsStudio";
import CircuitDiagram from "@/components/CircuitDiagram";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Cpu,
  FileImage,
  FlaskConical,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  Zap,
} from "lucide-react";
import {
  Gate,
  Problem,
  gates,
  samples,
  truthTable,
  initialChoices,
  score,
  problemSchema,
} from "@/lib/logic";
type Save = {
  level: number;
  points: number;
  completed: number[];
  problem: Problem;
  choices: Record<string, Gate>;
  attempts: number;
  hints: number;
  solved: boolean;
  source: string;
};
const base: Save = {
  level: 0,
  points: 0,
  completed: [],
  problem: samples[0],
  choices: initialChoices(samples[0]),
  attempts: 0,
  hints: 0,
  solved: false,
  source: "Built-in mission",
};
export default function Home() {
  const [game, setGame] = useState<Save>(base),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState("campaign"),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [candidate, setCandidate] = useState<{
      problem: Problem;
      source: string;
      message: string;
    } | null>(null),
    [values, setValues] = useState<Record<string, boolean>>({
      A: false,
      B: false,
      C: false,
    }),
    [selected, setSelected] = useState("g1"),
    [verified, setVerified] = useState(false),
    [storage, setStorage] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("circuitquest-v1");
      if (raw) {
        const s = JSON.parse(raw);
        const p = problemSchema.parse(s.problem);
        if (
          !Number.isInteger(s.level) ||
          s.level < 0 ||
          s.level >= samples.length ||
          !Number.isFinite(s.points) ||
          s.points < 0 ||
          !Array.isArray(s.completed) ||
          !s.completed.every(
            (n: unknown) =>
              Number.isInteger(n) &&
              Number(n) >= 0 &&
              Number(n) < samples.length,
          ) ||
          !Number.isInteger(s.attempts) ||
          s.attempts < 0 ||
          !Number.isInteger(s.hints) ||
          s.hints < 0 ||
          s.hints > 3 ||
          typeof s.solved !== "boolean" ||
          typeof s.source !== "string" ||
          !p.nodes.every(
            (n) =>
              gates.includes(s.choices?.[n.id]) &&
              ["NOT", "BUFFER"].includes(n.gate) ===
                ["NOT", "BUFFER"].includes(s.choices[n.id]),
          )
        )
          throw Error();
        setGame({ ...s, problem: p });
      }
    } catch {
      setStorage("Saved progress could not be read. A fresh mission is ready.");
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("circuitquest-v1", JSON.stringify(game));
      } catch {
        setStorage(
          "Browser storage is unavailable; progress lasts for this session.",
        );
      }
  }, [game, ready]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);
  const p = game.problem,
    rows = truthTable(p, game.choices),
    passed = rows.filter((r) => r.actual === r.expected).length;
  function load(problem: Problem, level: number, source: string) {
    setGame((g) => ({
      ...g,
      problem,
      level,
      source,
      choices: initialChoices(problem),
      attempts: 0,
      hints: 0,
      solved: false,
    }));
    setSelected(problem.nodes[0].id);
    setVerified(false);
    setNotice("");
    setValues({ A: false, B: false, C: false });
  }
  async function extract() {
    setBusy(true);
    setCandidate(null);
    setNotice("");
    try {
      let image: string | undefined;
      if (file)
        image = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image, mimeType: file?.type }),
        signal: AbortSignal.timeout(40000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(data);
        throw Error(failure.success ? failure.data.error : "Extraction failed");
      }
      setCandidate(z.object({ problem: problemSchema, source: z.string(), message: z.string() }).parse(data));
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not read this problem. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  function verify() {
    setVerified(true);
    const won = passed === rows.length;
    const reward = score(game.attempts + 1, game.hints);
    setGame((g) => ({
      ...g,
      attempts: g.attempts + 1,
      solved: won || g.solved,
      points:
        g.points +
        (won &&
        !g.solved &&
        !g.completed.includes(g.level) &&
        g.source === "Built-in mission"
          ? reward
          : 0),
      completed:
        won && g.source === "Built-in mission"
          ? [...new Set([...g.completed, g.level])]
          : g.completed,
    }));
    setNotice(
      won
        ? `Circuit restored! All ${rows.length} input combinations pass. ${game.source === "Built-in mission" && !game.completed.includes(game.level) ? `+${reward} XP earned.` : "Practice complete."}`
        : `${passed} of ${rows.length} combinations pass. Look for the highlighted counterexamples, then repair your gates.`,
    );
  }
  const current = p.nodes.find((n) => n.id === selected) || p.nodes[0];
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Cpu size={25} />
          </span>
          <span>
            CircuitQuest<span className="ai">AI</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button
          className={tab === "campaign" ? "nav active" : "nav"}
          onClick={() => setTab("campaign")}
        >
          <FlaskConical size={19} /> Circuit lab{" "}
          <span className="nav-tag">PLAY</span>
        </button>
        <button
          className={tab === "create" ? "nav active" : "nav"}
          onClick={() => setTab("create")}
        >
          <Sparkles size={19} /> Create a quest
        </button>
        <button
          className={tab === "studio" ? "nav active" : "nav"}
          onClick={() => setTab("studio")}
        >
          <Cpu size={19} /> Electronics studio
        </button>
        <div className="workspace-label mission-heading">
          LEARNING PATH{" "}
          <span>
            {game.completed.length}/{samples.length}
          </span>
        </div>
        <div className="missions">
          {samples.map((s, i) => (
            <button
              key={s.title}
              className={`mission ${game.level === i ? "current" : ""}`}
              disabled={i > 0 && !game.completed.includes(i - 1)}
              onClick={() => {
                load(s, i, "Built-in mission");
                setTab("campaign");
              }}
            >
              <span className="mission-number">
                {game.completed.includes(i) ? (
                  <Check size={14} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>
                {s.title}
                <small>
                  {i === 0
                    ? "Start with the basics"
                    : i === 4
                      ? "Final challenge"
                      : "Logic repair mission"}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="open-badge">
            <span /> OPEN SOURCE · MIT
          </div>
          <p>
            Built for curious minds.
            <br />
            Hacktoberfest Hack Day 2026
          </p>
          <button
            className="reset"
            onClick={() => {
              if (confirm("Reset all saved progress and XP?")) {
                setGame(base);
                setVerified(false);
                setSelected("g1");
                setNotice("");
                setStorage("");
              }
            }}
          >
            <RotateCcw size={13} /> Reset progress
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <b>
              {tab === "campaign"
                ? "Circuit lab"
                : tab === "studio"
                  ? "Electronics studio"
                  : "Create a quest"}
            </b>
          </div>
          <div className="header-right">
            <span className="saved">
              <span />
              {ready ? "Saved on this device" : "Loading save"}
            </span>
            <span className="xp">
              <Zap size={15} />
              {game.points} XP
            </span>
            <button
              aria-label="Reset saved progress"
              className="mobile-reset"
              onClick={() => {
                if (confirm("Reset all saved progress and XP?")) {
                  setGame(base);
                  setVerified(false);
                  setSelected("g1");
                  setNotice("");
                  setStorage("");
                }
              }}
            >
              <RotateCcw size={15} />
            </button>
            <div className="avatar">CQ</div>
          </div>
        </header>
        <div className="content">
          <div className="page-intro">
            <div>
              <div className="eyebrow">LEARN BY BUILDING</div>
              <h1>
                {tab === "campaign"
                  ? "Small gates. Big breakthroughs."
                  : tab === "studio"
                    ? "From logic to working circuits."
                    : "Your notes. Your next mission."}
              </h1>
              <p>
                {tab === "campaign"
                  ? "A broken circuit. A little logic. Your next lightbulb moment."
                  : tab === "studio"
                    ? "Simplify with K-maps. Wire a circuit. Watch the signals change."
                    : "Turn a digital logic problem into a circuit you can repair."}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => setTab(tab === "campaign" ? "create" : "campaign")}
            >
              {tab === "campaign" ? (
                <>
                  <Upload size={16} /> Upload a problem
                </>
              ) : (
                <>
                  Back to circuit lab <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
          {storage && (
            <div role="status" className="notice">
              {storage}
            </div>
          )}
          {tab === "studio" ? (
            <ElectronicsStudio />
          ) : tab === "create" ? (
            <>
              <section className="create-grid">
                <div className="panel upload-panel">
                  <div className="panel-title">
                    <FileImage size={19} />
                    <h2>Bring your own problem</h2>
                  </div>
                  <p>
                    Printed or handwritten. Two or three inputs. One
                    combinational logic challenge.
                  </p>
                  <label className="dropzone">
                    <Upload size={30} />
                    <strong>
                      {file ? file.name : "Choose a photo of your problem"}
                    </strong>
                    <span>JPG or PNG · up to 3 MB</span>
                    <input
                      aria-label="Upload problem image"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setCandidate(null);
                        if (!f) {
                          setFile(null);
                          setPreview("");
                          return;
                        }
                        if (
                          !["image/png", "image/jpeg"].includes(f.type) ||
                          f.size > 3 * 1024 * 1024
                        ) {
                          setNotice("Choose a PNG or JPG under 3 MB.");
                          e.target.value = "";
                          setFile(null);
                          setPreview("");
                          return;
                        }
                        setFile(f);
                        setPreview(URL.createObjectURL(f));
                        setNotice("");
                      }}
                    />
                  </label>
                  {preview && (
                    <div className="image-preview">
                      <img src={preview} alt="Your uploaded logic problem" />
                      <button
                        className="text-button"
                        onClick={() => {
                          setFile(null);
                          setPreview("");
                          setCandidate(null);
                        }}
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                  <label className="field-label" htmlFor="problem-text">
                    Or describe the logic
                  </label>
                  <textarea
                    id="problem-text"
                    maxLength={6000}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setCandidate(null);
                    }}
                    placeholder="Example: Output is high when A and B are both on, or when override C is on."
                  />
                  <button
                    className="primary wide"
                    disabled={busy || (!text.trim() && !file)}
                    onClick={extract}
                  >
                    <Sparkles size={17} />
                    {busy ? "Reading your problem…" : "Generate a quest"}
                    <ArrowRight size={17} />
                  </button>
                  <small className="privacy">
                    With an API key, your text/image is sent to Google for
                    inference. Images are not saved by this app.
                  </small>
                </div>
                <div className="panel review">
                  <div className="eyebrow">EXTRACT → VALIDATE → PLAY</div>
                  <h2>A lesson becomes a level.</h2>
                  <p>
                    The model reads the problem. A deterministic engine checks
                    the circuit structure, then verifies every possible input
                    combination.
                  </p>
                  <div className="step">
                    <span>1</span>
                    <div>
                      <b>Read the problem</b>
                      <p>Text and images, powered by Gemma 4.</p>
                    </div>
                  </div>
                  <div className="step">
                    <span>2</span>
                    <div>
                      <b>You confirm the meaning</b>
                      <p>Check the interpretation before starting.</p>
                    </div>
                  </div>
                  <div className="step">
                    <span>3</span>
                    <div>
                      <b>Repair and prove it</b>
                      <p>Choose gates. Test all combinations.</p>
                    </div>
                  </div>
                  <div className="scope">
                    <ShieldCheck size={19} />
                    <p>
                      Supports AND, OR, XOR, NAND, NOR, XNOR, NOT and buffers.
                      Sequential circuits and full syllabus uploads are outside
                      this version.
                    </p>
                  </div>
                </div>
              </section>
              {candidate && (
                <section className="panel candidate">
                  <span
                    className={`badge ${candidate.source === "gemma" ? "green" : ""}`}
                  >
                    {candidate.source === "gemma"
                      ? "REAL MODEL INFERENCE"
                      : "DEMO SAMPLE · NO INFERENCE"}
                  </span>
                  <h2>{candidate.problem.title}</h2>
                  <p>{candidate.problem.description}</p>
                  <small>{candidate.message}</small>
                  <div className="candidate-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        load(
                          candidate.problem,
                          game.level,
                          candidate.source === "gemma"
                            ? "Gemma inference"
                            : "Demo fallback",
                        );
                        setTab("campaign");
                        setCandidate(null);
                      }}
                    >
                      Confirm interpretation & play <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setCandidate(null)}
                    >
                      Revise input
                    </button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <section className="mission-banner">
                <div className="banner-art">
                  <Cpu size={37} />
                </div>
                <div className="banner-text">
                  <div className="eyebrow">
                    MISSION {String(game.level + 1).padStart(2, "0")}{" "}
                    <span> / </span> {game.source.toUpperCase()}
                  </div>
                  <h2>{p.title}</h2>
                  <p>{p.description}</p>
                </div>
                <div className="reward">
                  <Trophy size={20} />
                  <b>Up to 150 XP</b>
                  <small>
                    {game.source === "Built-in mission"
                      ? "First clear reward"
                      : "Custom practice · no XP"}
                  </small>
                </div>
              </section>
              <div className="lab-grid">
                <section className="panel circuit-panel">
                  <div className="panel-title">
                    <h2>
                      <Activity size={17} /> Circuit workbench
                    </h2>
                    <span className="badge">LIVE SIMULATION</span>
                  </div>
                  <div className="circuit-hint">
                    Tap a gate to repair it. Toggle inputs to trace the signal.
                  </div>
                  <CircuitDiagram
                    circuit={{
                      name: p.title,
                      inputs: p.inputs,
                      nodes: p.nodes.map((n) => ({
                        ...n,
                        gate: game.choices[n.id],
                      })),
                      outputs: { Y: p.output },
                    }}
                    values={values}
                    selected={selected}
                    onGate={setSelected}
                    onInput={(input) =>
                      setValues((v) => ({ ...v, [input]: !v[input] }))
                    }
                  />
                  <div className="legend">
                    <span>
                      <i className="dot green-dot" /> HIGH · 1
                    </span>
                    <span>
                      <i className="dot" /> LOW · 0
                    </span>
                    <span>Fixed wiring · replace the gates</span>
                  </div>
                  <div className="gate-picker">
                    <div>
                      <b>Repair {current.id.toUpperCase()}</b>
                      <small>Inputs: {current.inputs.join(", ")}</small>
                    </div>
                    <div className="gate-options">
                      {gates
                        .filter((g) =>
                          ["NOT", "BUFFER"].includes(current.gate)
                            ? ["NOT", "BUFFER"].includes(g)
                            : !["NOT", "BUFFER"].includes(g),
                        )
                        .map((g) => (
                          <button
                            key={g}
                            disabled={game.solved}
                            className={
                              game.choices[current.id] === g ? "chosen" : ""
                            }
                            onClick={() => {
                              setGame((v) => ({
                                ...v,
                                choices: { ...v.choices, [current.id]: g },
                              }));
                              setVerified(false);
                              setNotice("");
                            }}
                          >
                            {g}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="workbench-footer">
                    <button
                      className="text-button"
                      onClick={() => {
                        setGame((g) => ({
                          ...g,
                          hints: Math.min(g.hints + 1, 3),
                        }));
                        setNotice("");
                      }}
                    >
                      <Lightbulb size={16} /> Get a hint <span>−25 XP</span>
                    </button>
                    <button
                      className="primary"
                      disabled={game.solved}
                      onClick={verify}
                    >
                      {game.solved ? (
                        <Check size={17} />
                      ) : (
                        <ShieldCheck size={17} />
                      )}{" "}
                      {game.solved ? "Circuit restored" : "Verify circuit"}{" "}
                      {!game.solved && <ArrowRight size={17} />}
                    </button>
                  </div>
                </section>
                <section className="panel truth-panel">
                  <div className="panel-title">
                    <h2>Truth table</h2>
                    <span className="table-count">{rows.length} CASES</span>
                  </div>
                  <p>Every combination. No guesswork.</p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {p.inputs.map((i) => (
                            <th key={i}>{i}</th>
                          ))}
                          <th>Target</th>
                          <th>Yours</th>
                          <th aria-label="Result" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr
                            key={i}
                            className={
                              verified
                                ? r.actual === r.expected
                                  ? "pass"
                                  : "fail"
                                : ""
                            }
                          >
                            {p.inputs.map((k) => (
                              <td key={k}>{Number(r.values[k])}</td>
                            ))}
                            <td className="target">{Number(r.expected)}</td>
                            <td>{Number(r.actual)}</td>
                            <td>
                              {verified ? (
                                r.actual === r.expected ? (
                                  <Check size={14} />
                                ) : (
                                  <span>×</span>
                                )
                              ) : (
                                <span className="pending">·</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-summary">
                    <span
                      className={`dot ${verified && passed === rows.length ? "green-dot" : ""}`}
                    />
                    {verified
                      ? `${passed} / ${rows.length} combinations match`
                      : "Ready when you are"}
                  </div>
                </section>
              </div>
              {game.hints > 0 && (
                <div className="hint-box">
                  <Lightbulb size={19} />
                  <div>
                    <b>Hint {game.hints} / 3</b>
                    <p>
                      {game.hints === 1
                        ? "Compare the target rows where the output changes. Which input combinations make it high?"
                        : game.hints === 2
                          ? `Focus on ${p.nodes[0].id.toUpperCase()}: its intended operation is ${p.nodes[0].gate}.`
                          : `Correct gate sequence: ${p.nodes.map((n) => n.id.toUpperCase() + " = " + n.gate).join(" → ")}. Equivalent circuits also count.`}
                    </p>
                  </div>
                </div>
              )}
              {game.solved && (
                <div className="success">
                  <Trophy size={26} />
                  <div>
                    <b>
                      {game.completed.length === samples.length
                        ? "Campaign complete. You are a circuit explorer!"
                        : "Mission complete. Nicely reasoned."}
                    </b>
                    <p>
                      Every input combination is correct. Your progress is saved
                      locally.
                    </p>
                  </div>
                  {game.source === "Built-in mission" &&
                  game.level < samples.length - 1 ? (
                    <button
                      className="primary"
                      onClick={() =>
                        load(
                          samples[game.level + 1],
                          game.level + 1,
                          "Built-in mission",
                        )
                      }
                    >
                      Next mission <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => setTab("create")}
                    >
                      Create a quest <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
              <div className="bottom-grid">
                <div className="tip">
                  <span>
                    <Lightbulb size={20} />
                  </span>
                  <div>
                    <b>Think in combinations, not guesses.</b>
                    <p>
                      One working input is a clue. A passing truth table is
                      proof.
                    </p>
                  </div>
                </div>
                <div className="attempt-stat">
                  <b>{game.attempts}</b>
                  <span>VERIFICATIONS</span>
                  <b>{game.hints}</b>
                  <span>HINTS USED</span>
                </div>
              </div>
            </>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} /> Deterministic verification. AI-assisted
              discovery.
            </span>
            <span>
              CircuitQuest AI <span className="footer-dot">·</span> Made to make
              logic click.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
