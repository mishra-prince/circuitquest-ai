"use client";
import { useId } from "react";
import type { Circuit } from "@/lib/digital";
import { simulate } from "@/lib/digital";
export default function CircuitDiagram({
  circuit,
  values,
  onInput,
  onGate,
  selected,
  id,
}: {
  circuit: Circuit;
  values: Record<string, boolean>;
  onInput?: (name: string) => void;
  onGate?: (id: string) => void;
  selected?: string;
  id?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const s = simulate(circuit, values);
  const levels: Record<string, number> = Object.fromEntries(
    [...circuit.inputs, "0", "1"].map((k) => [k, 0]),
  );
  for (const n of circuit.nodes)
    levels[n.id] = 1 + Math.max(...n.inputs.map((i) => levels[i]));
  const max = Math.max(...Object.values(levels));
  const constants = ["0", "1"].filter(
    (k) =>
      circuit.nodes.some((n) => n.inputs.includes(k)) ||
      Object.values(circuit.outputs).includes(k),
  );
  const refs = [
    ...circuit.inputs,
    ...constants,
    ...circuit.nodes.map((n) => n.id),
  ];
  const counts = Array.from(
    { length: max + 1 },
    (_, l) => refs.filter((k) => levels[k] === l).length,
  );
  const height = Math.max(
      240,
      Math.max(...counts, Object.keys(circuit.outputs).length) * 85 + 65,
    ),
    width = Math.max(600, (max + 2) * 190);
  const pos: Record<string, { x: number; y: number }> = {};
  for (let l = 0; l <= max; l++) {
    const list = refs.filter((k) => levels[k] === l);
    list.forEach((k, j) => {
      pos[k] = {
        x: 65 + l * 190,
        y: 50 + ((j + 0.5) * (height - 80)) / list.length,
      };
    });
  }
  const high = "#b5f36e",
    low = "#697a90",
    ink = "#d6e0ec";
  const key = (e: React.KeyboardEvent, fn?: () => void) => {
    if (fn && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      fn();
    }
  };
  const wire = (from: string, x: number, y: number, key: string) => {
    const p = pos[from];
    const sx = p.x + (levels[from] === 0 ? 22 : 49);
    return (
      <path
        key={key}
        d={`M ${sx} ${p.y} C ${sx + 55} ${p.y}, ${x - 55} ${y}, ${x} ${y}`}
        fill="none"
        stroke={s[from] ? high : low}
        strokeWidth={s[from] ? 2.5 : 1.5}
        opacity={s[from] ? 1 : 0.7}
      >
        <title>{`${from} = ${Number(s[from])}`}</title>
      </path>
    );
  };
  return (
    <div className="diagram-scroll">
      <svg
        id={id}
        className="logic-diagram"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          minWidth: Math.max(540, width * 0.8),
          width: "100%",
          display: "block",
        }}
        xmlns="http://www.w3.org/2000/svg"
        role="group"
        aria-label={`${circuit.name} connected circuit diagram`}
      >
        <defs>
          <pattern
            id={uid}
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".6" fill="#334154" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="#11171e" />
        <rect width={width} height={height} fill={`url(#${uid})`} />
        {circuit.nodes.flatMap((n) =>
          n.inputs.map((ref, j) =>
            wire(
              ref,
              pos[n.id].x -
                (["OR", "NOR", "XOR", "XNOR"].includes(n.gate) ? 33 : 42),
              pos[n.id].y + (n.inputs.length === 1 ? 0 : j === 0 ? -14 : 14),
              n.id + "-" + j,
            ),
          ),
        )}
        {Object.entries(circuit.outputs).map(([label, ref], j) =>
          wire(
            ref,
            width - 95,
            50 +
              ((j + 0.5) * (height - 80)) / Object.keys(circuit.outputs).length,
            "out-" + label,
          ),
        )}
        {[...circuit.inputs, ...constants].map((input) => {
          const p = pos[input];
          return (
            <g
              key={input}
              role={
                onInput && circuit.inputs.includes(input) ? "button" : undefined
              }
              aria-label={`Toggle input ${input}`}
              aria-pressed={!!s[input]}
              tabIndex={
                onInput && circuit.inputs.includes(input) ? 0 : undefined
              }
              onClick={() => circuit.inputs.includes(input) && onInput?.(input)}
              onKeyDown={(e) =>
                key(e, () => circuit.inputs.includes(input) && onInput?.(input))
              }
              style={{ cursor: onInput ? "pointer" : "default" }}
            >
              <rect
                x={p.x - 25}
                y={p.y - 21}
                width="47"
                height="42"
                rx="9"
                fill={s[input] ? "#293c20" : "#202b39"}
                stroke={s[input] ? high : low}
              />
              <text
                x={p.x - 3}
                y={p.y + 5}
                textAnchor="middle"
                fill={s[input] ? high : ink}
                fontFamily="monospace"
                fontSize="15"
              >
                {input}: {Number(!!s[input])}
              </text>
            </g>
          );
        })}
        {circuit.nodes.map((n) => {
          const { x, y } = pos[n.id],
            unary = ["NOT", "BUFFER"].includes(n.gate),
            or = ["OR", "NOR", "XOR", "XNOR"].includes(n.gate),
            invert = ["NOT", "NAND", "NOR", "XNOR"].includes(n.gate),
            xor = ["XOR", "XNOR"].includes(n.gate);
          return (
            <g
              key={n.id}
              role={onGate ? "button" : undefined}
              aria-label={`Select gate ${n.id}`}
              tabIndex={onGate ? 0 : undefined}
              onClick={() => onGate?.(n.id)}
              onKeyDown={(e) => key(e, () => onGate?.(n.id))}
              style={{ cursor: onGate ? "pointer" : "default" }}
            >
              <title>{`${n.id}: ${n.gate} (${n.inputs.join(", ")}) → ${Number(s[n.id])}`}</title>
              {selected === n.id && (
                <rect
                  x={x - 56}
                  y={y - 40}
                  width="115"
                  height="80"
                  rx="12"
                  fill="#b5f36e07"
                  stroke={high}
                  strokeDasharray="4 4"
                />
              )}
              <g
                transform={`translate(${x},${y})`}
                fill={s[n.id] ? "#2b3d22" : "#1d2937"}
                stroke={s[n.id] ? high : "#9aabc0"}
                strokeWidth="2"
              >
                {unary ? (
                  <path d="M -42 -28 L 35 0 L -42 28 Z" />
                ) : or ? (
                  <path d="M -42 -28 Q -17 0 -42 28 Q 10 33 40 0 Q 10 -33 -42 -28 Z" />
                ) : (
                  <path d="M -42 -28 L 3 -28 C 52 -28 52 28 3 28 L -42 28 Z" />
                )}
                {xor && <path d="M -50 -28 Q -25 0 -50 28" fill="none" />}
                {!invert && (
                  <path d={unary ? "M 35 0 H 49" : "M 40 0 H 49"} fill="none" />
                )}
                {invert && <circle cx="44" cy="0" r="5" fill="#11171e" />}
              </g>
              <text
                x={x - 2}
                y={y + 5}
                fill={ink}
                fontSize="11"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {n.gate}
              </text>
              <text
                x={x}
                y={y - 46}
                fill="#889bb3"
                textAnchor="middle"
                fontFamily="monospace"
                fontSize="10"
              >
                {n.id}
              </text>
              <circle cx={x + 49} cy={y} r="3" fill={s[n.id] ? high : low} />
            </g>
          );
        })}
        {Object.entries(circuit.outputs).map(([label, ref], j) => {
          const y =
            50 +
            ((j + 0.5) * (height - 80)) / Object.keys(circuit.outputs).length;
          return (
            <g key={label}>
              <circle
                cx={width - 82}
                cy={y}
                r="12"
                fill={s[ref] ? "#3c5a28" : "#202b39"}
                stroke={s[ref] ? high : low}
              />
              <text
                x={width - 82}
                y={y + 4}
                textAnchor="middle"
                fill={s[ref] ? high : ink}
                fontFamily="monospace"
                fontSize="12"
              >
                {Number(s[ref])}
              </text>
              <text
                x={width - 82}
                y={y + 32}
                textAnchor="middle"
                fill={s[ref] ? high : ink}
                fontFamily="monospace"
                fontSize="12"
              >
                {label} = {Number(s[ref])}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
