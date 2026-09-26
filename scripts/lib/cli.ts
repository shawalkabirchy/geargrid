import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/** True when this module is the script node was started with (so a module can also be imported by tests). */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(resolve(entry)).href === moduleUrl;
}

/** Scripts print with stdout; console is kept for warnings and errors (spec 3.5). */
export function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

/** Reads and checks the variables a script needs; stops with a list of what is missing (spec 4.3). */
export function readEnv<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>> {
  const result = z.object(shape).safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    console.error(`Missing or invalid environment variables:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return result.data;
}

/** Runs a script's main function and turns a failure into exit code 1 with the message. */
export function runMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
