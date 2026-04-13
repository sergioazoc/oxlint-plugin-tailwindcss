/**
 * Persistent canonicalize service using worker_threads + SharedArrayBuffer.
 *
 * Calls `ds.canonicalizeCandidates(classes, { rem })` dynamically via a worker
 * thread. Same pattern as sort-service.ts — loads the DS once, then accepts
 * requests synchronously via Atomics.wait().
 *
 * This enables canonicalization of arbitrary user classes (e.g. `p-[2px]` → `p-0.5`)
 * which can't be precomputed because the input space is infinite.
 */

import { Worker } from 'node:worker_threads'

const BUFFER_SIZE = 4 * 1024 * 1024 // 4 MB
const HEADER_INTS = 4
const DATA_OFFSET = HEADER_INTS * 4 + 4 // 20 bytes
const INIT_TIMEOUT = 30_000
const REQUEST_TIMEOUT = 10_000

const WORKER_SCRIPT = `
const { workerData } = require('worker_threads');

async function main() {
  const { sharedBuffer, cssPath } = workerData;
  const control = new Int32Array(sharedBuffer, 0, ${HEADER_INTS});
  const lengthView = new DataView(sharedBuffer, ${HEADER_INTS * 4}, 4);
  const dataArea = new Uint8Array(sharedBuffer, ${DATA_OFFSET});

  let ds;
  try {
    const { __unstable__loadDesignSystem } = require(workerData.tailwindNodePath);
    const { readFileSync } = require('fs');
    const { dirname } = require('path');
    const css = readFileSync(cssPath, 'utf-8');
    ds = await __unstable__loadDesignSystem(css, { base: dirname(cssPath) });
  } catch {
    Atomics.store(control, 2, -1);
    Atomics.notify(control, 2);
    return;
  }

  // Signal ready
  Atomics.store(control, 2, 1);
  Atomics.notify(control, 2);

  // Request loop
  while (true) {
    Atomics.wait(control, 0, 0);

    const len = lengthView.getUint32(0);
    const requestStr = Buffer.from(dataArea.slice(0, len)).toString('utf-8');
    Atomics.store(control, 0, 0);

    let response;
    try {
      const { classes, rem } = JSON.parse(requestStr);
      const options = rem ? { rem } : undefined;
      const result = ds.canonicalizeCandidates(classes, options);
      response = Buffer.from(JSON.stringify(result), 'utf-8');
    } catch {
      response = Buffer.from('null', 'utf-8');
    }

    dataArea.set(response, 0);
    lengthView.setUint32(0, response.length);

    Atomics.store(control, 1, 1);
    Atomics.notify(control, 1);
  }
}
main();
`

let worker: Worker | null = null
let controlArray: Int32Array | null = null
let lengthView: DataView | null = null
let dataArea: Uint8Array | null = null
let initialized = false
let available = true
let currentCssPath: string | null = null

function ensureService(cssPath: string): boolean {
  if (initialized && currentCssPath === cssPath) return available

  if (initialized) {
    cleanup()
    initialized = false
    available = true
    controlArray = null
    lengthView = null
    dataArea = null
  }

  initialized = true
  currentCssPath = cssPath

  try {
    const tailwindNodePath = require.resolve('@tailwindcss/node')

    const sharedBuffer = new SharedArrayBuffer(BUFFER_SIZE)
    controlArray = new Int32Array(sharedBuffer, 0, HEADER_INTS)
    lengthView = new DataView(sharedBuffer, HEADER_INTS * 4, 4)
    dataArea = new Uint8Array(sharedBuffer, DATA_OFFSET)

    worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { sharedBuffer, cssPath, tailwindNodePath },
    })

    worker.unref()

    worker.on('error', () => {
      available = false
      worker = null
    })
    worker.on('exit', () => {
      worker = null
    })

    const result = Atomics.wait(controlArray, 2, 0, INIT_TIMEOUT)
    if (result === 'timed-out' || controlArray[2] === -1) {
      available = false
      cleanup()
      return false
    }

    process.on('exit', cleanup)
    return true
  } catch {
    available = false
    cleanup()
    return false
  }
}

function cleanup(): void {
  if (worker) {
    try {
      worker.terminate()
    } catch {}
    worker = null
  }
}

/**
 * Canonicalize classes using the Tailwind CSS design system via worker thread.
 * Returns the canonicalized class array, or null if the service is unavailable.
 */
export function canonicalizeClassesSync(
  cssPath: string,
  classes: string[],
  rem?: number,
): string[] | null {
  if (!ensureService(cssPath)) return null
  if (!controlArray || !dataArea || !lengthView) return null

  try {
    const request = Buffer.from(JSON.stringify({ classes, rem }), 'utf-8')
    if (request.length > BUFFER_SIZE - DATA_OFFSET) return null

    dataArea.set(request, 0)
    lengthView.setUint32(0, request.length)

    Atomics.store(controlArray, 0, 1)
    Atomics.notify(controlArray, 0)

    const result = Atomics.wait(controlArray, 1, 0, REQUEST_TIMEOUT)
    if (result === 'timed-out') {
      available = false
      cleanup()
      return null
    }

    const responseLen = lengthView.getUint32(0)
    const responseStr = Buffer.from(dataArea.slice(0, responseLen)).toString('utf-8')
    Atomics.store(controlArray, 1, 0)

    return JSON.parse(responseStr)
  } catch {
    available = false
    cleanup()
    return null
  }
}

/**
 * Reset the canonicalize service (for tests).
 */
export function resetCanonicalizeService(): void {
  cleanup()
  initialized = false
  available = true
  currentCssPath = null
  controlArray = null
  lengthView = null
  dataArea = null
}
