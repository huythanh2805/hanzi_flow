import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSiteOrigin, siteUrl } from "@/lib/site-url";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), configured: true }));
vi.mock("@/lib/supabase/config", () => ({
  supabaseConfigured: () => mocks.configured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange },
  }),
}));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  mocks.configured = true;
  mocks.exchange.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("browser-facing auth origin", () => {
  it.each(["http://0.0.0.0:3000", "http://[::]:3000"])(
    "normalizes a wildcard bind address: %s",
    (value) => {
      expect(getSiteOrigin(value)).toBe("http://localhost:3000");
    },
  );
  it("rejects non-HTTP sites, credential-bearing URLs and external destinations", () => {
    expect(() => getSiteOrigin("javascript:alert(1)")).toThrow();
    expect(() => getSiteOrigin("https://user:password@example.com")).toThrow();
    expect(() => siteUrl("//attacker.invalid")).toThrow();
  });
});
describe("email/OAuth callback redirects", () => {
  it("uses localhost after a successful exchange even when Next exposes 0.0.0.0", async () => {
    mocks.exchange.mockResolvedValue({ error: null });
    const result = await GET(
      new Request("http://0.0.0.0:3000/auth/callback?code=test-code"),
    );
    expect(result.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
    expect(mocks.exchange).toHaveBeenCalledWith("test-code");
  });
  it("keeps missing-code failures on a usable browser address", async () => {
    const result = await GET(new Request("http://0.0.0.0:3000/auth/callback"));
    expect(result.headers.get("location")).toBe(
      "http://localhost:3000/login?error=callback",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("handles expired links without trying to consume them again", async () => {
    const result = await GET(
      new Request(
        "http://0.0.0.0:3000/auth/callback?error=access_denied&error_code=otp_expired",
      ),
    );
    expect(result.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirmation_expired",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("handles failed exchanges without leaking codes into the next URL", async () => {
    mocks.exchange.mockResolvedValue({ error: { code: "otp_expired" } });
    const result = await GET(
      new Request("http://0.0.0.0:3000/auth/callback?code=test-used-code"),
    );
    expect(result.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirmation_expired",
    );
  });
  it("uses the configured production origin rather than forwarded host headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hanzi.example");
    const result = await GET(
      new Request("http://0.0.0.0:3000/auth/callback", {
        headers: { "x-forwarded-host": "attacker.invalid" },
      }),
    );
    expect(result.headers.get("location")).toBe(
      "https://hanzi.example/login?error=callback",
    );
  });
});
