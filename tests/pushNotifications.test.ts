// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/api", () => ({
  api: vi.fn(),
  json: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })
}));

import { api } from "../src/api";
import { decodePushKey, enablePush, getPushStatus } from "../src/pushNotifications";

const mockedApi = vi.mocked(api);

function setRegistration(subscription: Record<string, unknown> | null) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn().mockResolvedValue({ endpoint: "https://push.example/new", toJSON: () => ({ endpoint: "https://push.example/new" }) })
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager }) } });
  return pushManager;
}

beforeEach(() => {
  mockedApi.mockReset();
  mockedApi.mockResolvedValue({});
  localStorage.clear();
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "granted" });
});

describe("phone push registration", () => {
  it("re-saves an existing subscription for the signed-in account", async () => {
    const existing = {
      options: { applicationServerKey: decodePushKey("AQID") },
      toJSON: () => ({ endpoint: "https://push.example/existing" })
    };
    setRegistration(existing);
    mockedApi.mockImplementation(async (url: string) => url.endsWith("/config") ? { publicKey: "AQID" } : {});

    const result = await getPushStatus(7);

    expect(result.state).toBe("enabled");
    expect(mockedApi).toHaveBeenCalledWith("/api/staff/push/subscriptions", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem("dtu-background-push-7")).toBe("enabled");
  });

  it("replaces a subscription made with an old VAPID key", async () => {
    const old = {
      endpoint: "https://push.example/old",
      options: { applicationServerKey: decodePushKey("AQID") },
      unsubscribe: vi.fn().mockResolvedValue(true)
    };
    const pushManager = setRegistration(old);

    await enablePush(7, "BAUG");

    expect(mockedApi).toHaveBeenCalledWith("/api/staff/push/subscriptions", expect.objectContaining({ method: "DELETE" }));
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(mockedApi).toHaveBeenCalledWith("/api/staff/push/subscriptions", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem("dtu-background-push-7")).toBe("enabled");
  });

  it("does not claim background push is enabled when the VAPID key changed", async () => {
    setRegistration({ options: { applicationServerKey: decodePushKey("AQID") } });
    localStorage.setItem("dtu-background-push-7", "enabled");
    mockedApi.mockResolvedValue({ publicKey: "BAUG" });

    const result = await getPushStatus(7);

    expect(result.state).toBe("refresh-required");
    expect(localStorage.getItem("dtu-background-push-7")).toBeNull();
    expect(mockedApi).not.toHaveBeenCalledWith("/api/staff/push/subscriptions", expect.anything());
  });
});
