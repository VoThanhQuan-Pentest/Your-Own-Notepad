import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/e2e.html?reset&fixture=basic&skip-welcome";

test("undo and redo a command edit", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Ping Scan" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Updated discovery description.");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.locator(".file-view-outgoing, .file-view-incoming")).toHaveCount(0);
  const pingRow = page.locator("[data-command-id='ping-scan']");
  await expect(pingRow.locator(".command-description")).toHaveText("Updated discovery description.");

  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await page.locator(".tree-file").filter({ hasText: "Nmap" }).click();

  const undo = page.getByRole("button", { name: "UNDO" });
  const redo = page.getByRole("button", { name: "REDO" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(".file-view-outgoing, .file-view-incoming")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Add Nmap.cmdnote to Favorites" }).click();
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Move Command File to Trash" })).toBeVisible();
  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  await expect(page.getByRole("button", { name: "Nmap" })).toHaveCount(0);

  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.calls).toContain("trash_entry");
  expect(state.settings.favorites).toEqual([]);
  expect(state.settings.recentFiles).toBeUndefined();
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
  await page.getByLabel("Use custom colors for this mode").check();
  await page.getByRole("textbox", { name: "Background HEX" }).fill("#eeeeee");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-custom-theme", "true");
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "cyan");
  await expect(page.locator("html")).toHaveAttribute("data-custom-theme", "false");
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

  await page.getByRole("button", { name: "SELECT", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("checkbox", { name: "Select ARP Scan" }).check();
  await page.getByRole("button", { name: "DELETE", exact: true }).click();
  await page.getByRole("button", { name: "DELETE SELECTED" }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toHaveCount(0);
  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(page.locator("[data-command-id='ping-scan']")).toBeVisible();
  await expect(page.locator("[data-command-id='arp-scan']")).toBeVisible();
});

test("persists file and command favorites without Recent files", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const nmapHeart = page.getByRole("button", { name: "Add Nmap.cmdnote to Favorites" });
  await expect(nmapHeart).toHaveAttribute("aria-pressed", "false");
  await nmapHeart.click();
  await expect(page.getByRole("button", { name: "Remove Nmap.cmdnote from Favorites" }))
    .toHaveAttribute("aria-pressed", "true");
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
  await expect(page.getByText("RECENT", { exact: true })).toHaveCount(0);
  const favoritesToggle = favorites.getByRole("button", { name: /^FAVORITES/ });
  await favoritesToggle.click();
  await expect(favoritesToggle).toHaveAttribute("aria-expanded", "false");
  await favoritesToggle.click();
  await expect(favoritesToggle).toHaveAttribute("aria-expanded", "true");

  await page.goto("/e2e.html?fixture=basic&skip-welcome");
  await expect(page.locator(".quick-access-group").filter({ hasText: "FAVORITES" })).toContainText("Ping Scan");
  await expect(page.getByRole("button", { name: "Remove Nmap.cmdnote from Favorites" }))
    .toHaveAttribute("aria-pressed", "true");
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
  expect(renamedState.settings.recentFiles).toBeUndefined();
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
  await page.goto("/?stress=5000&skip-welcome&performance=full");
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
  await page.getByRole("button", { name: "SELECT", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "Select Ping Scan" }).check();
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await expect(page.getByText("1 SELECTED")).toHaveCount(0);
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select Ping Scan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SELECT", exact: true }).first()).toBeVisible();
});

test("clears Selection Mode when switching files", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "SELECT", exact: true }).first().click();
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

test("favorites a nested folder and restores its Explorer ancestors", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "Add Nested to Favorites" }).click();
  await page.getByRole("button", { name: "References", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nested", exact: true })).toHaveCount(1);
  const favoriteNested = page.locator(".quick-access-group").filter({ hasText: "FAVORITES" })
    .getByRole("button", { name: "Nested", exact: true });
  await favoriteNested.click();
  await expect(page.getByRole("button", { name: "References", exact: true }))
    .toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Nested", exact: true }).last())
    .toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-entry-path$='/References/Nested']")).toHaveClass(/selected/);

  await page.getByRole("button", { name: "Actions for References" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog", { name: "Rename Folder" }).getByRole("textbox", { name: "Name" })
    .fill("Docs");
  await page.getByRole("button", { name: "RENAME" }).click();
  const renamed = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(renamed.settings.favorites[0].path).toContain("/Docs/Nested");

  await page.getByRole("button", { name: "Actions for Docs" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  const trashed = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(trashed.settings.favorites).toEqual([]);
});

test("wraps, expands and copies multiple multiline Examples", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const ping = page.locator("[data-command-id='ping-scan']");
  const arp = page.locator("[data-command-id='arp-scan']");
  await expect(ping.getByRole("button", { name: "Expand example for Ping Scan" })).toBeVisible();
  await expect(arp.getByRole("button", { name: "Expand example for ARP Scan" })).toBeVisible();
  await ping.getByRole("button", { name: "Expand example for Ping Scan" }).click();
  await arp.getByRole("button", { name: "Expand example for ARP Scan" }).click();
  await expect(page.locator(".example-cell.expanded")).toHaveCount(2);
  await ping.getByRole("button", { name: "MORE", exact: true }).click();
  await expect(ping.locator(".example-cell")).toHaveClass(/expanded/);

  const copy = ping.getByRole("button", { name: "Copy example for Ping Scan" });
  await copy.click();
  await expect(copy).toHaveClass(/copied/);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.split("\n")).toHaveLength(8);
  const layout = await ping.locator(".example-cell").evaluate((cell) => ({
    horizontalOverflow: cell.scrollWidth > cell.clientWidth,
  }));
  const whiteSpace = await ping.locator(".example-text").evaluate(
    (content) => getComputedStyle(content).whiteSpace,
  );
  expect(layout.horizontalOverflow).toBe(false);
  expect(whiteSpace).toBe("pre-wrap");

  await ping.getByRole("button", { name: "Collapse example for Ping Scan" }).click();
  await expect(ping.locator(".example-cell")).not.toHaveClass(/expanded/);
  await expect(arp.locator(".example-cell")).toHaveClass(/expanded/);
});

test("persists independent custom Dark and Light theme colors", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "Open settings" }).click();
  const custom = page.getByLabel("Use custom colors for this mode");
  await custom.check();
  await page.getByRole("textbox", { name: "Background HEX" }).fill("#111111");
  await page.getByRole("textbox", { name: "Text HEX" }).fill("#121212");
  await page.getByRole("textbox", { name: "Accent HEX" }).fill("#131313");
  await expect(page.getByText(/Low contrast warning/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-custom-theme", "true");

  await page.getByRole("radio", { name: "LIGHT" }).check({ force: true });
  await page.getByLabel("Use custom colors for this mode").check();
  await page.getByRole("textbox", { name: "Background HEX" }).fill("#fefefe");
  await page.getByRole("textbox", { name: "Text HEX" }).fill("#202020");
  await page.getByRole("textbox", { name: "Accent HEX" }).fill("#0066cc");

  await page.getByRole("radio", { name: "DARK" }).check({ force: true });
  await expect(page.getByRole("textbox", { name: "Background HEX" })).toHaveValue("#111111");
  await page.getByRole("textbox", { name: "Background HEX" }).fill("invalid");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByText("Custom theme colors must use #RRGGBB format.")).toBeVisible();
  await page.getByRole("textbox", { name: "Background HEX" }).fill("#111111");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();

  await page.goto("/e2e.html?fixture=basic&skip-welcome");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-custom-theme", "true");
  const customBackground = await page.locator("html").evaluate((root) =>
    getComputedStyle(root).getPropertyValue("--bg-main").trim(),
  );
  expect(customBackground).toBe("#111111");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "RESET CURRENT MODE" }).click();
  await expect(page.getByLabel("Use custom colors for this mode")).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Background HEX" })).toHaveValue("#0d1117");
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-custom-theme", "true");
});

