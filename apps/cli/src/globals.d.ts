declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
};
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
