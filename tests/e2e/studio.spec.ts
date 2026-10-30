import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function openStudio(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Electronics studio", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Circuit simulator", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Circuit simulator" }),
  ).toBeVisible();
}
test("initial rendering and studio interaction have no browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openStudio(page);
  await page.getByRole("tab", { name: "Karnaugh maps" }).click();
  await page.getByRole("tab", { name: "Sequential lab" }).click();
  expect(errors).toEqual([]);
});
test("full-adder live connected diagram, wiring editor and exports work", async ({
  page,
}) => {
  await openStudio(page);
  await expect(page.getByTestId("output-Sum")).toHaveText("Sum = 0");
  await page
    .getByRole("button", { name: "Studio input A", exact: true })
    .click();
  await expect(page.getByTestId("output-Sum")).toHaveText("Sum = 1");
  await page
    .getByRole("button", { name: "Studio input B", exact: true })
    .click();
  await expect(page.getByTestId("output-Sum")).toHaveText("Sum = 0");
  await expect(page.getByTestId("output-Carry")).toHaveText("Carry = 1");
  await expect(
    page.getByRole("img", { name: "Digital timing waveform" }),
  ).toBeVisible();
  const jsonEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const file = await jsonEvent;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.name).toBe("Full adder");
  const svgEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svg = await svgEvent;
  expect(await readFile((await svg.path())!, "utf8")).toContain("<svg");
  await page.getByLabel("Gate operation").selectOption("OR");
  await expect(page.getByLabel("Gate operation")).toHaveValue("OR");
  await page.getByRole("button", { name: "Add gate", exact: true }).click();
  await expect(page.getByLabel("Gate operation")).toHaveValue("AND");
  await page.getByRole("button", { name: "Delete unused gate" }).click();
});
test("safe expression compiler and imported circuits", async ({ page }) => {
  await openStudio(page);
  await page.getByLabel("Boolean expression").fill("A AND NOT B");
  await page.getByRole("button", { name: "Build expression" }).click();
  await page
    .getByRole("button", { name: "Studio input A", exact: true })
    .click();
  await expect(page.getByTestId("output-Y")).toHaveText("Y = 1");
  await page.reload();
  await page
    .getByRole("button", { name: "Electronics studio", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Circuit simulator", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Custom expression", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Boolean expression").fill("alert(1)");
  await page.getByRole("button", { name: "Build expression" }).click();
  await expect(page.getByRole("status")).toContainText("Use A–D");
  await page.getByLabel("Import circuit JSON").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"nodes":[]}'),
  });
  await expect(page.getByRole("status")).toContainText("Could not import");
  await page.getByLabel("Import circuit JSON").setInputFiles({
    name: "good.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        name: "Imported AND",
        inputs: ["A", "B"],
        nodes: [{ id: "g1", gate: "AND", inputs: ["A", "B"] }],
        outputs: { Y: "g1" },
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Imported AND", exact: true }),
  ).toBeVisible();
});
test("K-map minimizes a function and sends it into the actual simulator", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole("tab", { name: "Karnaugh maps" }).click();
  await page.getByLabel("K-map variables").selectOption("2");
  await page.getByRole("button", { name: "K-map cell 1", exact: true }).click();
  await page.getByRole("button", { name: "K-map cell 3", exact: true }).click();
  await expect(page.getByTestId("minimized-expression")).toHaveText("Y = B");
  await page.getByLabel("K-map form").selectOption("POS");
  await expect(page.getByTestId("minimized-expression")).toHaveText("Y = (B)");
  await page
    .getByRole("button", { name: "Simulate minimized function" })
    .click();
  await expect(
    page.getByRole("heading", { name: "K-map minimized circuit" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Studio input B", exact: true })
    .click();
  await expect(page.getByTestId("output-Y")).toHaveText("Y = 1");
});
test("K-map grouping recognizes four-corner wraparound", async ({ page }) => {
  await openStudio(page);
  await page.getByRole("tab", { name: "Karnaugh maps" }).click();
  await page.getByLabel("K-map variables").selectOption("4");
  for (const i of [0, 2, 8, 10])
    await page
      .getByRole("button", { name: `K-map cell ${i}`, exact: true })
      .click();
  await expect(page.getByTestId("minimized-expression")).toHaveText(
    "Y = B' · D'",
  );
  await page.getByRole("button", { name: "Practice grouping" }).click();
  for (const i of [0, 2, 8, 10])
    await page
      .getByRole("button", { name: `K-map cell ${i}`, exact: true })
      .click();
  await page.getByRole("button", { name: "Check selected group" }).click();
  await expect(page.getByRole("status")).toContainText("Valid group");
});
test("D flip-flop captures only on rising edges and counter advances", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole("tab", { name: "Sequential lab" }).click();
  await page.getByRole("button", { name: "Sequential input D" }).click();
  await page.getByRole("button", { name: "Step half-cycle" }).click();
  await expect(page.getByTestId("sequential-state")).toHaveText("1");
  await page.getByRole("button", { name: "Sequential input D" }).click();
  await page.getByRole("button", { name: "Step half-cycle" }).click();
  await expect(page.getByTestId("sequential-state")).toHaveText("1");
  await page.getByRole("button", { name: "Step half-cycle" }).click();
  await expect(page.getByTestId("sequential-state")).toHaveText("0");
  await page.getByLabel("Sequential device").selectOption("4-bit counter");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Step half-cycle" }).click();
  await expect(page.getByTestId("sequential-state")).toHaveText("0010");
  await page.getByRole("button", { name: "Reset state" }).click();
  await expect(page.getByTestId("sequential-state")).toHaveText("0000");
  await page.getByRole("button", { name: "Run clock" }).click();
  await expect(page.getByTestId("sequential-state")).not.toHaveText("0000");
  await page.getByRole("button", { name: "Pause clock" }).click();
});
test("number conversions, input errors, and library search", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole("tab", { name: "Number systems" }).click();
  await expect(page.getByText("00001101", { exact: true })).toBeVisible();
  await page.getByLabel("Number", { exact: true }).fill("256");
  await expect(page.getByRole("status")).toContainText("does not fit");
  await page.getByLabel("Number", { exact: true }).fill("1010");
  await page.getByLabel("Input base").selectOption("2");
  await expect(page.getByText("00001010", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Learning library" }).click();
  await page
    .getByLabel("Find a digital electronics topic")
    .fill("multiplexers");
  await expect(
    page.getByRole("heading", { name: "Multiplexers & demultiplexers" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore a related circuit" }).click();
  await expect(
    page.getByRole("heading", { name: "2-to-1 multiplexer", exact: true }),
  ).toBeVisible();
});
test("all studio tools contain overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  for (const name of [
    "Circuit simulator",
    "Karnaugh maps",
    "Sequential lab",
    "Number systems",
    "Learning library",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