test("only offers Example expansion beyond six visual lines", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  const one = page.locator("[data-command-id='example-one-line']");
  const six = page.locator("[data-command-id='example-six-lines']");
  const fifty = page.locator("[data-command-id='example-fifty-lines']");
  await expect(one.getByRole("button", { name: /Expand example/ })).toHaveCount(0);
  await expect(six.getByRole("button", { name: /Expand example/ })).toHaveCount(0);
  await expect(fifty.getByRole("button", { name: "Expand example for Fifty Line Example" }))
    .toBeVisible();
  await fifty.getByRole("button", { name: "Expand example for Fifty Line Example" }).click();
  await expect(fifty.locator(".example-text")).toContainText("echo line-50");
  const lines = (await fifty.locator(".example-text").innerText()).split("\n");
  expect(lines).toHaveLength(50);

  await page.getByRole("button", { name: "Table Example Cases TABLE" }).click();
  const compact = page.locator("[data-command-id='table-multiline-example']");
  await expect(compact.getByRole("button", { name: "Expand example for 01" })).toBeVisible();
  const compactLayout = await compact.evaluate((row) => ({
    height: row.getBoundingClientRect().height,
    horizontalOverflow: row.scrollWidth > row.clientWidth,
  }));
  expect(compactLayout.height).toBeGreaterThan(82);
  expect(compactLayout.horizontalOverflow).toBe(false);
});

test("remeasures expanded multiline Examples inside a 5,000-row virtual list", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?stress=5000&skip-welcome&performance=full");
  const row = page.locator("[data-command-id='stress-command-10']");
  await expect(row).toBeVisible();
  const collapsedHeight = await row.evaluate((element) => element.getBoundingClientRect().height);
  await row.getByRole("button", { name: "Expand example for Stress Command 0010" }).click();
  await expect(row.locator(".example-cell")).toHaveClass(/expanded/);
  await expect.poll(
    () => row.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThan(collapsedHeight);
  expect(await page.locator(".command-row").count()).toBeLessThan(50);
});

test("creates a local profile and opens the Welcome dashboard", async ({ page }) => {
  await page.goto("/e2e.html?reset");
  await expect(page.getByRole("heading", { name: "Who’s using Command Vault?" })).toBeVisible();
  await page.getByLabel("DISPLAY NAME").fill("  Quan   Tester  ");
  await page.getByRole("button", { name: "ENTER VAULT" }).click();
  const perfBtn = page.getByRole("button", { name: /Performance/i });
  if (await perfBtn.isVisible()) {
    await perfBtn.click();
  }
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Quan Tester/ }))
    .toBeVisible();
  await expect(page.getByText("No workspace selected", { exact: true })).toBeVisible();
  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.settings.displayName).toBe("Quan Tester");

  await page.goto("/e2e.html?reset&fixture=basic");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Tester/ }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Nmap" })).toBeVisible();
  await page.getByRole("button", { name: "OPEN FILE" }).click();
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
});

