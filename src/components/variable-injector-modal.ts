import {
  clearTacticalVariables,
  getTacticalVariables,
  injectVariables,
  saveTacticalVariables,
  setTacticalVariable,
  subscribeTacticalVariables,
  type ExtractedVariable,
  type TacticalVariables,
} from "../services/variables";
import { playLaserChirp, playTacticalBlip } from "../services/audio";

export function createVariablePill(onClick: () => void): HTMLElement {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "tactical-vars-pill";
  pill.title = "Tactical Target Injector (Ctrl+Alt+V)";

  const icon = document.createElement("span");
  icon.className = "vars-icon";
  icon.textContent = "🎯";

  const label = document.createElement("span");
  label.className = "vars-label";
  label.textContent = "TARGET:";

  const value = document.createElement("span");
  value.className = "vars-value";

  pill.append(icon, label, value);

  const update = (vars: TacticalVariables) => {
    const target = vars.TARGET || "";
    const port = vars.PORT ? `:${vars.PORT}` : "";
    if (target) {
      pill.classList.add("has-target");
      label.textContent = "TARGET:";
      value.textContent = `${target}${port}`;
    } else if (vars.LHOST) {
      pill.classList.add("has-target");
      label.textContent = "LHOST:";
      value.textContent = `${vars.LHOST}${vars.LPORT ? `:${vars.LPORT}` : ""}`;
    } else {
      pill.classList.remove("has-target");
      label.textContent = "VARS:";
      value.textContent = "UNSET";
    }
  };

  update(getTacticalVariables());
  subscribeTacticalVariables(update);

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    playTacticalBlip();
    onClick();
  });

  return pill;
}

export function openVariableModal(): void {
  // Check if modal already open
  if (document.querySelector(".tactical-modal-overlay")) {
    return;
  }

  playTacticalBlip();
  const overlay = document.createElement("div");
  overlay.className = "tactical-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "tactical-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "Tactical Target Injector");

  // Header
  const header = document.createElement("div");
  header.className = "tactical-modal-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "tactical-modal-title";
  const beacon = document.createElement("span");
  beacon.className = "status-beacon";
  const titleText = document.createElement("span");
  titleText.textContent = "TACTICAL TARGET INJECTOR // SESSION PAYLOAD MATRIX";
  titleGroup.append(beacon, titleText);

  const closeBtn = document.createElement("button");
  closeBtn.className = "tactical-modal-close";
  closeBtn.textContent = "×";
  closeBtn.title = "Close (Esc)";
  header.append(titleGroup, closeBtn);

  // Body
  const body = document.createElement("div");
  body.className = "tactical-modal-body";

  const current = getTacticalVariables();

  const grid = document.createElement("div");
  grid.className = "tactical-grid";

  // Inputs definition
  const fields = [
    {
      key: "TARGET",
      label: "TARGET IP / HOST",
      alias: "<TARGET_IP>, <RHOST>, {target}",
      placeholder: "e.g. 10.10.11.45 or victim.com",
      value: current.TARGET,
      span: 2,
    },
    {
      key: "PORT",
      label: "TARGET PORT",
      alias: "<PORT>, <RPORT>",
      placeholder: "e.g. 80, 443, 8080",
      value: current.PORT,
      span: 1,
    },
    {
      key: "USER",
      label: "TARGET USER",
      alias: "<USER>, <USERNAME>",
      placeholder: "e.g. admin, root",
      value: current.USER,
      span: 1,
    },
    {
      key: "LHOST",
      label: "ATTACKER LHOST",
      alias: "<LHOST>, <LOCAL_IP>",
      placeholder: "e.g. 10.10.14.2 or tun0",
      value: current.LHOST,
      span: 1,
    },
    {
      key: "LPORT",
      label: "ATTACKER LPORT",
      alias: "<LPORT>, <LOCAL_PORT>",
      placeholder: "e.g. 4444, 9001",
      value: current.LPORT,
      span: 1,
    },
    {
      key: "WORDLIST",
      label: "WORDLIST PATH",
      alias: "<WORDLIST>, {wordlist}",
      placeholder: "e.g. /usr/share/wordlists/rockyou.txt",
      value: current.WORDLIST,
      span: 2,
    },
  ];

  const inputs: Record<string, HTMLInputElement> = {};

  fields.forEach((f) => {
    const fieldWrap = document.createElement("div");
    fieldWrap.className = `tactical-field ${f.span === 2 ? "span-2" : ""}`;

    const labelWrap = document.createElement("label");
    labelWrap.className = "tactical-label";
    const labelTitle = document.createElement("span");
    labelTitle.textContent = f.label;
    const aliasHint = document.createElement("span");
    aliasHint.className = "alias-hint";
    aliasHint.textContent = f.alias;
    labelWrap.append(labelTitle, aliasHint);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tactical-input";
    input.placeholder = f.placeholder;
    input.value = f.value;
    input.dataset.key = f.key;
    inputs[f.key] = input;

    fieldWrap.append(labelWrap, input);
    grid.append(fieldWrap);
  });

  // Live Preview Panel
  const previewPanel = document.createElement("div");
  previewPanel.className = "tactical-preview-panel";

  const previewHeader = document.createElement("div");
  previewHeader.className = "tactical-preview-header";
  previewHeader.textContent = "LIVE COMMAND INJECTION PREVIEW";

  const previewCode = document.createElement("div");
  previewCode.className = "tactical-preview-code";

  previewPanel.append(previewHeader, previewCode);

  const sampleTemplate = "nmap -sC -sV -p <PORT> <TARGET_IP> -oN scan.txt";

  const updatePreview = () => {
    const tempVars: TacticalVariables = {
      TARGET: inputs.TARGET?.value.trim() || "",
      PORT: inputs.PORT?.value.trim() || "",
      LHOST: inputs.LHOST?.value.trim() || "",
      LPORT: inputs.LPORT?.value.trim() || "",
      WORDLIST: inputs.WORDLIST?.value.trim() || "",
      USER: inputs.USER?.value.trim() || "",
      custom: current.custom,
    };

    const res = injectVariables(sampleTemplate, tempVars);
    previewCode.replaceChildren();

    if (res.replaced.length === 0) {
      previewCode.textContent = sampleTemplate;
    } else {
      // Build highlighted DOM
      let remaining = sampleTemplate;
      const parts: Array<{ text: string; isVar: boolean }> = [];

      for (const rep of res.replaced) {
        const idx = remaining.indexOf(rep.placeholder);
        if (idx !== -1) {
          if (idx > 0) {
            parts.push({ text: remaining.slice(0, idx), isVar: false });
          }
          parts.push({ text: rep.value, isVar: true });
          remaining = remaining.slice(idx + rep.placeholder.length);
        }
      }
      if (remaining.length > 0) {
        parts.push({ text: remaining, isVar: false });
      }

      parts.forEach((p) => {
        if (p.isVar) {
          const span = document.createElement("span");
          span.className = "var-pill-highlight";
          span.textContent = p.text;
          previewCode.append(span);
        } else {
          previewCode.append(document.createTextNode(p.text));
        }
      });
    }
  };

  Object.values(inputs).forEach((input) => {
    input.addEventListener("input", updatePreview);
  });

  updatePreview();
  body.append(grid, previewPanel);

  // Footer
  const footer = document.createElement("div");
  footer.className = "tactical-modal-footer";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "tactical-btn tactical-btn-danger";
  clearBtn.textContent = "CLEAR SESSION";

  const actionsRight = document.createElement("div");
  actionsRight.style.display = "flex";
  actionsRight.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "tactical-btn tactical-btn-secondary";
  cancelBtn.textContent = "CANCEL";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "tactical-btn tactical-btn-primary";
  saveBtn.textContent = "SAVE CONFIG (ENTER)";

  actionsRight.append(cancelBtn, saveBtn);
  footer.append(clearBtn, actionsRight);

  modal.append(header, body, footer);
  overlay.append(modal);
  document.body.append(overlay);

  // Focus the first input
  inputs.TARGET?.focus();
  inputs.TARGET?.select();

  const close = () => {
    overlay.remove();
  };

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  clearBtn.addEventListener("click", () => {
    clearTacticalVariables();
    Object.values(inputs).forEach((input) => {
      input.value = "";
    });
    updatePreview();
    playLaserChirp();
  });

  const save = () => {
    saveTacticalVariables({
      TARGET: inputs.TARGET?.value.trim() || "",
      PORT: inputs.PORT?.value.trim() || "",
      LHOST: inputs.LHOST?.value.trim() || "",
      LPORT: inputs.LPORT?.value.trim() || "",
      WORDLIST: inputs.WORDLIST?.value.trim() || "",
      USER: inputs.USER?.value.trim() || "",
    });
    playLaserChirp();
    close();
  };

  saveBtn.addEventListener("click", save);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      save();
    }
  });
}

