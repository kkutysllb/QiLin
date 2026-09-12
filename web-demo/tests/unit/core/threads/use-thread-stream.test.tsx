import { describe, expect, test } from "vitest";

import {
  isThreadBusyConflict,
  STREAM_RENDER_THROTTLE_MS,
} from "@/core/threads/stream-contracts";

describe("stream contracts", () => {
  test("uses one animation-frame-sized render throttle", () => {
    expect(STREAM_RENDER_THROTTLE_MS).toBe(16);
  });

  test("recognizes busy conflicts without treating unrelated errors as busy", () => {
    expect(isThreadBusyConflict({ status: 409 })).toBe(true);
    expect(isThreadBusyConflict({ status: "409" })).toBe(true);
    expect(
      isThreadBusyConflict({ message: "Thread already has an active run" }),
    ).toBe(true);
    expect(isThreadBusyConflict({ status: 500, message: "server error" })).toBe(
      false,
    );
    expect(isThreadBusyConflict(new Error("network failed"))).toBe(false);
  });
});
