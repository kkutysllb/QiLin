// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  getBackendStatus,
  getBackendLogs,
  startBackend,
  stopBackend,
  restartBackend,
  openProjectTerminal,
} from "@/core/desktop";
import type { BackendStatus, DesktopBridge } from "@/core/desktop/types";

/** A minimal Electron bridge stub used to drive the desktop code path. */
function makeBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  const stopped: BackendStatus = { status: "stopped", port: 19987 };
  const starting: BackendStatus = { status: "starting", port: 19987 };
  const unsubscribe = () => {
    return undefined;
  };
  return {
    gatewayPort: 19987,
    getGatewayConfig: vi.fn(async () => ({ port: 19987 })),
    getBackendStatus: vi.fn(async (): Promise<BackendStatus> => stopped),
    startBackend: vi.fn(async (): Promise<BackendStatus> => starting),
    stopBackend: vi.fn(async (): Promise<BackendStatus> => stopped),
    restartBackend: vi.fn(async (): Promise<BackendStatus> => starting),
    getBackendLogs: vi.fn(async (): Promise<string[]> => []),
    pickFiles: vi.fn(async () => []),
    pickDirectory: vi.fn(async () => null),
    openExternal: vi.fn(async (_url: string) => undefined),
    openFolder: vi.fn(async (_path: string) => undefined),
    startTerminal: vi.fn(async (_path: string) => ({
      sessionId: "term-1",
      cwd: "/tmp/project",
      shell: "/bin/zsh",
      projectName: "project",
      promptLabel: "libing@host project %",
    })),
    writeTerminal: vi.fn(async (_sessionId: string, _data: string) => undefined),
    resizeTerminal: vi.fn(async (_sessionId: string, _cols: number, _rows: number) => undefined),
    stopTerminal: vi.fn(async (_sessionId: string) => undefined),
    onTerminalData: vi.fn(() => unsubscribe),
    onTerminalExit: vi.fn(() => unsubscribe),
    onFileDrop: vi.fn(() => unsubscribe),
    checkForUpdates: vi.fn(async () => ({ available: false })),
    installUpdate: vi.fn(async () => true),
    onCheckUpdateRequest: vi.fn(() => unsubscribe),
    onUpdateDownloading: vi.fn(() => unsubscribe),
    onUpdateReady: vi.fn(() => unsubscribe),
    getSkillModels: vi.fn(async () => ({ providers: [], vars: [], filePath: "" })),
    setSkillModels: vi.fn(async () => ({ providers: [], vars: [], filePath: "" })),
    ...overrides,
  };
}

function setDesktopMode(enabled: boolean, bridge?: DesktopBridge) {
  const w = window as unknown as Record<string, unknown>;
  if (enabled && bridge) {
    w.kworksDesktop = bridge;
  } else {
    delete w.kworksDesktop;
  }
}

const STOPPED: BackendStatus = { status: "stopped", port: 19987 };
const STARTING: BackendStatus = { status: "starting", port: 19987 };

describe("desktop integration — web mode (no Electron bridge)", () => {
  beforeEach(() => {
    setDesktopMode(false);
  });

  test("getBackendStatus returns null in web mode", async () => {
    expect(await getBackendStatus()).toBeNull();
  });

  test("startBackend returns null in web mode", async () => {
    expect(await startBackend()).toBeNull();
  });

  test("stopBackend returns null in web mode", async () => {
    expect(await stopBackend()).toBeNull();
  });

  test("restartBackend returns null in web mode", async () => {
    expect(await restartBackend()).toBeNull();
  });

  test("getBackendLogs returns empty array in web mode", async () => {
    expect(await getBackendLogs()).toEqual([]);
  });

  test("openProjectTerminal copies project path in web mode", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(openProjectTerminal("/tmp/project")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("/tmp/project");
  });
});

describe("desktop integration — Electron mode", () => {
  let bridge: DesktopBridge;

  beforeEach(() => {
    bridge = makeBridge();
    setDesktopMode(true, bridge);
  });

  afterEach(() => {
    setDesktopMode(false);
  });

  test("getBackendStatus calls the bridge and returns data", async () => {
    const getStatus = Reflect.get(
      bridge,
      "getBackendStatus",
    ) as ReturnType<typeof vi.fn>;
    getStatus.mockResolvedValueOnce(STOPPED);
    const result = await getBackendStatus();
    expect(getStatus).toHaveBeenCalled();
    expect(result).toEqual(STOPPED);
  });

  test("getBackendStatus returns null on bridge error", async () => {
    const getStatus = Reflect.get(
      bridge,
      "getBackendStatus",
    ) as ReturnType<typeof vi.fn>;
    getStatus.mockRejectedValueOnce(new Error("IPC error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      return undefined;
    });
    expect(await getBackendStatus()).toBeNull();
    warnSpy.mockRestore();
  });

  test("startBackend calls the bridge", async () => {
    const start = Reflect.get(bridge, "startBackend") as ReturnType<typeof vi.fn>;
    start.mockResolvedValueOnce(STARTING);
    expect(await startBackend()).toEqual(STARTING);
    expect(start).toHaveBeenCalled();
  });

  test("stopBackend calls the bridge", async () => {
    const stop = Reflect.get(bridge, "stopBackend") as ReturnType<typeof vi.fn>;
    stop.mockResolvedValueOnce(STOPPED);
    expect(await stopBackend()).toEqual(STOPPED);
    expect(stop).toHaveBeenCalled();
  });

  test("restartBackend calls the bridge", async () => {
    const restart = Reflect.get(
      bridge,
      "restartBackend",
    ) as ReturnType<typeof vi.fn>;
    restart.mockResolvedValueOnce(STARTING);
    expect(await restartBackend()).toEqual(STARTING);
    expect(restart).toHaveBeenCalled();
  });

  test("getBackendLogs calls the bridge", async () => {
    const getLogs = Reflect.get(
      bridge,
      "getBackendLogs",
    ) as ReturnType<typeof vi.fn>;
    getLogs.mockResolvedValueOnce(["line1", "line2"]);
    expect(await getBackendLogs()).toEqual(["line1", "line2"]);
    expect(getLogs).toHaveBeenCalled();
  });

  test("openProjectTerminal opens the embedded terminal surface in desktop mode", async () => {
    await expect(openProjectTerminal("/tmp/project")).resolves.toBe("opened");
  });
});
