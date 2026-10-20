// A successful IPC acknowledgement must mean the replacement reached the destination.
// Keep the previous file intact if either writing the temporary file or renaming it fails.
const fs = require('node:fs');

function atomicWrite(target, text, io = fs) {
  try {
    io.writeFileSync(`${target}.tmp`, text);
    io.renameSync(`${target}.tmp`, target);
    return { ok: true, error: null };
  } catch (err) {
    const code = typeof err?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(err.code) ? err.code : 'WRITE_FAILED';
    return { ok: false, error: code };
  }
}

module.exports = { atomicWrite };
