// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from "vitest";
import { activateRevenueEnrollment, retryPendingRevenueActivations } from "./api";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it("durably retries an activation whose first response is ambiguous", async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(activateRevenueEnrollment("enrollment-1")).rejects.toThrow("response lost");
  expect(window.localStorage.getItem("wired:pending-revenue-activations")).toContain("enrollment-1");

  await retryPendingRevenueActivations();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(window.localStorage.getItem("wired:pending-revenue-activations")).not.toContain("enrollment-1");
});
