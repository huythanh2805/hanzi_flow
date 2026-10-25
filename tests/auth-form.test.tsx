// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({ resend: vi.fn() }));
vi.mock("@/app/actions", () => ({
  authenticate: vi.fn(),
  resendEmailConfirmation: mocks.resend,
}));
import { AuthForm } from "@/components/auth-form";
beforeEach(() => {
  mocks.resend.mockReset();
  window.history.replaceState(
    {},
    "",
    "/login?error=callback#error=access_denied&error_code=otp_expired",
  );
});
afterEach(cleanup);
it("explains used links and clears the Supabase error fragment", () => {
  render(<AuthForm configured callbackError />);
  expect(screen.getByRole("alert").textContent).toContain(
    "đăng nhập bằng mật khẩu",
  );
  expect(window.location.hash).toBe("");
  expect(
    screen.getByRole("button", { name: "Gửi lại email xác nhận" }),
  ).toBeTruthy();
});
it("lets the user explicitly request a new email and prevents immediate repeat clicks", async () => {
  mocks.resend.mockResolvedValue({
    message: "Đã tiếp nhận yêu cầu gửi lại email.",
  });
  render(<AuthForm configured />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "learner@example.invalid" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Gửi lại email xác nhận" }),
  );
  await waitFor(() =>
    expect(mocks.resend).toHaveBeenCalledWith("learner@example.invalid"),
  );
  await screen.findByRole("status");
  expect(
    screen
      .getByRole("button", { name: "Gửi lại sau 60s" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