test("reorders Compact Table rows with menus, keyboard and pointer drag", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const table = page.locator("[data-section-id='reorder-table']");
  await table.getByRole("button", { name: "Reorder Table TABLE" }).click();

  await table.locator("[data-command-id='table-beta']")
    .getByRole("button", { name: "Actions for table row 02" }).click();
  await page.getByRole("menuitem", { name: "Move to Top" }).click();
  await expect(table.locator(".command-code code")).toHaveText(["echo beta", "echo alpha", "echo gamma"]);
  await page.getByRole("button", { name: "UNDO" }).click();

  await table.locator("[data-command-id='table-gamma']")
    .getByRole("button", { name: "Actions for table row 03" }).click();
  await page.getByRole("menuitem", { name: "Move to Position…" }).click();
  await page.getByLabel("Position (1–3)").fill("1");
  await page.getByRole("button", { name: "MOVE", exact: true }).click();
  await expect(table.locator(".command-code code")).toHaveText(["echo gamma", "echo alpha", "echo beta"]);
  await page.getByRole("button", { name: "UNDO" }).click();

  const alphaHandle = table.locator("[data-command-id='table-alpha']")
    .getByRole("button", { name: "Move table row 01" });
  await alphaHandle.focus();
  await alphaHandle.press("Space");
  await alphaHandle.press("End");
  await alphaHandle.press("Enter");
  await expect(table.locator(".command-code code")).toHaveText(["echo beta", "echo gamma", "echo alpha"]);
  await page.getByRole("button", { name: "UNDO" }).click();

  const source = table.locator("[data-command-id='table-gamma'] .row-drag-handle");
  const target = table.locator("[data-command-id='table-alpha']");
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + 30, targetBox!.y + 3, { steps: 8 });
  await page.mouse.up();
  await expect(table.locator(".command-code code")).toHaveText(["echo gamma", "echo alpha", "echo beta"]);
});

test("recovers after a simulated wake without rereading unchanged files or losing a modal draft", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  const before = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  const readsBefore = before.calls.filter((call: string) => call === "read_command_file").length;
  const listsBefore = before.calls.filter((call: string) => call === "list_directory").length;
  await page.locator("[data-command-id='ping-scan']").evaluate((row) => {
    row.dataset.resumeSentinel = "preserved";
  });

  await page.getByRole("button", { name: "Open settings" }).click();
  const profile = page.getByLabel("Local profile name");
  await profile.fill("Unsaved Draft");
  await page.evaluate(() => {
    (window as unknown as { __COMMAND_VAULT_TRIGGER_RECOVERY__: () => void })
      .__COMMAND_VAULT_TRIGGER_RECOVERY__();
  });
  await page.waitForTimeout(900);
  await expect(profile).toHaveValue("Unsaved Draft");
  await page.getByRole("button", { name: "CANCEL" }).click();

  await expect.poll(async () => {
    const current = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
    return current.calls.filter((call: string) => call === "list_directory").length;
  }).toBeGreaterThan(listsBefore);
  const after = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(after.calls.filter((call: string) => call === "read_command_file").length).toBe(readsBefore);
  await expect(page.locator("[data-command-id='ping-scan']")).toBeVisible();
  await expect(page.locator("[data-command-id='ping-scan']"))
    .toHaveAttribute("data-resume-sentinel", "preserved");
});

test("animates file changes and removes the visual snapshot after the transition", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  const outgoing = page.locator(".file-view-outgoing");
  const incoming = page.locator(".file-view-incoming");
  await expect(outgoing).toHaveCount(1);
  await expect(outgoing).toHaveAttribute("aria-hidden", "true");
  await expect(outgoing).toHaveAttribute("inert", "");
  await expect(outgoing.locator("[id]")).toHaveCount(0);
  await expect(incoming.getByRole("heading", { name: "GIT" })).toBeVisible();
  await expect.poll(() => outgoing.count()).toBe(0);
  await expect(page.locator(".workspace")).not.toHaveClass(/file-transitioning/);
  await expect(page.locator(".file-view")).toHaveCount(1);
});

test("uses instant file replacement when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(FIXTURE_URL);
  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await expect(page.getByRole("heading", { name: "GIT" })).toBeVisible();
  await expect(page.locator(".file-view-outgoing, .file-view-incoming")).toHaveCount(0);
});

test("keeps the newest file request when earlier reads finish late", async ({ page }) => {
  await page.goto(`${FIXTURE_URL}&slow-files`);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await expect(page.getByRole("button", { name: "Git", exact: true }))
    .toHaveAttribute("aria-busy", "true");
  await page.locator(".tree-file").filter({ hasText: "Nmap" }).click();
  await page.waitForTimeout(260);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GIT" })).toHaveCount(0);
  await expect(page.locator(".file-view")).toHaveCount(1);
});

