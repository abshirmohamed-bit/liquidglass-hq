import { describe, expect, it } from "vitest";
import { waitForImportedSource } from "../lib/import-wait";

describe("queued video import", () => {
  it("waits for READY before allowing a clip job", async () => {
    let reads = 0;
    await waitForImportedSource(async () => ({ status: ++reads === 3 ? "READY" : "UPLOADING", error: null }), async () => {});
    expect(reads).toBe(3);
  });
  it("stops on the actual import failure", async () => {
    await expect(waitForImportedSource(async () => ({ status: "FAILED", error: "Decode failed" }))).rejects.toThrow("Decode failed");
  });
  it("bounds polling rather than waiting forever", async () => {
    let waits = 0;
    await expect(waitForImportedSource(async () => ({ status: "UPLOADING", error: null }), async () => { waits++; }, 2)).rejects.toThrow("still importing");
    expect(waits).toBe(2);
  });
});