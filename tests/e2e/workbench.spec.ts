import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Electronics studio", exact: true })
    .click();
  await page.getByRole("tab", { name: "Build & play" }).click();
  await expect(
    page.getByRole("heading", { name: "Digital workbench", exact: true }),
  ).toBeVisible();
}
async function removeWire(page: Page, substring: string) {
  const options = page.getByLabel("Existing wire").locator("option");
  const all = await options.allTextContents();
  const index = all.findIndex((t) => t.includes(substring));
  expect(index).toBeGreaterThan(0);
  const value = await options.nth(index).getAttribute("value");
  await page.getByLabel("Existing wire").selectOption(value!);
  await page.getByRole("button", { name: "Remove selected wire" }).click();
}
async function wire(page: Page, from: string, to: string) {
  await page.getByLabel("Wire from output").selectOption(from);
  await page.getByLabel("Wire to input").selectOption(to);
  await page.getByRole("button", { name: "Connect pins", exact: true }).click();
}
async function change(page: Page, id: string, kind: string) {
  await page.getByLabel("Inspect component").selectOption(id);
  await page.getByLabel("Component type").selectOption(kind);
}
test("canvas toggles, propagation, dragging, undo, rotation and duplication work without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.getByRole("button", { name: "Toggle A", exact: true }).click();
  await page.getByRole("button", { name: "Toggle B", exact: true }).click();
  await page.getByRole("button", { name: "Step 10 ns" }).click();
  await expect(page.getByTestId("bench-indicator-lamp")).toHaveText("1");
  const header = page.getByRole("button", {
      name: "Select component AND gate",
      exact: true,
    }),
    group = header.locator("..");
  const before = await group.getAttribute("transform");
  await header.scrollIntoViewIfNeeded();
  const box = (await header.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 50,
    box.y + box.height / 2 + 30,
    { steps: 6 },
  );
  await page.mouse.up();
  expect(await group.getAttribute("transform")).not.toBe(before);
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(group).toHaveAttribute("transform", before!);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(group).toHaveAttribute("transform", /rotate\(90/);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Select component AND gate copy",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete component" }).click();
  await expect(
    page.getByRole("button", {
      name: "Select component AND gate copy",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("wire by actual pins, diagnose floating signals, and build reusable blocks", async ({
  page,
}) => {
  await open(page);
  await removeWire(page, "gate.Y → lamp.IN");
  await expect(
    page.getByText("Floating input: Output LED.IN (Z).", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "AND gate output Y", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Output LED input IN", exact: true })
    .click();
  await expect(
    page.getByText(
      "All input pins are connected; no conflicting drivers detected.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save as component" }).click();
  await expect(
    page.getByText("Your reusable blocks", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "My logic block", exact: true })
    .click();
  await expect(page.getByLabel("Inspect component")).toHaveValue("n1");
  await page
    .getByRole("button", { name: "Add Logic probe", exact: true })
    .click();
  await expect(page.getByLabel("Component type")).toHaveValue("PROBE");
});
test("all six missions can be solved through the editor, verified and saved", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  await page
    .getByRole("button", { name: /01Spaceship repair|01 Spaceship repair/ })
    .click();
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("Keep investigating");
  await change(page, "g2", "NOT");
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("Mission verified");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await removeWire(page, "q2.Q → detect.B");
  await wire(page, "inv.Y", "detect.B");
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("448 assertions");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await removeWire(page, "count.Q0 → n1.A");
  await wire(page, "count.Q1", "n1.A");
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("Mission verified");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await change(page, "g2", "OR");
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("28 assertions");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await removeWire(page, "sum.Y → select.D1");
  await removeWire(page, "and.Y → select.D0");
  await wire(page, "sum.Y", "select.D0");
  await wire(page, "and.Y", "select.D1");
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("Mission verified");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  const ids = await page
    .getByLabel("Inspect component")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((o) => (o as HTMLOptionElement).value)
        .filter((id) => /^g\d+$/.test(id)),
    );
  for (const id of ids) {
    await page.getByLabel("Inspect component").selectOption(id);
    await page.getByRole("button", { name: "Delete component" }).click();
  }
  await page.getByRole("button", { name: "Add NOT", exact: true }).click();
  await page.getByRole("button", { name: "Add AND", exact: true }).click();
  await page.getByRole("button", { name: "Add AND", exact: true }).click();
  await page.getByRole("button", { name: "Add OR", exact: true }).click();
  for (const [a, b] of [
    ["a.OUT", "n1.A"],
    ["a.OUT", "n2.A"],
    ["b.OUT", "n2.B"],
    ["n1.Y", "n3.A"],
    ["c.OUT", "n3.B"],
    ["n2.Y", "n4.A"],
    ["n3.Y", "n4.B"],
    ["n4.Y", "y.IN"],
  ])
    await wire(page, a, b);
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("Mission verified");
  await expect(page.getByText(/6\/6 missions/)).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Electronics studio", exact: true })
    .click();
  await page.getByRole("tab", { name: "Build & play" }).click();
  await expect(page.getByText(/6\/6 missions/)).toBeVisible();
});
test("worked examples are practice and do not award stars", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: /01Spaceship repair|01 Spaceship repair/ })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Load worked example" }).click();
  await page.getByRole("button", { name: "Test mission" }).click();
  await expect(page.getByRole("status")).toContainText("practice only");
  await expect(page.getByText(/0 XP · 0\/6 missions/)).toBeVisible();
});
test("board export/import and simulation instruments work", async ({
  page,
}) => {
  await open(page);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export board", exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("circuitquest-workbench.json");
  await page
    .getByLabel("Import workbench board")
    .setInputFiles((await download.path())!);
  await expect(page.getByRole("status")).toContainText("Board imported");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.getByTestId("bench-time")).not.toHaveText("0 ns");
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Workbench logic analyzer waveform" }),
  ).toBeVisible();
  await page.getByLabel("Import workbench board").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"nodes":[]}'),
  });
  await expect(page.getByRole("status")).toContainText("Invalid board");
});
test("workbench fits mobile and palette click works without dragging", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Add Clock", exact: true }).click();
  await expect(page.getByLabel("Component type")).toHaveValue("CLOCK");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("palette drag-and-drop creates a positioned component", async ({
  page,
}) => {
  await open(page);
  const canvas = page.getByRole("group", {
    name: "Interactive digital circuit canvas",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Add NAND", exact: true })
    .dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
  await expect(page.getByLabel("Component type")).toHaveValue("NAND");
  await expect(
    page.getByRole("button", { name: "Select component NAND", exact: true }),
  ).toBeVisible();
});

test("push buttons release when keyboard input is released", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Add Push button", exact: true })
    .click();
  const button = page.getByRole("button", {
    name: "Toggle Push button",
    exact: true,
  });
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  await expect(button).toHaveAttribute("aria-pressed", "false");
});