test("uses persistent heart controls and SVG disclosures in Explorer", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(FIXTURE_URL);
  const nmapHeart = page.getByRole("button", { name: "Add Nmap.cmdnote to Favorites" });
  await expect(nmapHeart.locator("svg.icon-heart")).toBeVisible();
  await nmapHeart.click();
  await expect(page.locator(".quick-access-heading .icon-heart")).toBeVisible();
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await expect(page.getByRole("menuitem", { name: /Favorite/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const nested = page.getByRole("button", { name: "Nested", exact: true });
  const disclosure = nested.locator("svg.tree-disclosure");
  await expect(disclosure).not.toHaveClass(/expanded/);
  await nested.focus();
  await nested.press("Space");
  await expect(disclosure).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Actions for Nested" }).click();
  await expect(page.getByRole("menuitem", { name: /Favorite/ })).toHaveCount(0);
  const layout = await page.locator(".app-shell").evaluate((shell) => ({
    horizontalOverflow: shell.scrollWidth > shell.clientWidth,
  }));
  expect(layout.horizontalOverflow).toBe(false);
});

test("uses readable Welcome dashboard microcopy", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic");
  await expect(page.locator(".welcome-eyebrow")).toHaveCSS("font-size", "12px");
  await expect(page.locator(".dashboard-card-label").first()).toHaveCSS("font-size", "11px");
  await expect(page.locator(".dashboard-stat span").first()).toHaveCSS("font-size", "10px");
  await expect(page.locator(".welcome-subtitle")).toHaveCSS("font-size", "15px");
});

test("preserves Explorer scroll anchors and focus across tree and file renders", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(`${FIXTURE_URL}&large-tree`);
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  const explorer = page.locator(".explorer-content");
  await expect.poll(async () => explorer.evaluate((element) => element.clientHeight)).toBeGreaterThan(100);
  const folderRow = page.locator("[data-entry-path$='/Long Folder 20']");
  const folder = folderRow.getByRole("button", { name: "Long Folder 20", exact: true });
  await folder.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const folderTop = await folderRow.evaluate((row) => row.getBoundingClientRect().top);
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await expect(folder).toBeFocused();
  await expect.poll(async () => Math.abs(
    (await folderRow.evaluate((row) => row.getBoundingClientRect().top)) - folderTop,
  )).toBeLessThan(2);

  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  const fileRow = page.locator("[data-entry-path$='/Long Folder 20/Long File 20.cmdnote']");
  const file = fileRow.getByRole("button", { name: "Long File 20", exact: true });
  await expect(file).toBeVisible();
  await file.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const fileTop = await fileRow.evaluate((row) => row.getBoundingClientRect().top);
  await file.click();
  await expect(page.getByRole("heading", { name: "LONG FILE 20" })).toBeVisible();
  await expect(file).toBeFocused();
  await expect.poll(async () => Math.abs(
    (await fileRow.evaluate((row) => row.getBoundingClientRect().top)) - fileTop,
  )).toBeLessThan(2);

  const scrollBeforeFavorite = await explorer.evaluate((element) => element.scrollTop);
  const heart = fileRow.getByRole("button", { name: "Add Long File 20.cmdnote to Favorites" });
  await heart.click();
  await expect(fileRow.getByRole("button", { name: "Remove Long File 20.cmdnote from Favorites" }))
    .toBeFocused();
  await expect.poll(async () => Math.abs(
    (await fileRow.evaluate((row) => row.getBoundingClientRect().top)) - fileTop,
  )).toBeLessThan(2);
  expect(await explorer.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollBeforeFavorite);

  const search = page.getByRole("combobox", { name: "Search commands" });
  const scrollBeforeSearch = await explorer.evaluate((element) => element.scrollTop);
  await search.fill("Long File 21");
  await expect(page.getByRole("option").first()).toBeVisible();
  await search.press("Enter");
  await expect(search).toBeFocused();
  await expect.poll(() => explorer.evaluate((element) => element.scrollTop))
    .toBeCloseTo(scrollBeforeSearch, 0);

  await page.goto("/e2e.html?fixture=basic&skip-welcome&large-tree");
  const restartedExplorer = page.locator(".explorer-content");
  await expect(page.getByRole("heading", { name: /LONG FILE|NMAP/ })).toBeVisible();
  await expect.poll(() => restartedExplorer.evaluate((element) => element.scrollTop)).toBe(0);
});

test("animates Section and Table opening and closing with bounded cleanup", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator("[data-section-id='discovery'] .section-content"))
    .not.toHaveClass(/section-content-opening|section-content-closing/);
  const archive = page.locator("[data-section-id='archive']");
  const toggle = archive.getByRole("button", { name: "Archive TABLE" });
  const content = archive.locator(".section-content");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(content).toHaveClass(/section-content-opening/);
  await expect(content).toHaveCSS("animation-duration", "0.18s");
  await expect.poll(async () => content.getAttribute("class"))
    .not.toContain("section-content-opening");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(content).toHaveClass(/section-content-closing/);
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveCSS("animation-duration", "0.14s");
  await expect(content).toBeHidden();
  await expect(content).not.toHaveAttribute("inert", "");

  await toggle.evaluate((button) => {
    for (let index = 0; index < 20; index += 1) (button as HTMLButtonElement).click();
  });
  await page.waitForTimeout(250);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(content).toBeHidden();
  await expect(content).not.toHaveClass(/section-content-opening|section-content-closing/);
  await expect(content).not.toHaveAttribute("inert", "");
});

test("skips Section motion when Reduced Motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(FIXTURE_URL);
  const archive = page.locator("[data-section-id='archive']");
  const toggle = archive.getByRole("button", { name: "Archive TABLE" });
  const content = archive.locator(".section-content");
  await toggle.click();
  await expect(content).toBeVisible();
  await expect(content).not.toHaveClass(/section-content-opening/);
  await toggle.click();
  await expect(content).toBeHidden();
  await expect(content).not.toHaveClass(/section-content-closing/);
});

test("cycles and persists three local Section Highlight levels without changing cmdnote", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const discovery = page.locator("[data-section-id='discovery']");
  const star = discovery.getByRole("button", { name: /Highlight Discovery/ });
  await expect(page.locator(".section-title")).toHaveCount(3);
  const sectionOrder = await page.locator(".section-title").allTextContents();

  await star.click();
  await expect(discovery).toHaveAttribute("data-highlight-level", "gold");
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(star.locator(".section-highlight-badge")).toHaveText("H1");
  await star.click();
  await expect(discovery).toHaveAttribute("data-highlight-level", "orange");
  await expect(star.locator(".section-highlight-badge")).toHaveText("H2");
  await star.click();
  await expect(discovery).toHaveAttribute("data-highlight-level", "red");
  await expect(star.locator(".section-highlight-badge")).toHaveText("H3");
  await star.click();
  await expect(discovery).toHaveAttribute("data-highlight-level", "none");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(".section-title").allTextContents()).toEqual(sectionOrder);

  await star.click();
  await star.click();
  let state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.settings.sectionHighlights).toEqual([{
    filePath: "/e2e/CommandVault/Nmap.cmdnote",
    sectionId: "discovery",
    level: "orange",
  }]);
  expect(state.files["/e2e/CommandVault/Nmap.cmdnote"]).not.toContain("sectionHighlights");
  expect(state.files["/e2e/CommandVault/Nmap.cmdnote"]).not.toContain("highlightLevel");

  await page.goto("/e2e.html?fixture=basic&skip-welcome");
  await expect(page.locator("[data-section-id='discovery']"))
    .toHaveAttribute("data-highlight-level", "orange");
  await page.getByRole("button", { name: "Actions for Nmap.cmdnote" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog", { name: "Rename Command File" })
    .getByRole("textbox", { name: "Name" }).fill("Recon");
  await page.getByRole("button", { name: "RENAME" }).click();
  state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.settings.sectionHighlights[0].filePath).toContain("Recon.cmdnote");

  const archive = page.locator("[data-section-id='archive']");
  await archive.getByRole("button", { name: /Highlight Archive/ }).click();
  await archive.getByRole("button", { name: "Actions for Archive" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Section" })
    .getByRole("button", { name: "DELETE" }).click();
  state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.settings.sectionHighlights.some(
    (highlight: { sectionId: string }) => highlight.sectionId === "archive",
  )).toBe(false);
});

