import { test, expect } from "@playwright/test";
test("repair, verify, save, progress, and complete the campaign", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("The airlock protocol", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await expect(page.getByRole("status")).toContainText("2 of 4");
  await page.getByRole("button", { name: "AND", exact: true }).click();
  await page.getByRole("button", { name: "Toggle input A" }).click();
  await page.getByRole("button", { name: "Toggle input B" }).click();
  await expect(page.getByText("Y = 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await expect(page.getByRole("status")).toContainText("Circuit restored");
  await expect(page.getByText("135 XP", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Circuit restored" }),
  ).toBeDisabled();
  await expect(page.getByText("135 XP", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next mission" }).click();
  await page.getByRole("button", { name: "XOR", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await page.getByRole("button", { name: "Next mission" }).click();
  await page.getByRole("button", { name: "AND", exact: true }).click();
  await page.getByRole("button", { name: "Select gate g2" }).click();
  await page.getByRole("button", { name: "OR", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await page.getByRole("button", { name: "Next mission" }).click();
  await page.getByRole("button", { name: "NOR", exact: true }).click();
  await page.getByRole("button", { name: "Select gate g2" }).click();
  await page.getByRole("button", { name: "AND", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await page.getByRole("button", { name: "Next mission" }).click();
  await page.getByRole("button", { name: "XOR", exact: true }).click();
  await page.getByRole("button", { name: "Select gate g2" }).click();
  await page.getByRole("button", { name: "XOR", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await expect(
    page.getByText("Campaign complete. You are a circuit explorer!"),
  ).toBeVisible();
});
test("text extraction clearly identifies no-key fallback and requires confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Upload a problem", exact: true })
    .click();
  await page.getByLabel("Or describe the logic").fill("A XOR B");
  await page.getByRole("button", { name: "Generate a quest" }).click();
  await expect(page.getByText("DEMO SAMPLE · NO INFERENCE")).toBeVisible();
  await expect(
    page.getByText(/not an interpretation of your upload/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm interpretation & play" })
    .click();
  await expect(
    page.getByText("Emergency override", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/DEMO FALLBACK/)).toBeVisible();
});
test("image upload, preview, and fallback flow", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Upload a problem", exact: true })
    .click();
  await page
    .getByLabel("Upload problem image")
    .setInputFiles({
      name: "problem.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByAltText("Your uploaded logic problem")).toBeVisible();
  await page.getByRole("button", { name: "Generate a quest" }).click();
  await expect(page.getByText("DEMO SAMPLE · NO INFERENCE")).toBeVisible();
});
test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Upload a problem", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("hints reduce reward and corrupt saves recover", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("circuitquest-v1", "invalid JSON"),
  );
  await page.goto("/");
  await expect(
    page.getByText(/Saved progress could not be read/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Get a hint/ }).click();
  await expect(page.getByText("Hint 1 / 3")).toBeVisible();
  await page.getByRole("button", { name: "AND", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await expect(page.getByText("125 XP", { exact: true })).toBeVisible();
});
test("mocked inference requires review and displays its provenance", async ({
  page,
}) => {
  await page.route("**/api/extract", (route) =>
    route.fulfill({
      json: {
        problem: {
          title: "Reviewed problem",
          description: "Output is high when exactly one of A and B is high.",
          inputs: ["A", "B"],
          nodes: [{ id: "g1", gate: "XOR", inputs: ["A", "B"] }],
          output: "g1",
        },
        source: "gemma",
        message: "Test fixture: simulated inference response.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Upload a problem", exact: true })
    .click();
  await page.getByLabel("Or describe the logic").fill("A XOR B");
  await page.getByRole("button", { name: "Generate a quest" }).click();
  await expect(page.getByText("REAL MODEL INFERENCE")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm interpretation & play" })
    .click();
  await expect(page.getByText(/GEMMA INFERENCE/)).toBeVisible();
  await page.getByRole("button", { name: "XOR", exact: true }).click();
  await page.getByRole("button", { name: "Verify circuit" }).click();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Practice complete");
});
test("unsupported model output is actionable in the upload UI", async ({
  page,
}) => {
  await page.route("**/api/extract", (route) =>
    route.fulfill({
      status: 422,
      json: {
        error:
          "Unsupported sequential logic. Please enter a combinational problem.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Upload a problem", exact: true })
    .click();
  await page.getByLabel("Or describe the logic").fill("A flip-flop");
  await page.getByRole("button", { name: "Generate a quest" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Unsupported sequential logic",
  );
  await expect(
    page.getByRole("button", { name: "Generate a quest" }),
  ).toBeEnabled();
});
