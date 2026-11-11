import throughput from "@/data/throughput.json";
import trials from "@/data/trials.json";

const ISSUE_URL = "https://github.com/onecli/onecli/issues/598";
const BRANCH_URL = "https://github.com/onecli/onecli/compare/main...cherylaurelia:onecli:fix/relay-flush";
const REPO_URL = "https://github.com/cherylaurelia/onecli-demo";

const TEST_URL =
  "https://github.com/cherylaurelia/onecli/blob/fix/relay-flush/apps/gateway/crates/proxy/src/relay.rs#L283-L369";

const CI_URL = "https://github.com/cherylaurelia/onecli/pull/1/checks";

const RELAY_URL =
  "https://github.com/onecli/onecli/blob/90e874c0/apps/gateway/crates/proxy/src/relay.rs#L133";

const DIFF = `         writer.write_all(&buf[..n]).await?;
+        writer.flush().await?;
         moved.fetch_add(n as u64, Ordering::Relaxed);
         activity.touch();`;

const RERUN = `# Rust unit test (fails without the flush, passes with it)
cd apps/gateway && cargo test -p proxy --lib relay

# Real binary, through gateway-e2e (Postgres + Redis per its README)
git apply repro/upstream-pause.patch
cp repro/websocket-large-message.test.ts apps/gateway-e2e/tests/
WS_SIZE=4194304 WS_NUDGE=1 pnpm --filter @onecli/gateway-e2e test:e2e:no-build`;

const MiB = (bytes: number) => `${bytes / 1048576} MiB`;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl">{label}</h2>
      {children}
    </section>
  );
}

export default function Page() {
  const sizes = [...new Set(trials.map((t) => t.size))].toSorted((a, b) => a - b);
  const cell = (arm: string, size: number) => trials.find((t) => t.arm === arm && t.size === size);

  const total = (arm: string) =>
    trials.filter((t) => t.arm === arm).reduce((acc, t) => ({ runs: acc.runs + t.runs, stalled: acc.stalled + t.stalled }), {
      runs: 0,
      stalled: 0,
    });

  const base = total("base");
  const flush = total("flush");
  const nudged = trials.filter((t) => t.arm === "base").reduce((n, t) => n + t.releasedByNudge, 0);
  const speed = (arm: string) => throughput.find((t) => t.arm === arm);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <p className="font-mono text-xs tracking-wider text-muted">onecli-gateway v2.20.0 · proxy/src/relay.rs</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
        The hang in #598: a large WebSocket message can wait in the gateway until the client writes again.
      </h1>
      <p className="mt-5 text-lg">
        <strong>Problem:</strong> <code className="font-mono text-base">relay()</code> writes each chunk to a TLS stream
        and never flushes it. When the socket is full, TLS can accept a chunk without sending it, and only the next write
        pushes it out.
      </p>
      <p className="mt-2 text-lg">
        <strong>Fix:</strong> flush after each write. One line, plus a unit test that fails without it.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a className="rounded-full bg-forest px-5 py-2.5 font-medium text-cream" href={BRANCH_URL}>
          The fix (fork branch)
        </a>
        <a className="rounded-full border border-ink px-5 py-2.5 font-medium" href={REPO_URL}>
          Demo repo and logs
        </a>
        <a className="rounded-full border border-ink px-5 py-2.5 font-medium" href={ISSUE_URL}>
          Issue #598
        </a>
      </div>

      <Section label="What #598 reports">
        <p className="mt-3">
          Codex CLI talks to the Responses API over a WebSocket through the gateway. On messages of about 250 KB and up,
          sometimes no reply comes until Codex times out. The same body over HTTP works. A tiny second message sent 8 s
          later releases the reply about 400 ms after it. The reporter names a missing flush as an untested lead. The
          issue has had no reply since 2026-10-06.
        </p>
        <p className="mt-3">
          The lead holds up in the code: <a className="text-green-dark underline" href={RELAY_URL}>relay.rs line 133</a>{" "}
          is a bare <code className="font-mono">write_all</code>, and both legs of a MITM WebSocket session are TLS.
        </p>
      </Section>

      <Section label="Measured on the real gateway binary">
        <p className="mt-3">
          Their <code className="font-mono">gateway-e2e</code> harness, with one change to the stub upstream: it reads in
          1 ms windows every 26 ms (forced backpressure), then reads normally again, while the client stays silent for 5 s.
          Same build of v2.20.0 with and without the flush, run alternately on macOS.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="py-2 pr-4 font-medium">Message</th>
                <th className="py-2 pr-4 font-medium">Today: tail missing after 5 s</th>
                <th className="py-2 font-medium">With the flush</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {sizes.map((size) => (
                <tr key={size} className="border-b border-line">
                  <td className="py-2 pr-4">{MiB(size)}</td>
                  <td className="py-2 pr-4 text-bad">
                    {cell("base", size)?.stalled} of {cell("base", size)?.runs}
                  </td>
                  <td className="py-2 text-green-dark">
                    {cell("flush", size)?.stalled} of {cell("flush", size)?.runs}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-4 font-sans font-medium">All</td>
                <td className="py-2 pr-4 text-bad">
                  {base.stalled} of {base.runs}
                </td>
                <td className="py-2 text-green-dark">
                  {flush.stalled} of {flush.runs}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4">
          In {nudged} of {base.stalled} stalled runs, a 3-byte second message delivered the missing tail: the same
          signature #598 describes. The sizes are larger than the report&apos;s because macOS loopback buffers are larger;
          the backpressure is forced here, so the rate says nothing about how often it happens in production.
        </p>
      </Section>

      <Section label="The change">
        <pre className="mt-4 overflow-x-auto rounded-lg bg-forest p-4 font-mono text-sm text-cream">{DIFF}</pre>
        <p className="mt-4">
          The <a className="text-green-dark underline" href={TEST_URL}>new test</a> wraps both ends in a stream that delivers bytes only on flush, the way TLS behaves over a full socket.
          It fails without the line (&quot;request held back from the server&quot;) and passes with it. It checks both directions (request
          to upstream, reply to client) on a paused clock, so it does not depend on timing. All 330 tests in the proxy
          crate, clippy and rustfmt pass. <code className="font-mono">relay()</code> also carries the
          open tunnel lane, so the line covers both callers; the throughput check below ran on the WebSocket path only. HTTP traffic
          goes through hyper, which flushes on its own.
        </p>
        <p className="mt-3">
          Cost with a healthy upstream, one 64 MiB message, {speed("base")?.runs} runs each: median{" "}
          {speed("base")?.medianMs} ms today, {speed("flush")?.medianMs} ms with the flush. No slowdown measured.
        </p>
      </Section>

      <Section label="Not tested">
        <p className="mt-3">
          Codex itself, OpenAI&apos;s endpoint (no key), Linux, and the hosted product. The link to #598 is the matching
          signature, not a Codex run.
        </p>
      </Section>

      <Section label="Rerun it">
        <pre className="mt-4 overflow-x-auto rounded-lg bg-sand p-4 font-mono text-xs">{RERUN}</pre>
      </Section>

      <footer className="mt-16 border-t border-line pt-6 text-sm text-muted">
        Unofficial demo by Cheryl Aurelia: not affiliated with OneCLI.
      </footer>
    </main>
  );
}
