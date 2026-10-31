import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
import { POST } from "../app/api/extract/route";
import { samples } from "../lib/logic";
const request = (body: unknown) =>
  new Request("http://localhost/api/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "");
  generate.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("extraction route", () => {
  it("returns a clearly labeled demo without a key", async () => {
    const r = await POST(request({ text: "A AND B" }));
    const data = await r.json() as { source: string; message: string; problem: unknown };
    expect(data.source).toBe("demo");
    expect(data.message).toContain("not an interpretation");
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { text: 123 },
    { text: "x".repeat(6001) },
    { image: "xxx", mimeType: "image/svg+xml" },
    { image: "YWJj", mimeType: "image/png" },
  ])("rejects invalid input", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("rejects oversized bodies", async () => {
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "5000000" },
    });
    expect((await POST(req)).status).toBe(413);
  });
  it("rejects malformed JSON", async () =>
    expect(
      (
        await POST(
          new Request("http://localhost/api/extract", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400));
  it("calls Gemma and returns only validated output", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    generate.mockResolvedValue({ text: JSON.stringify(samples[2]) });
    const data = await (await POST(request({ text: "(A AND B) OR C" }))).json() as { source: string; message: string; problem: unknown };
    expect(data.source).toBe("gemma");
    expect(data.problem).toEqual(samples[2]);
    expect(generate.mock.calls[0][0].model).toBe("gemma-4-26b-a4b-it");
  });
  it("passes validated image data through as an inline image", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    generate.mockResolvedValue({ text: JSON.stringify(samples[0]) });
    const image = "iVBORw0KGgo=";
    await POST(request({ image, mimeType: "image/png" }));
    expect(generate.mock.calls[0][0].contents[0].parts[1]).toEqual({
      inlineData: { data: image, mimeType: "image/png" },
    });
  });
  it("rejects invalid model output rather than inventing an interpretation", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    generate.mockResolvedValue({ text: '{"error":"unsupported"}' });
    expect((await POST(request({ text: "design a CPU" }))).status).toBe(422);
  });
  it("labels service failure as fallback", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    generate.mockRejectedValue(new Error("secret provider detail"));
    const data = await (await POST(request({ text: "A XOR B" }))).json() as { source: string; message: string; problem: unknown };
    expect(data.source).toBe("demo");
    expect(data.message).not.toContain("secret");
    expect(data.message).toContain("not interpreted");
  });
});
