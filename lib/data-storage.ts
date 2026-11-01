import path from 'path';

/**
 * Root directory for mutable application data. Set DATA_DIR to a mounted,
 * persistent directory in production. When unset, data stays in the project
 * directory to preserve the existing local development layout.
 */
export function dataPath(...segments: string[]): string {
  return path.join(process.env.DATA_DIR || process.cwd(), ...segments);
}
