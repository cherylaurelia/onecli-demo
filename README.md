# Large WebSocket messages through the OneCLI gateway

Unofficial demo by Cheryl Aurelia, not affiliated with OneCLI.

**Problem.** [onecli/onecli#598](https://github.com/onecli/onecli/issues/598) reports Codex CLI hanging on large
Responses API WebSocket messages through the gateway until a tiny second message releases the reply.
`apps/gateway/crates/proxy/src/relay.rs` writes each chunk with `write_all` and never flushes. Both legs are TLS, and
over a full socket TLS can accept bytes without sending them, so the tail waits for the next write.

**Fix.** One line: `writer.flush().await?` after each write, on the fork branch
[cherylaurelia/onecli:fix/relay-flush](https://github.com/onecli/onecli/compare/main...cherylaurelia:onecli:fix/relay-flush),
with a unit test that fails without it.

## Evidence
- `logs/trials-2026-11-11.log`: real `onecli-gateway` v2.20.0 binaries (with and without the line) through their
  `gateway-e2e` harness, upstream reads throttled to 1 ms every 26 ms then resumed, client silent 5 s, then a 3-byte nudge.
- `logs/throughput.log`: one 64 MiB message with a healthy upstream, both builds.
- `repro/`: the harness patch (`pauseReads`/`resumeReads` on the stub upstream), the e2e test, and `summarize.mjs`,
  which turns the logs into `data/*.json` for the page.

Not tested: Codex itself, OpenAI's endpoint, Linux, the hosted product. The forced backpressure says nothing about
how often this happens in production.

## Run the page
```
npm install && npm run build && npm run start
```
