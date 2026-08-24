import type { CommandEntry, CommandFile } from "./models/command-file";

export const demoCommandFile: CommandFile = {
  version: 2,
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
          command: "nmap -sn 192.168.1.0/24",
          description: "Discover active hosts without performing a port scan.",
          example: "nmap -sn 192.168.1.0/24",
          notes: "Useful for a quick inventory of reachable hosts on a trusted network.",
        },
        {
          id: "arp-discovery",
          name: "ARP Discovery",
          command: "nmap -PR -sn 10.20.0.0/16 --send-eth",
          description: "Use ARP requests to discover hosts on the local Ethernet segment.",
          example: "nmap -PR -sn 10.20.0.0/16 --send-eth",
          notes: "ARP discovery only applies to the local broadcast domain.",
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
          command: "nmap -sS -p 22,80,443 192.168.1.10",
          description: "Perform a TCP SYN scan against selected ports on a target.",
          example: "nmap -sS -p 22,80,443 192.168.1.10",
          notes: "Review scan scope and authorization before use.",
        },
        {
          id: "long-command",
          name: "Long Custom Port Profile",
          command: "nmap --reason --open --packet-trace --max-retries 2 --host-timeout 15m --script-timeout 2m -sV -O -p 1-1024 192.168.1.10 --script banner,http-title,ssl-cert,ssh-hostkey,smb-os-discovery,dns-service-discovery",
          description: "A deliberately long command used to verify internal horizontal scrolling.",
          example: "nmap --reason --open -sV -O -p 1-1024 192.168.1.10 --script banner,http-title,ssl-cert",
          notes: "This prototype entry is intentionally verbose for layout testing.",
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
          command: "nmap -sV 192.168.1.10",
          description: "Probe open ports to identify services and their versions.",
          example: "nmap -sV 192.168.1.10",
          notes: "Increase version intensity only when deeper probing is appropriate.",
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
          command: "nmap -sC scanme.nmap.org",
          description: "Run Nmap's default set of discovery and safe enumeration scripts.",
          example: "nmap -sC scanme.nmap.org",
        },
      ],
    },
  ],
};

export function buildStressFile(rowCount = 100): CommandFile {
  const longToken = "x".repeat(240);
  const longDescription = Array.from(
    { length: 30 },
    (_, index) => `Stress paragraph ${index + 1}: ${longToken}`,
  ).join(" ");
  const rowsPerSection = 100;
  const sectionCount = Math.max(1, Math.ceil(rowCount / rowsPerSection));

  return {
    version: 2,
    title: "Frontend Stress Test",
    description: `${rowCount.toLocaleString()} rows, long content, and mixed Standard/Table sections.`,
    sections: Array.from({ length: sectionCount }, (_, sectionIndex) => {
      const start = sectionIndex * rowsPerSection;
      const count = Math.min(rowsPerSection, rowCount - start);
      return {
        id: `stress-section-${sectionIndex + 1}`,
        title: `Stress Section ${String(sectionIndex + 1).padStart(3, "0")}`,
        ...(sectionIndex % 2 === 1 ? { layout: "table" as const } : {}),
        commands: Array.from({ length: count }, (_, commandIndex) =>
          buildStressCommand(start + commandIndex + 1, longToken, longDescription),
        ),
      };
    }),
  };
}

function buildStressCommand(
  ordinal: number,
  longToken: string,
  longDescription: string,
): CommandEntry {
  return {
    id: `stress-command-${ordinal}`,
    name: `Stress Command ${String(ordinal).padStart(4, "0")}`,
    command: `stress-tool --unbroken ${longToken} --target 192.168.1.10 --port 443 --interface eth0`,
    description: longDescription,
    ...(ordinal % 10 === 0
      ? {
          example: Array.from(
            { length: 8 },
            (_, index) => `stress-tool --step ${index + 1} --target 192.168.1.10`,
          ).join("\n"),
        }
      : ordinal % 3 === 0
        ? {}
        : { example: "stress-tool --target 192.168.1.10 --port 443" }),
    notes: longDescription,
  };
}