test("keeps virtual Section motion stable through 100 rapid toggles", async ({ page }) => {
  test.setTimeout(60_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto("/?stress=5000&skip-welcome&performance=full");
  const first = page.locator(".command-section").first();
  const toggle = first.locator(".section-toggle");
  await toggle.evaluate((button) => {
    for (let index = 0; index < 100; index += 1) (button as HTMLButtonElement).click();
  });
  await page.waitForTimeout(260);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(first.locator(".section-content")).not
    .toHaveClass(/section-content-opening|section-content-closing/);
  await expect(first.locator(".section-content")).not.toHaveAttribute("inert", "");
  expect(await page.locator(".command-row").count()).toBeLessThan(50);
  expect(runtimeErrors).toEqual([]);
});

test("persists Performance Mode and disables motion in Low Power", async ({ page }) => {
  await page.goto(`${FIXTURE_URL}&auto-performance`);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("Performance mode").selectOption("low-power");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");

  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await expect(page.getByRole("heading", { name: "GIT" })).toBeVisible();
  await expect(page.locator(".file-view-outgoing, .file-view-incoming")).toHaveCount(0);
  await page.getByRole("button", { name: "Table Example Cases TABLE" }).click();
  await expect(page.locator("[data-section-id='table-example-cases'] .section-content"))
    .not.toHaveClass(/section-content-opening/);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "COPY DIAGNOSTICS" }).click();
  await expect(page.getByRole("button", { name: "COPIED" })).toBeVisible();
  const diagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(diagnostics.selectedMode).toBe("low-power");
  expect(diagnostics.effectiveMode).toBe("low-power");
  await page.getByRole("button", { name: "CANCEL" }).click();

  await page.goto("/e2e.html?fixture=basic&skip-welcome");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
});

test("keeps Search usable when the workspace Worker is unavailable", async ({ page }) => {
  await page.goto(`${FIXTURE_URL}&disable-worker`);
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("namp");
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.getByText("NEAR").first()).toBeVisible();
});

test("uses shorter non-cloning motion in Balanced mode", async ({ page }) => {
  await page.goto(`${FIXTURE_URL}&performance=balanced`);
  await expect(page.locator("html")).toHaveAttribute("data-performance", "balanced");
  const archive = page.locator("[data-section-id='archive']");
  await archive.getByRole("button", { name: "Archive TABLE" }).click();
  await expect(archive.locator(".section-content")).toHaveCSS("animation-duration", "0.121s");
  await page.locator(".tree-file").filter({ hasText: "Git" }).click();
  await expect(page.getByRole("heading", { name: "GIT" })).toBeVisible();
  await expect(page.locator(".file-view-outgoing")).toHaveCount(0);
});

test("Auto selects Low Power for 200% semantic scale without root zoom", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(`${FIXTURE_URL}&auto-performance`);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("UI scale percentage").fill("200");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
  await expect(page.locator("html")).toHaveAttribute("data-ui-scale", "large");
  await expect(page.locator("#app")).toHaveCSS("zoom", "1");
  await expect(page.locator("body")).toHaveCSS("font-size", "28px");
  const layout = await page.locator(".app-shell").evaluate((shell) => ({
    horizontalOverflow: shell.scrollWidth > shell.clientWidth,
  }));
  expect(layout.horizontalOverflow).toBe(false);
  await expect(page.locator(".file-overflow-menu")).toBeVisible();
});

test("Auto downgrades after sustained slow frames", async ({ page }) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  try {
    await page.goto(`${FIXTURE_URL}&auto-performance`);
    await page.evaluate(async () => {
      for (let index = 0; index < 8; index += 1) {
        document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        const started = performance.now();
        while (performance.now() - started < 90) { /* Simulate a slow interaction. */ }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await expect.poll(() => page.locator("html").getAttribute("data-performance"), {
      timeout: 8_000,
    }).toBe("low-power");
  } finally {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});

test("Auto honors the Linux power-saver profile without a polling timer", async ({ page }) => {
  await page.goto(`${FIXTURE_URL}&auto-performance&system-power-saver`);
  await expect.poll(() => page.locator("html").getAttribute("data-performance"))
    .toBe("low-power");
});

test("stays responsive at 200% scale and six-times CPU throttling in Low Power", async ({ page }) => {
  test.setTimeout(60_000);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  try {
    await page.goto("/?stress=5000&skip-welcome&performance=low-power&scale=200");
    await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
    await expect(page.locator("html")).toHaveAttribute("data-ui-scale", "large");
    await expect(page.locator("#app")).toHaveCSS("zoom", "1");
    await expect(page.locator("body")).toHaveCSS("font-size", "28px");
    expect(await page.locator(".command-row").count()).toBeLessThan(120);
    await page.evaluate(() =>
      (window as unknown as { __COMMAND_VAULT_CLEAR_DIAGNOSTICS__: () => void })
        .__COMMAND_VAULT_CLEAR_DIAGNOSTICS__(),
    );

    const toggle = page.locator(".command-section .section-toggle").first();
    const durations = await toggle.evaluate(async (button) => {
      const values: number[] = [];
      for (let index = 0; index < 40; index += 1) {
        const started = performance.now();
        (button as HTMLButtonElement).click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        values.push(performance.now() - started);
      }
      return values.sort((left, right) => left - right);
    });
    const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    expect(durations[p95Index] ?? 999).toBeLessThan(100);

    const search = page.getByRole("combobox", { name: "Search commands" });
    const searchDuration = await search.evaluate(async (input) => {
      const results = document.querySelector<HTMLElement>("#command-search-results");
      if (!results) return 999;
      const started = performance.now();
      const completed = new Promise<number>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!results.hidden && results.querySelector(".search-result")) {
            observer.disconnect();
            resolve(performance.now() - started);
          }
        });
        observer.observe(results, { childList: true, subtree: true, attributes: true });
      });
      (input as HTMLInputElement).value = "Stress Command 4999";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return completed;
    });
    await expect(page.getByRole("option").first()).toBeVisible();
    expect(searchDuration).toBeLessThan(300);
    await expect(page.locator(".file-view-outgoing, .file-view-incoming"))
      .toHaveCount(0);
    const diagnostics = JSON.parse(await page.evaluate(() =>
      (window as unknown as { __COMMAND_VAULT_DIAGNOSTICS__: () => string })
        .__COMMAND_VAULT_DIAGNOSTICS__(),
    ));
    expect(diagnostics.recent.filter(
      (entry: { name: string; durationMs: number }) =>
        entry.name === "main-thread-long-task" && entry.durationMs > 250,
    )).toEqual([]);
  } finally {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});

