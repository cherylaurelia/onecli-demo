import { describe, expect } from "vitest";

import { scenario } from "../src/scenario.js";
import { openWebSocket } from "../src/websocket.js";

const SIZE = Number(process.env.WS_SIZE ?? 2 * 1024 * 1024);
const END = "END-OF-MESSAGE\n";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("websocket backpressure", () => {
  scenario("delivers the tail of a message that outran the upstream", async (cx) => {
    const upstream = await cx.upstreamWs();
    await cx.seed();
    const gw = await cx.startGateway();

    const ws = await openWebSocket(gw.origin, {
      authority: upstream.authority,
      path: "/v1/responses",
      token: cx.ids.agentToken,
      caPath: gw.caPath,
    });

    expect(ws.status).toBe(101);
    const [up] = await upstream.waitForUpgrades(1);

    if (up === undefined) throw new Error("no upgrade");

    // A slow link: short read windows, so the gateway's socket stays full.
    up.pauseReads();
    let throttling = true;

    const throttle = (async () => {
      while (throttling) {
        up.resumeReads();
        await sleep(1);
        up.pauseReads();
        await sleep(25);
      }
    })();

    ws.send("x".repeat(SIZE) + END);

    // Throttle until the bytes stop arriving or the whole message is in.
    let last = -1;
    let still = 0;

    while (still < 12 && !up.received().endsWith(END)) {
      await sleep(250);
      const now = up.received().length;
      still = now === last ? still + 1 : 0;
      last = now;
    }

    throttling = false;
    await throttle;

    // The link is healthy again and the client stays silent, as a client
    // waiting for its answer does.
    up.resumeReads();
    await sleep(5_000);
    const got = up.received();
    console.log(`RESULT sent=${SIZE + END.length} received=${got.length} complete=${got.includes(END)}`);

    if (process.env.WS_NUDGE === "1") {
      ws.send("{}\n");
      await sleep(2_000);
      const after = up.received();
      console.log(`NUDGE received=${after.length} complete=${after.includes(END)}`);
    }

    expect(got.includes(END)).toBe(true);
    ws.close();
  });
});
