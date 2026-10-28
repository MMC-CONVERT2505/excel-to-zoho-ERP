import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';

const dir = config.dataDir;
const file = path.join(dir, 'tokens.json');

export async function loadTokens() {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function clearTokens() {
  await fs.rm(file, { force: true });
}