test("BUG-007: rejects fractional font sizes and accepts integer font sizes", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole("button", { name: "Open settings" }).click();
  const uiFont = page.getByLabel("UI font size");
  const codeFont = page.getByLabel("Code font size");

  await uiFont.fill("14.5");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.locator(".modal-error")).toContainText("Font sizes must be whole numbers");

  await uiFont.fill("14");
  await codeFont.fill("13.2");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.locator(".modal-error")).toContainText("Font sizes must be whole numbers");

  await codeFont.fill("13");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.locator(".modal-dialog")).toHaveCount(0);
});

test("BUG-008: manages modal keyboard focus, initial focus, focus trap, and restore on close", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const settingsButton = page.getByRole("button", { name: "Open settings" });
  await settingsButton.click();

  const dialog = page.locator(".modal-dialog");
  await expect(dialog).toBeVisible();

  await expect(page.locator(":focus")).toBeVisible();
  const initialFocusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
  expect(initialFocusInside).toBe(true);

  for (let i = 0; i < 15; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settingsButton).toBeFocused();
});

test("BUG-009: keeps compact table row number and search result title consistent after reorder", async ({ page }) => {
  await page.goto(FIXTURE_URL);
  const table = page.locator("[data-section-id='reorder-table']");
  await table.getByRole("button", { name: "Reorder Table TABLE" }).click();

  // Initially, table-gamma is row 03
  await expect(table.locator("[data-command-id='table-gamma'] .compact-row-number")).toHaveText("03");

  // Move table-gamma to position 1
  await table.locator("[data-command-id='table-gamma']")
    .getByRole("button", { name: "Actions for table row 03" }).click();
  await page.getByRole("menuitem", { name: "Move to Position…" }).click();
  await page.getByLabel("Position (1–3)").fill("1");
  await page.getByRole("button", { name: "MOVE", exact: true }).click();

  // table-gamma is now at position 01
  await expect(table.locator("[data-command-id='table-gamma'] .compact-row-number")).toHaveText("01");

  // Search for echo gamma
  const searchInput = page.getByRole("combobox", { name: "Search commands" });
  await searchInput.fill("echo gamma");
  const firstOption = page.getByRole("option").first();
  await expect(firstOption).toBeVisible();
  await expect(firstOption.locator(".search-result-title")).toHaveText("Table Row 01");
  await expect(firstOption.locator(".search-result-command")).toHaveText("echo gamma");
});

test("PHASE 1 & 49: renders startup dashboard and blocks heavy workspace initialization before selection", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup");

  // Verify dashboard is visible
  await expect(page.getByRole("heading", { name: "Choose how Command Vault should run." })).toBeVisible();
  const batteryBtn = page.getByRole("button", { name: /Battery Saver/i });
  const perfBtn = page.getByRole("button", { name: /Performance/i });
  await expect(batteryBtn).toBeVisible();
  await expect(perfBtn).toBeVisible();

  // Verify heavy workspace state has not been rendered
  await expect(page.locator(".tree-file")).toHaveCount(0);
  await expect(page.locator(".command-entry")).toHaveCount(0);

  // Verify no filesystem list_directory or read_command_file calls made before choice
  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.calls).not.toContain("list_directory");
  expect(state.calls).not.toContain("read_command_file");
});

test("PHASE 49: choosing Battery Saver applies low-power mode and restores workspace", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup");

  const batteryBtn = page.getByRole("button", { name: /Battery Saver/i });
  await batteryBtn.click();

  // Verify mode applied and workspace loaded
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.locator(".tree-file").filter({ hasText: "Nmap" })).toBeVisible();

  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.calls).toContain("list_directory");
});

test("PHASE 49: choosing Performance applies full mode and restores workspace", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup");

  const perfBtn = page.getByRole("button", { name: /Performance/i });
  await perfBtn.click();

  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.locator(".tree-file").filter({ hasText: "Nmap" })).toBeVisible();
});

test("PHASE 52: rapid double-click on mode action initiates workspace only once", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup");

  const perfBtn = page.getByRole("button", { name: /Performance/i });
  // Click multiple times rapidly
  await perfBtn.dblclick();

  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  // Verify list_directory called only once for initial workspace load
  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  const listCalls = state.calls.filter((c: string) => c === "list_directory");
  expect(listCalls.length).toBe(1);
});

test("PHASE 53: displays last used mode while keeping workspace uninitialized until selection", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup&last-performance");

  await expect(page.getByText("Last used: Performance")).toBeVisible();
  await expect(page.locator(".tree-file")).toHaveCount(0);

  const state = JSON.parse(await page.locator("#e2e-state").getAttribute("data-state") ?? "{}");
  expect(state.calls).not.toContain("list_directory");
});

