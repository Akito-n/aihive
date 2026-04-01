export interface Args {
  workers: number;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  let workers = parseInt(process.env.WORKER_COUNT || "4", 10);
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help" || arg === "help") {
      help = true;
    } else if ((arg === "-w" || arg === "--workers") && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (n >= 1 && n <= 16) {
        workers = n;
      }
      i++;
    }
  }

  return { workers, help };
}
