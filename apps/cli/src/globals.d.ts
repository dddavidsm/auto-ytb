declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
};
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
}
