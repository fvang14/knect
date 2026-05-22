import { apiFetch, setClientToken } from "@/lib/api-client";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (headers ?? {})[k] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setClientToken("test-token");
});

test("sends Authorization header with token", async () => {
  mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "1" }));
  await apiFetch<{ id: string }>("/some/path");
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/some/path"),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    })
  );
});

test("on 401, calls /api/refresh and retries with new token", async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse(401, {}))
    .mockResolvedValueOnce(makeResponse(200, { access_token: "new-token" }))
    .mockResolvedValueOnce(makeResponse(200, { id: "2" }));

  const result = await apiFetch<{ id: string }>("/protected");

  expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/refresh", { method: "POST" });
  expect(mockFetch).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining("/protected"),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer new-token" }),
    })
  );
  expect(result).toEqual({ id: "2" });
});

test("redirects to /login if refresh fails", async () => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "" },
  });
  mockFetch
    .mockResolvedValueOnce(makeResponse(401, {}))
    .mockResolvedValueOnce(makeResponse(401, {}));

  await expect(apiFetch("/protected")).rejects.toThrow("Session expired");
  expect(window.location.href).toBe("/login");
});

test("dispatches knect-token-changed event when token is set", () => {
  const listener = jest.fn();
  window.addEventListener("knect-token-changed", listener);

  setClientToken("event-test-token");
  expect(listener).toHaveBeenCalledTimes(1);
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe("event-test-token");

  window.removeEventListener("knect-token-changed", listener);
});
