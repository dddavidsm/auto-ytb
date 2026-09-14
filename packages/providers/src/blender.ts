import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

export type BlenderRenderResult = { passed: boolean; outputPath?: string; elapsedMs: number; stderr?: string; reason?: string };

function execute(command: string, args: string[]) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

export class BlenderProvider {
  readonly name = 'blender-local';
  readonly capabilities = ['GLB/FBX_IMPORT', 'RIG', 'ANIMATION', 'CAMERA', 'LIGHTING', 'MATERIALS', 'EEVEE_RENDER', 'DEPTH_PASS'];
  constructor(readonly executable = process.env.BLENDER_BIN || 'blender') {}

  async probe() {
    const started = Date.now();
    try {
      const result = await execute(this.executable, ['--version']);
      return { available: result.code === 0, executable: this.executable, elapsedMs: Date.now() - started, detail: result.stderr || undefined };
    } catch (error) {
      return { available: false, executable: this.executable, elapsedMs: Date.now() - started, detail: String(error instanceof Error ? error.message : error) };
    }
  }

  async render(input: { blendFile: string; outputPath: string; frame?: number; engine?: 'BLENDER_EEVEE_NEXT' | 'BLENDER_WORKBENCH' }): Promise<BlenderRenderResult> {
    const started = Date.now();
    if (!existsSync(input.blendFile)) return { passed: false, elapsedMs: Date.now() - started, reason: `blend file not found: ${input.blendFile}` };
    const args = ['-b', input.blendFile, '-E', input.engine ?? 'BLENDER_EEVEE_NEXT', '-o', input.outputPath];
    if (input.frame != null) args.push('-f', String(input.frame)); else args.push('-a');
    try {
      const result = await execute(this.executable, args);
      return result.code === 0 ? { passed: true, outputPath: input.outputPath, elapsedMs: Date.now() - started } : { passed: false, elapsedMs: Date.now() - started, stderr: result.stderr.slice(-4000), reason: 'Blender returned a non-zero exit code' };
    } catch (error) {
      return { passed: false, elapsedMs: Date.now() - started, reason: String(error instanceof Error ? error.message : error) };
    }
  }
}