test("PHASE 54: auto-start preference skips selection and applies chosen mode", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&startup-preference=battery-saver");

  // Selection dashboard skipped, workspace loaded directly
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
});

test("PHASE 55: interrupted startup recovery overrides auto-start preference and focuses Battery Saver", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&interrupted-startup&startup-preference=performance");

  // Must show recovery dashboard despite startup-preference=performance
  await expect(page.getByText("Interrupted startup detected")).toBeVisible();
  await expect(page.getByText("Previous startup did not finish normally.")).toBeVisible();
  const batteryBtn = page.getByRole("button", { name: /Battery Saver/i });
  await expect(batteryBtn).toBeVisible();
  await expect(batteryBtn).toBeFocused();

  // Heavy workspace not loaded
  await expect(page.locator(".tree-file")).toHaveCount(0);
});

test("PHASE 56: keyboard accessibility with Tab, Space, Enter, and initial focus", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup&last-performance");

  const perfBtn = page.getByRole("button", { name: /Performance/i });
  const batteryBtn = page.getByRole("button", { name: /Battery Saver/i });

  // Initial focus on last used mode (performance)
  await expect(perfBtn).toBeFocused();

  // Press Enter on focused button or Tab to Battery Saver
  await batteryBtn.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");
});

test("PHASE 57: prefers-reduced-motion overrides animations in Performance mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&ask-startup");

  const perfBtn = page.getByRole("button", { name: /Performance/i });
  await perfBtn.click();

  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
});

test("persists Performance mode and cyber UI when switching theme color", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&startup-preference=performance");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");

  // Open settings and switch to PURPLE accent
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "PURPLE" }).check({ force: true });
  await page.getByRole("button", { name: "SAVE", exact: true }).click();

  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");
  await expect(page.locator(".telemetry-audio-toggle")).toBeVisible();
  await expect(page.locator(".telemetry-matrix-toggle")).toBeVisible();
  await expect(page.locator(".tactical-telemetry-bar")).toBeVisible();

  // Open settings and switch to LIGHT theme with GREEN accent
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "LIGHT" }).check({ force: true });
  await page.getByRole("radio", { name: "GREEN" }).check({ force: true });
  await page.getByRole("button", { name: "SAVE", exact: true }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");
  await expect(page.locator(".telemetry-audio-toggle")).toBeVisible();
  await expect(page.locator(".telemetry-matrix-toggle")).toBeVisible();
});

test("God-Tier 2.0: equalizer visualizer, interactive params, and reactor overcharge", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&performance=full");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");

  // Telemetry real-time 7-bar visualizer
  const visualizer = page.locator(".telemetry-visualizer");
  await expect(visualizer).toBeVisible();
  await expect(visualizer.locator(".telemetry-eq-bar")).toHaveCount(7);

  // Open Nmap command file
  await page.locator(".tree-file").filter({ hasText: "Nmap" }).click();
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  // Tactical parameter chips in visible command
  const paramChip = page.locator(".interactive-param").first();
  await expect(paramChip).toBeVisible();
  await expect(paramChip).toHaveAttribute("role", "button");

  // Welcome dashboard Quantum Core Reactor Overcharge
  await page.getByRole("button", { name: "Open Home dashboard" }).click();
  const reactor = page.locator(".quantum-core-reactor");
  await expect(reactor).toBeVisible();
  await reactor.click();
  await expect(reactor).toHaveClass(/overcharged/);
});

test("God-Tier 3.0: telemetry oscilloscope, cyber boot replay, and hex shockwave canvas", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&startup-preference=performance");
  await expect(page.locator("html")).toHaveAttribute("data-performance", "full");

  // Oscilloscope canvas in telemetry visualizer
  const oscilloscope = page.locator(".telemetry-oscilloscope");
  await expect(oscilloscope).toBeVisible();

  // Wait for workspace ready
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  // Settings: REPLAY BOOT button
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const replayBootBtn = page.getByRole("button", { name: "REPLAY BOOT" });
  await expect(replayBootBtn).toBeVisible();
  await replayBootBtn.click();

  // Boot sequence overlay appears and can be dismissed
  const bootOverlay = page.locator(".cyber-boot-overlay");
  await expect(bootOverlay).toBeVisible();
  await expect(page.locator(".boot-laser-sweep")).toBeVisible();
  await expect(page.locator(".boot-title")).toContainText("COMMAND VAULT // TACTICAL SECURE KERNEL");
  await expect(page.locator(".boot-magnetic-slider")).toBeVisible();

  // Press Escape to dismiss immediately
  await page.keyboard.press("Escape");
  await expect(bootOverlay).not.toBeVisible();
});

test("v0.17.0: Magnetic Railgun Slider engage and boot sequence", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome&startup-preference=performance");
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "REPLAY BOOT" }).click();

  const bootOverlay = page.locator(".cyber-boot-overlay");
  await expect(bootOverlay).toBeVisible();

  const railSlider = page.locator(".boot-magnetic-slider");
  await expect(railSlider).toBeVisible();
  await expect(page.locator(".slider-rail-puck")).toBeVisible();

  // Press Enter to auto-slide puck to target
  await page.keyboard.press("Enter");
  await expect(railSlider).toHaveClass(/engaged-hidden/);
  await expect(page.locator(".boot-holo-center")).toBeVisible();

  // Escape to dismiss
  await page.keyboard.press("Escape");
  await expect(bootOverlay).not.toBeVisible();
});