export function promptMissingVariable(
  missingItem: ExtractedVariable,
  command: string,
): Promise<{ value: string; raw: boolean } | null> {
  return new Promise((resolve) => {
    playTacticalBlip();

    const overlay = document.createElement("div");
    overlay.className = "tactical-mini-popover-overlay";

    const popover = document.createElement("div");
    popover.className = "tactical-mini-popover";

    const title = document.createElement("div");
    title.className = "tactical-mini-title";
    title.textContent = `🎯 INJECT TARGET VARIABLE: ${missingItem.rawPlaceholder}`;

    const hint = document.createElement("div");
    hint.className = "tactical-mini-command-hint";
    hint.textContent = command;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tactical-input";
    input.placeholder = `Enter value for ${missingItem.canonicalKey}…`;

    const actions = document.createElement("div");
    actions.className = "tactical-mini-actions";

    const rawBtn = document.createElement("button");
    rawBtn.type = "button";
    rawBtn.className = "tactical-btn tactical-btn-secondary";
    rawBtn.textContent = "COPY RAW";
    rawBtn.title = "Copy command with raw placeholder unchanged";

    const injectBtn = document.createElement("button");
    injectBtn.type = "button";
    injectBtn.className = "tactical-btn tactical-btn-primary";
    injectBtn.textContent = "INJECT & COPY";

    actions.append(rawBtn, injectBtn);
    popover.append(title, hint, input, actions);
    overlay.append(popover);
    document.body.append(overlay);

    input.focus();

    const close = (res: { value: string; raw: boolean } | null) => {
      overlay.remove();
      resolve(res);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        close(null);
      }
    });

    rawBtn.addEventListener("click", () => {
      close({ value: "", raw: true });
    });

    const submit = () => {
      const val = input.value.trim();
      if (!val) {
        close({ value: "", raw: true });
        return;
      }
      setTacticalVariable(missingItem.canonicalKey, val);
      close({ value: val, raw: false });
    };

    injectBtn.addEventListener("click", submit);

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        submit();
      }
    });
  });
}
