// Turns the raw trial and throughput logs into data/*.json for the page.
// Usage: node repro/summarize.mjs <trials.log> <throughput.log>
import { readFileSync, writeFileSync } from "node:fs";

const [trialsPath, throughputPath] = process.argv.slice(2);
const TRIAL = /^round=\d+ (base|flush) (\d+): RESULT sent=(\d+) received=(\d+) complete=(true|false) NUDGE received=(\d+) complete=(true|false)/;

const cells = new Map();

for (const line of readFileSync(trialsPath, "utf8").split("\n")) {
  const m = TRIAL.exec(line);

  if (!m) {
    if (line.trim()) console.error(`unparsed: ${line}`);
    continue;
  }

  const [, arm, size, sent, received, complete, , nudged] = m;
  const key = `${arm} ${size}`;
  const cell = cells.get(key) ?? { arm, size: Number(size), runs: 0, stalled: 0, releasedByNudge: 0, shortBy: [] };
  cell.runs += 1;

  if (complete === "false") {
    cell.stalled += 1;
    cell.shortBy.push(Number(sent) - Number(received));

    if (nudged === "true") cell.releasedByNudge += 1;
  }

  cells.set(key, cell);
}

const THROUGHPUT = /^(base|flush) THROUGHPUT size=(\d+) ms=(\d+)/;
const times = { base: [], flush: [] };

for (const line of readFileSync(throughputPath, "utf8").split("\n")) {
  const m = THROUGHPUT.exec(line);

  if (m) times[m[1]].push(Number(m[3]));
}

const median = (xs) => {
  const s = xs.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);

  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

writeFileSync("data/trials.json", JSON.stringify([...cells.values()], null, 2) + "\n");

writeFileSync(
  "data/throughput.json",
  JSON.stringify(
    Object.entries(times).map(([arm, ms]) => ({ arm, runs: ms.length, medianMs: median(ms), ms })),
    null,
    2,
  ) + "\n",
);

console.log([...cells.values()], times);