test("God-Tier 4.0: holographic cyber globe and matrix digital rain", async ({ page }) => {
  // 1. Check Welcome Dashboard Cyber Globe
  await page.goto("/e2e.html?reset&fixture=basic&startup-preference=performance");
  await expect(page.locator(".cyber-globe-container")).toBeVisible();
  await expect(page.locator(".quantum-core-reactor")).toBeVisible();

  // 2. Open file and verify section actions are fully accessible without obstructions
  await page.getByRole("button", { name: "OPEN FILE" }).click();
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions for Discovery" })).toBeVisible();

  // 3. Toggle Matrix Code Rain via telemetry button
  const matrixToggle = page.locator(".telemetry-matrix-toggle");
  await expect(matrixToggle).toBeVisible();
  await expect(matrixToggle).toHaveText("MATRIX: OFF");
  await matrixToggle.click();
  await expect(matrixToggle).toHaveText("MATRIX: ON");
  await expect(page.locator(".matrix-rain-canvas")).toBeVisible();

  // Toggle back via Ctrl+Alt+M
  await page.keyboard.press("Control+Alt+KeyM");
  await expect(matrixToggle).toHaveText("MATRIX: OFF");
  await expect(page.locator(".matrix-rain-canvas")).not.toBeVisible();
});

test("God-Tier 5.0: hero tactical radar telemetry and plasma circuit surge", async ({ page }) => {
  // 1. Verify Welcome Dashboard Hero Tactical Radar
  await page.goto("/e2e.html?reset&fixture=basic&startup-preference=performance");
  await expect(page.locator(".hero-radar-container")).toBeVisible();
  const radarCanvas = page.locator(".tactical-radar-canvas");
  await expect(radarCanvas).toBeVisible();

  // 2. Click radar to pulse target lock
  await radarCanvas.click();

  // 3. Open file and verify electric circuit surge on command copy
  await page.getByRole("button", { name: "OPEN FILE" }).click();
  await expect(page.getByRole("heading", { name: "NMAP" })).toBeVisible();

  const firstRow = page.locator(".command-row").first();
  const copyBtn = firstRow.locator(".action-button.primary-action");
  await copyBtn.click();
  await expect(firstRow).toHaveClass(/row-circuit-surge/);
  await expect(copyBtn).toHaveText("COPIED");
});

test("God-Tier 6.0: neural omni-palette tactical controls", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&startup-preference=performance");

  await expect(page.locator(".hero-radar-container")).toBeVisible();

  // 1. Test Neural Omni-Palette via Ctrl+Space
  await page.keyboard.press("Control+Space");
  const omniModal = page.locator(".omni-palette-modal");
  await expect(omniModal).toBeVisible();

  // Search in Omni-Palette for Matrix
  const omniInput = page.locator(".omni-search-input");
  await omniInput.fill("Matrix");
  const matrixAction = page.locator(".omni-action-item").filter({ hasText: "Matrix Digital Rain" });
  await expect(matrixAction).toBeVisible();

  // Execute action with Enter
  await page.keyboard.press("Enter");
  await expect(omniModal).toBeHidden();

  // 2. Open again and test Low Power mode
  await page.keyboard.press("Control+Space");
  await expect(omniModal).toBeVisible();
  await omniInput.fill("Tiết kiệm pin");
  const lowPowerAction = page.locator(".omni-action-item").filter({ hasText: "Chế độ Tiết kiệm pin" });
  await expect(lowPowerAction).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(omniModal).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-performance", "low-power");

  // 3. Open again and test Esc close
  await page.keyboard.press("Control+Space");
  await expect(omniModal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(omniModal).toBeHidden();
});

test("v0.17.0: Tactical Target Variable Injector HUD modal and live injection", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome");

  // Verify Tactical Variable pill is visible on tab bar
  const varPill = page.locator(".tactical-vars-pill");
  await expect(varPill).toBeVisible();
  await expect(varPill).toContainText("UNSET");

  // Open modal via pill click
  await varPill.click();
  const modal = page.locator(".tactical-modal");
  await expect(modal).toBeVisible();

  // Enter Target IP & Port
  const targetInput = page.locator(".tactical-input[data-key='TARGET']");
  const portInput = page.locator(".tactical-input[data-key='PORT']");
  await targetInput.fill("10.10.11.45");
  await portInput.fill("8080");

  // Verify live preview shows injected command
  const previewCode = page.locator(".tactical-preview-code");
  await expect(previewCode).toContainText("10.10.11.45");
  await expect(previewCode).toContainText("8080");

  // Save via Enter or click
  const saveBtn = page.getByRole("button", { name: /SAVE CONFIG/ });
  await saveBtn.click();
  await expect(modal).toBeHidden();

  // Check pill updated
  await expect(varPill).toHaveClass(/has-target/);
  await expect(varPill).toContainText("10.10.11.45:8080");
});

test("v0.17.0: Multi-Tab Cyber Workspace tab navigation and management", async ({ page }) => {
  await page.goto("/e2e.html?reset&fixture=basic&skip-welcome");

  const tabBar = page.locator(".workspace-tab-bar");
  await expect(tabBar).toBeVisible();

  // Tab 1 for Nmap should be active
  const nmapTab = tabBar.locator(".workspace-tab-item").filter({ hasText: "Nmap" });
  await expect(nmapTab).toBeVisible();
  await expect(nmapTab).toHaveClass(/active/);

  // Open Long File from explorer
  const longFileEntry = page.locator(".explorer-item").filter({ hasText: "Long File" }).first();
  if (await longFileEntry.isVisible()) {
    await longFileEntry.click();
    const longTab = tabBar.locator(".workspace-tab-item").filter({ hasText: "Long File" });
    await expect(longTab).toBeVisible();
    await expect(longTab).toHaveClass(/active/);

    // Switch back to Nmap tab by clicking
    await nmapTab.click();
    await expect(nmapTab).toHaveClass(/active/);
    await expect(longTab).not.toHaveClass(/active/);

    // Close Long File tab via close button
    const closeBtn = longTab.locator(".tab-close-btn");
    await closeBtn.click();
    await expect(longTab).toBeHidden();
  }

  // Dashboard button in tab bar
  const dashTab = tabBar.locator(".tab-item-dashboard");
  await dashTab.click();
  await expect(dashTab).toHaveClass(/active/);
  await expect(page.locator(".welcome-dashboard")).toBeVisible();
});
