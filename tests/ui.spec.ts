import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/e2e.html?reset&fixture=basic";

test("undo and redo a command edit", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Ping Scan" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Updated discovery description.");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.locator(".command-description")).toHaveText("Updated discovery description.");

  const undo = page.getByRole("button", { name: "UNDO" });
  const redo = page.getByRole("button", { name: "REDO" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(".command-description")).toHaveText("Discover active hosts.");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator(".command-description")).toHaveText("Updated discovery description.");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".command-description")).toHaveText("Discover active hosts.");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".command-description")).toHaveText("Updated discovery description.");
});

test("navigates fuzzy search results with the keyboard", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("namp");
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.getByText("NEAR").first()).toBeVisible();
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /command-search-result-0/);
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /command-search-result-1/);
  await search.press("Enter");
  await expect(search).toHaveValue("");
  await expect(page.locator("[data-command-id='ping-scan']")).toHaveClass(/search-highlight/);
});

test("moves Explorer entries through the trash command", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Move Command File to Trash" })).toBeVisible();
  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  await expect(page.getByRole("button", { name: "Nmap" })).toHaveCount(0);

  const state = await page.locator("#e2e-state").getAttribute("data-state");
  expect(state).toContain("trash_entry");
});

test("keeps MORE and theme cancellation regressions fixed", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "MORE" }).click();
  const row = page.locator("[data-command-id='ping-scan']");
  await expect(row.locator(".info-top")).toBeHidden();
  await expect(row.locator(".expanded-content").getByText("Discover active hosts.")).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "LIGHT" }).check();
  await page.getByRole("radio", { name: "PURPLE" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "cyan");
});
