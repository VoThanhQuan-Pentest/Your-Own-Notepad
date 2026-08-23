import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/e2e.html?reset&fixture=basic";

test("undo and redo a command edit", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Ping Scan" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Updated discovery description.");
  await page.getByRole("button", { name: "SAVE" }).click();
  const pingRow = page.locator("[data-command-id='ping-scan']");
  await expect(pingRow.locator(".command-description")).toHaveText("Updated discovery description.");

  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await page.locator(".tree-file").filter({ hasText: "Nmap" }).click();

  const undo = page.getByRole("button", { name: "UNDO" });
  const redo = page.getByRole("button", { name: "REDO" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(pingRow.locator(".command-description")).toHaveText("Discover active hosts.");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(pingRow.locator(".command-description")).toHaveText("Updated discovery description.");
  await page.keyboard.press("Control+z");
  await expect(pingRow.locator(".command-description")).toHaveText("Discover active hosts.");
  await page.keyboard.press("Control+Shift+z");
  await expect(pingRow.locator(".command-description")).toHaveText("Updated discovery description.");
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
  await page.getByRole("menuitem", { name: "Add Favorite" }).click();
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Move Command File to Trash" })).toBeVisible();
  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  await expect(page.getByRole("button", { name: "Nmap" })).toHaveCount(0);

  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.calls).toContain("trash_entry");
  expect(state.settings.favorites).toEqual([]);
  expect(state.settings.recentFiles).toEqual([]);
});

test("keeps MORE and theme cancellation regressions fixed", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const row = page.locator("[data-command-id='ping-scan']");
  await row.getByRole("button", { name: "MORE" }).click();
  await expect(row.locator(".info-top")).toBeHidden();
  await expect(row.locator(".expanded-content").getByText("Discover active hosts.")).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "LIGHT" }).check({ force: true });
  await page.getByRole("radio", { name: "PURPLE" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "cyan");
});

