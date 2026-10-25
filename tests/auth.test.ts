import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: true,
  user: { id: "actor-user", email: "actor@example.invalid" } as {
    id: string;
    email: string;
  } | null,
  rpc: vi.fn(),
  upsert: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("@/lib/supabase/config", () => ({
  supabaseConfigured: () => mocks.configured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user }, error: null }),
      resend: mocks.resend,
    },
    rpc: mocks.rpc,
    from: () => ({ upsert: mocks.upsert }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import {
  resendEmailConfirmation,
  savePreferences,
  updateVocabulary,
} from "@/app/actions";
import { defaultPreferences } from "@/lib/domain/types";
beforeEach(() => {
  mocks.configured = true;
  mocks.user = { id: "actor-user", email: "actor@example.invalid" };
  mocks.rpc.mockReset();
  mocks.upsert.mockReset();
  mocks.resend.mockReset();
});

describe("confirmation email recovery", () => {
  it("validates an email before contacting the provider", async () => {
    const result = await resendEmailConfirmation("invalid");
    expect(result.error).toBeTruthy();
    expect(mocks.resend).not.toHaveBeenCalled();
  });
  it("requests a signup confirmation with the canonical callback", async () => {
    mocks.resend.mockResolvedValue({ error: null });
    const result = await resendEmailConfirmation("learner@example.invalid");
    expect(result.message).toContain("Đã tiếp nhận yêu cầu");
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "learner@example.invalid",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });
  });
  it("shows a retry instruction when the provider rate-limits requests", async () => {
    mocks.resend.mockResolvedValue({ error: { status: 429 } });
    const result = await resendEmailConfirmation("learner@example.invalid");
    expect(result.error).toContain("Chờ một phút");
  });
});
describe("authenticated mutation boundary", () => {
  it("rejects missing or expired authentication before mutation", async () => {
    mocks.user = null;
    await expect(
      updateVocabulary("hsk30-b1-0124", { favorite: true }),
    ).rejects.toThrow("đăng nhập");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires cloud configuration instead of silently writing local data", async () => {
    mocks.configured = false;
    await expect(savePreferences(defaultPreferences)).rejects.toThrow(
      "chưa được cấu hình",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("passes no caller-supplied user ID to the atomic progress RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { favorite: true }, error: null });
    await updateVocabulary("hsk30-b1-0124", { favorite: true });
    expect(mocks.rpc).toHaveBeenCalledWith("patch_vocabulary", {
      p_id: "hsk30-b1-0124",
      p_patch: { favorite: true },
    });
  });
  it("scopes preferences to the verified actor", async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await savePreferences(defaultPreferences);
    expect(mocks.upsert.mock.calls[0][0].user_id).toBe("actor-user");
  });
  it("reports server errors without reporting success", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    await expect(
      updateVocabulary("hsk30-b1-0124", { favorite: true }),
    ).rejects.toThrow("database unavailable");
  });
});
