import {
  updateProfile,
  updateEmail,
  changePassword,
  uploadAvatar,
  deleteAvatar,
  signOut,
  deleteAccount,
} from "@/app/(protected)/settings/actions";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

// Mock next/navigation redirect
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

// Mock @/lib/session
const mockDestroy = jest.fn();
const mockSave = jest.fn();
const mockSession = {
  access_token: "mock-access-token",
  destroy: mockDestroy,
  save: mockSave,
};

jest.mock("@/lib/session", () => ({
  getSession: jest.fn().mockImplementation(() => Promise.resolve(mockSession)),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    catch: () => ({}),
  };
}

describe("settings server actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.access_token = "mock-access-token";
  });

  describe("updateProfile", () => {
    test("success returns success true", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const res = await updateProfile("New Name");
      expect(res).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me"),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.any(Headers),
          body: JSON.stringify({ display_name: "New Name" }),
        })
      );
    });

    test("failure returns error message", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(400, { message: "Invalid name" }));
      const res = await updateProfile("Bad Name");
      expect(res).toEqual({ error: "Invalid name" });
    });
  });

  describe("updateEmail", () => {
    test("success returns success true", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const res = await updateEmail("new@example.com");
      expect(res).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me"),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.any(Headers),
          body: JSON.stringify({ email: "new@example.com" }),
        })
      );
    });

    test("failure returns error message", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(400, { message: "Email taken" }));
      const res = await updateEmail("bad@example.com");
      expect(res).toEqual({ error: "Email taken" });
    });
  });

  describe("changePassword", () => {
    test("success returns success true", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const res = await changePassword("old-pass", "new-pass-123");
      expect(res).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/password"),
        expect.objectContaining({
          method: "POST",
          headers: expect.any(Headers),
          body: JSON.stringify({ current: "old-pass", new: "new-pass-123" }),
        })
      );
    });

    test("failure returns error message", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(400, { message: "Wrong password" }));
      const res = await changePassword("bad-pass", "new-pass-123");
      expect(res).toEqual({ error: "Wrong password" });
    });
  });

  describe("uploadAvatar", () => {
    test("success returns success true", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const fd = new FormData();
      const res = await uploadAvatar(fd);
      expect(res).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/avatar"),
        expect.objectContaining({
          method: "POST",
          body: fd,
        })
      );
    });

    test("failure returns error message", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(413, { message: "File too large" }));
      const fd = new FormData();
      const res = await uploadAvatar(fd);
      expect(res).toEqual({ error: "File too large" });
    });
  });

  describe("deleteAvatar", () => {
    test("success returns success true", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const res = await deleteAvatar();
      expect(res).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/avatar"),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    test("failure returns error message", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(500, { message: "Failed" }));
      const res = await deleteAvatar();
      expect(res).toEqual({ error: "Failed" });
    });
  });

  describe("signOut", () => {
    test("destroys session and redirects to /login", async () => {
      await signOut();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith("/login");
    });
  });

  describe("deleteAccount", () => {
    test("success destroys session and redirects to /register", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      await deleteAccount();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith("/register");
    });

    test("failure returns error and does not destroy session or redirect", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(400, { message: "Active jobs remain" }));
      const res = await deleteAccount();
      expect(res).toEqual({ error: "Active jobs remain" });
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});
