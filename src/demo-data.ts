import type { CommandEntry, CommandFile } from "./models/command-file";

export const demoCommandFile: CommandFile = {
  version: 1,
  title: "Nmap",
  description: "Network discovery, port scanning, and service enumeration commands.",
  sections: [
    {
      id: "host-discovery",
      title: "Host Discovery",
      commands: [
        {
          id: "ping-scan",
          name: "Ping Scan",
          command: "nmap -sn {{target}}",
          description: "Discover active hosts without performing a port scan.",
          syntax: "nmap -sn <target>",
          example: "nmap -sn 192.168.1.0/24",
          notes: "Useful for a quick inventory of reachable hosts on a trusted network.",
          action: "run",
          risk: "safe",
          variables: [{ name: "target", default: "192.168.1.0/24" }],
        },
        {
          id: "arp-discovery",
          name: "ARP Discovery",
          command: "nmap -PR -sn {{target}} --send-eth",
          description: "Use ARP requests to discover hosts on the local Ethernet segment.",
          syntax: "nmap -PR -sn <target> --send-eth",
          example: "nmap -PR -sn 10.20.0.0/16 --send-eth",
          notes: "ARP discovery only applies to the local broadcast domain.",
          action: "run",
          risk: "caution",
          variables: [{ name: "target", default: "10.20.0.0/16" }],
        },
      ],
    },
    {
      id: "port-scanning",
      title: "Port Scanning",
      layout: "table",
      commands: [
        {
          id: "syn-scan",
          name: "TCP SYN Scan",
          command: "nmap -sS -p {{ports}} {{target}}",
          description: "Perform a TCP SYN scan against selected ports on a target.",
          syntax: "nmap -sS -p <ports> <target>",
          example: "nmap -sS -p 22,80,443 192.168.1.10",
          notes: "Raw-packet scans normally require elevated privileges. Open this command in a terminal when sudo is needed.",
          action: "open-terminal",
          risk: "caution",
          variables: [
            { name: "ports", default: "22,80,443" },
            { name: "target", default: "192.168.1.10" },
          ],
        },
        {
          id: "long-command",
          name: "Long Custom Port Profile",
          command: "nmap --reason --open --packet-trace --max-retries 2 --host-timeout 15m --script-timeout 2m -sV -O -p {{ports}} {{target}} --script banner,http-title,ssl-cert,ssh-hostkey,smb-os-discovery,dns-service-discovery",
          description: "A deliberately long command used to verify that the shared command column scrolls internally without widening the application or changing the 42/58 grid ratio.",
          syntax: "nmap [scan options] -p <ports> <target> --script <scripts>",
          example: "nmap --reason --open -sV -O -p 1-1024 192.168.1.10 --script banner,http-title,ssl-cert",
          notes: "Review and tailor the scan scope before use. This prototype entry is intentionally verbose for layout testing.",
          action: "open-terminal",
          risk: "caution",
          variables: [
            { name: "ports", default: "1-1024" },
            { name: "target", default: "192.168.1.10" },
          ],
        },
      ],
    },
    {
      id: "service-detection",
      title: "Service Detection",
      commands: [
        {
          id: "service-versions",
          name: "Service and Version Detection",
          command: "nmap -sV {{target}}",
          description: "Probe open ports to identify services and their versions.",
          syntax: "nmap -sV <target>",
          example: "nmap -sV 192.168.1.10",
          notes: "Increase version intensity only when deeper probing is appropriate.",
          action: "run",
          risk: "safe",
          variables: [{ name: "target", default: "192.168.1.10" }],
        },
      ],
    },
    {
      id: "nse",
      title: "NSE",
      commands: [
        {
          id: "default-scripts",
          name: "Default NSE Scripts",
          command: "nmap -sC {{target}}",
          description: "Run Nmap's default set of discovery and safe enumeration scripts.",
          syntax: "nmap -sC <target>",
          example: "nmap -sC scanme.nmap.org",
          action: "run",
          risk: "caution",
          variables: [{ name: "target", default: "scanme.nmap.org" }],
        },
      ],
    },
  ],
};

export function buildStressFile(): CommandFile {
  const longToken = "x".repeat(240);
  const longDescription = Array.from(
    { length: 30 },
    (_, index) => `Stress paragraph ${index + 1}: ${longToken}`,
  ).join(" ");

  return {
    version: 1,
    title: "Frontend Stress Test",
    description: "20 sections, 100 rows, long unbroken content, and five variables per command.",
    sections: Array.from({ length: 20 }, (_, sectionIndex) => ({
      id: `stress-section-${sectionIndex + 1}`,
      title: `Stress Section ${String(sectionIndex + 1).padStart(2, "0")}`,
      ...(sectionIndex % 2 === 1 ? { layout: "table" as const } : {}),
      commands: Array.from({ length: 5 }, (_, commandIndex) =>
        buildStressCommand(sectionIndex, commandIndex, longToken, longDescription),
      ),
    })),
  };
}

function buildStressCommand(
  sectionIndex: number,
  commandIndex: number,
  longToken: string,
  longDescription: string,
): CommandEntry {
  const ordinal = sectionIndex * 5 + commandIndex + 1;

  return {
    id: `stress-command-${ordinal}`,
    name: `Stress Command ${String(ordinal).padStart(3, "0")}`,
    command: `stress-tool --unbroken ${longToken} --target {{target}} --port {{port}} --interface {{interface}} --host {{host}} --mode {{mode}}`,
    description: longDescription,
    syntax: "stress-tool [options] <target>",
    example: "stress-tool --target 192.168.1.10 --port 443",
    notes: longDescription,
    action: "copy",
    risk: "safe",
    variables: [
      { name: "target", default: "192.168.1.10" },
      { name: "port", default: "443" },
      { name: "interface", default: "eth0" },
      { name: "host", default: "example.internal" },
      { name: "mode", default: "safe" },
    ],
  };
}