test("moves and deletes selected rows as single undoable batches", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "SELECT", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("checkbox", { name: "Select ARP Scan" }).check();
  await expect(page.getByText("2 SELECTED")).toBeVisible();
  await page.getByRole("button", { name: "MOVE TO…" }).click();
  await page.getByRole("dialog", { name: "Move to Section" }).locator("select")
    .selectOption({ label: "Archive" });
  await page.getByRole("button", { name: "MOVE", exact: true }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toBeVisible();
  const archive = page.locator("[data-section-id='archive']");
  await expect(archive.locator(".command-code code")).toHaveText([
    "nmap -sn 192.168.1.0/24",
    "nmap -PR 192.168.1.0/24",
  ]);
  await expect(archive.locator(".compact-row-number")).toHaveText(["01", "02"]);

  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(page.locator("[data-section-id='discovery'] .command-name")).toHaveText([
    "Ping Scan",
    "ARP Scan",
  ]);

  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("checkbox", { name: "Select ARP Scan" }).check();
  await page.getByRole("button", { name: "DELETE", exact: true }).click();
  await page.getByRole("button", { name: "DELETE SELECTED" }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toHaveCount(0);
  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toBeVisible();
  await expect(page.locator("[data-command-id='arp-scan']")).toBeVisible();
});

test("persists file and command favorites with recent files", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Add Favorite" }).click();
  await page.getByRole("button", { name: "Actions for Ping Scan" }).click();
  await page.getByRole("menuitem", { name: "Add Favorite" }).click();

  const favorites = page.locator(".quick-access-group").filter({ hasText: "FAVORITES" });
  await expect(favorites.getByRole("button", { name: "Nmap", exact: true })).toBeVisible();
  await expect(favorites.getByRole("button", { name: "Ping Scan", exact: true })).toBeVisible();
  const copyFavorite = favorites.getByRole("button", { name: "Copy favorite Ping Scan" });
  await copyFavorite.click();
  await expect(copyFavorite).toHaveText("COPIED");
  await favorites.getByRole("button", { name: "Ping Scan", exact: true }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toHaveClass(/search-highlight/);
  await expect(page.locator(".quick-access-group").filter({ hasText: "RECENT" })).toContainText("Nmap");
  const favoritesToggle = favorites.getByRole("button", { name: /^FAVORITES/ });
  await favoritesToggle.click();
  await expect(favoritesToggle).toHaveAttribute("aria-expanded", "false");
  await favoritesToggle.click();
  await expect(favoritesToggle).toHaveAttribute("aria-expanded", "true");

  await page.goto("/e2e.html?fixture=basic");
  await expect(page.locator(".quick-access-group").filter({ hasText: "FAVORITES" })).toContainText("Ping Scan");
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog", { name: "Rename Command File" })
    .getByRole("textbox", { name: "Name" }).fill("Recon");
  await page.getByRole("button", { name: "RENAME" }).click();
  await expect(page.locator(".quick-access-group").filter({ hasText: "FAVORITES" }))
    .toContainText("Recon");
  const renamedState = JSON.parse(
    await page.locator("#e2e-state").getAttribute("data-state") ?? "{}",
  );
  expect(renamedState.settings.favorites.every(
    (item: { path?: string; filePath?: string }) => (item.path ?? item.filePath).endsWith("Recon.cmdnote"),
  )).toBe(true);
  expect(renamedState.settings.recentFiles[0]).toContain("Recon.cmdnote");
  await page.getByRole("button", { name: "Remove favorite Ping Scan" }).click();
  await expect(page.getByRole("button", { name: "Remove favorite Ping Scan" })).toHaveCount(0);
});

test("skips existing commands in pasted table by default", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "+ ADD TABLE" }).click();
  await page.getByLabel("Table Name").fill("Imported Tools");
  await page.getByLabel("Paste GPT Table").fill(
    "Command,Description\nnmap -sn 192.168.1.0/24,Already exists\ncurl https://example.com,New command",
  );
  await expect(page.getByText(/1 TO IMPORT · 1 SKIPPED/)).toBeVisible();
  const includeDuplicates = page.getByLabel("Include duplicate commands");
  await expect(includeDuplicates).toBeVisible();
  await includeDuplicates.check();
  await expect(page.getByText(/2 TO IMPORT · 0 SKIPPED/)).toBeVisible();
  await includeDuplicates.uncheck();
  await expect(page.getByText(/1 TO IMPORT · 1 SKIPPED/)).toBeVisible();
  await page.getByRole("button", { name: "CREATE TABLE" }).click();
  const imported = page.locator("[data-section-id='imported-tools']");
  await expect(imported).toContainText("curl https://example.com");
  await expect(imported).not.toContainText("Already exists");
});

test("keeps bulk selection stable across virtualized rows", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?stress=5000");
  await expect(page.locator(".command-section")).toHaveCount(50);
  await expect(page.locator(".command-row")).not.toHaveCount(5_000);
  await page.getByRole("button", { name: "SELECT", exact: true }).first().click();
  await page.getByRole("button", { name: "SELECT ALL" }).click();
  await expect(page.getByText("100 SELECTED")).toBeVisible();
  await expect(page.locator(".command-row").first().getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "DELETE", exact: true }).click();
  await page.getByRole("button", { name: "DELETE SELECTED" }).click();
  await expect(page.getByText("No commands in this section.")).toBeVisible();
  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(page.locator(".command-row").first()).toBeVisible();
});

test("exits Selection Mode when its Section collapses", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await expect(page.getByText("1 SELECTED")).toHaveCount(0);
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select Ping Scan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SELECT", exact: true })).toBeVisible();
});

test("clears Selection Mode when switching files", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("button", { name: "Git", exact: true }).click();
  await page.getByRole("button", { name: "Nmap", exact: true }).last().click();
  await expect(page.getByRole("checkbox", { name: "Select Ping Scan" })).toHaveCount(0);
});

test("disables an all-duplicate import until duplicates are included", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "+ ADD TABLE" }).click();
  await page.getByLabel("Table Name").fill("Duplicates");
  await page.getByLabel("Paste GPT Table").fill(
    "Command,Description\nnmap -sn 192.168.1.0/24,Already exists",
  );
  const create = page.getByRole("button", { name: "CREATE TABLE" });
  await expect(create).toBeDisabled();
  await page.getByLabel("Include duplicate commands").check();
  await expect(create).toBeEnabled();
});
