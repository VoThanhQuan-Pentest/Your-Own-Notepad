import "./styles/base.css";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/explorer.css";
import "./styles/command-table.css";
import "./styles/modal.css";
import "./styles/search.css";

import { CommandVaultApplication } from "./application";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Application root was not found.");
}

const application = new CommandVaultApplication(root);
void application.start().catch((error: unknown) => {
  console.error("Command Vault failed to start", error);
  const state = document.createElement("main");
  state.className = "startup-error";
  const title = document.createElement("h1");
  title.textContent = "Command Vault could not start";
  const message = document.createElement("p");
  message.textContent = error instanceof Error ? error.message : String(error);
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "primary-button";
  reload.textContent = "RELOAD";
  reload.addEventListener("click", () => window.location.reload());
  state.append(title, message, reload);
  root.replaceChildren(state);
});
