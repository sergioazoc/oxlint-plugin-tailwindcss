/**
 * Persistent sort service using named pipes (FIFOs) for synchronous IPC.
 *
 * The problem: `ds.getClassOrder()` is the only way to get the exact official
 * Tailwind CSS sort order (matching oxfmt/prettier-plugin-tailwindcss), but the
 * design system is async to load and the oxlint plugin API is sync.
 *
 * The solution: spawn a persistent child process that loads the DS once, then
 * accepts sort requests via FIFOs. File descriptors are opened ONCE and kept
 * open for the entire lint session, using newline-delimited JSON framing.
 *
 * Falls back gracefully on platforms without FIFO support (Windows).
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { openSync, readSync, writeSync, closeSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const SORT_WORKER_SCRIPT = `
const { openSync, readSync, writeSync, closeSync } = require('fs');
const { dirname } = require('path');

function readLine(fd) {
  let line = '';
  const buf = Buffer.alloc(1);
  while (true) {
    const n = readSync(fd, buf, 0, 1);
    if (n === 0) return null;
    if (buf[0] === 10) return line;
    line += String.fromCharCode(buf[0]);
  }
}

async function main() {
  const cssPath = process.env.TAILWIND_CSS_PATH;
  const reqPipe = process.env.REQ_PIPE;
  const resPipe = process.env.RES_PIPE;

  const { __unstable__loadDesignSystem } = require('@tailwindcss/node');
  const { readFileSync } = require('fs');
  const css = readFileSync(cssPath, 'utf-8');
  const ds = await __unstable__loadDesignSystem(css, { base: dirname(cssPath) });

  const reqFd = openSync(reqPipe, 'r');
  const resFd = openSync(resPipe, 'w');

  let req;
  while ((req = readLine(reqFd)) !== null) {
    if (!req) continue;
    try {
      const classes = JSON.parse(req);
      const ordered = ds.getClassOrder(classes);
      const sorted = [...ordered]
        .sort((a, b) => {
          if (a[1] === null && b[1] === null) return 0;
          if (a[1] === null) return -1;
          if (b[1] === null) return 1;
          return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
        })
        .map(([name]) => name);
      const out = Buffer.from(JSON.stringify(sorted) + '\\n', 'utf-8');
      writeSync(resFd, out, 0, out.length);
    } catch {
      const out = Buffer.from('null\\n', 'utf-8');
      writeSync(resFd, out, 0, out.length);
    }
  }

  closeSync(reqFd);
  closeSync(resFd);
}
main().catch(() => process.exit(1));
`

let child: ChildProcess | null = null
let reqPipe: string | null = null
let resPipe: string | null = null
let reqFd: number | null = null
let resFd: number | null = null
let initialized = false
let available = true
let readBuffer = ''

/** Read a newline-delimited line from an open file descriptor (blocking). */
function readLineSync(fd: number): string {
  while (true) {
    const nlIdx = readBuffer.indexOf('\n')
    if (nlIdx >= 0) {
      const line = readBuffer.slice(0, nlIdx)
      readBuffer = readBuffer.slice(nlIdx + 1)
      return line
    }
    const buf = Buffer.alloc(65536)
    const n = readSync(fd, buf, 0, buf.length, null)
    if (n === 0) {
      throw new Error('EOF')
    }
    readBuffer += buf.toString('utf-8', 0, n)
  }
}

function ensureService(cssPath: string): boolean {
  if (initialized) return available
  initialized = true

  try {
    const id = `${process.pid}-${Date.now()}`
    reqPipe = join(tmpdir(), `oxlint-tw-req-${id}`)
    resPipe = join(tmpdir(), `oxlint-tw-res-${id}`)

    execFileSync('mkfifo', [reqPipe])
    execFileSync('mkfifo', [resPipe])

    child = spawn(process.execPath, ['-e', SORT_WORKER_SCRIPT], {
      env: {
        ...process.env,
        TAILWIND_CSS_PATH: cssPath,
        REQ_PIPE: reqPipe,
        RES_PIPE: resPipe,
      },
      cwd: dirname(cssPath),
      stdio: 'ignore',
      detached: false,
    })

    child.unref()
    child.on('error', () => {
      child = null
      available = false
    })
    child.on('exit', () => {
      child = null
    })

    // Open FIFOs once — blocks until child opens the other end (after DS loads)
    reqFd = openSync(reqPipe, 'w')
    resFd = openSync(resPipe, 'r')

    process.on('exit', cleanup)

    return true
  } catch {
    available = false
    cleanup()
    return false
  }
}

function cleanup(): void {
  if (reqFd !== null) {
    try {
      closeSync(reqFd)
    } catch {}
    reqFd = null
  }
  if (resFd !== null) {
    try {
      closeSync(resFd)
    } catch {}
    resFd = null
  }
  if (child) {
    try {
      child.kill()
    } catch {}
    child = null
  }
  if (reqPipe) {
    try {
      unlinkSync(reqPipe)
    } catch {}
    reqPipe = null
  }
  if (resPipe) {
    try {
      unlinkSync(resPipe)
    } catch {}
    resPipe = null
  }
}

/**
 * Sort classes using the official Tailwind CSS sort order via persistent child process.
 * Returns the sorted class array, or null if the service is unavailable.
 */
export function sortClassesSync(cssPath: string, classes: string[]): string[] | null {
  if (!ensureService(cssPath)) return null
  if (reqFd === null || resFd === null) return null

  try {
    const payload = Buffer.from(JSON.stringify(classes) + '\n', 'utf-8')
    writeSync(reqFd, payload, 0, payload.length)
    const line = readLineSync(resFd)
    return JSON.parse(line)
  } catch {
    available = false
    cleanup()
    return null
  }
}

/**
 * Reset the sort service (for tests).
 */
export function resetSortService(): void {
  cleanup()
  initialized = false
  available = true
  readBuffer = ''
}
