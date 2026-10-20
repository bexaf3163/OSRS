// Coalesce edits per profile, but acknowledge only the physical write of the newest edit.
// Older callers in the same batch are superseded by that edit, never written over it.
function createProgressWriter({ write, backup, afterFlush, delay = 400 }) {
  const pending = new Map();
  const acknowledgements = new Map();
  const backedUp = new Set();
  let timer = null;
  function flush() {
    clearTimeout(timer);
    timer = null;
    for (const [name, json] of pending) {
      if (!backedUp.has(name)) {
        backedUp.add(name);
        backup(name);
      }
      let result;
      try { result = write(name, json); }
      catch { result = { ok: false, error: 'WRITE_FAILED' }; }
      for (const resolve of acknowledgements.get(name) ?? []) resolve(result);
      acknowledgements.delete(name);
    }
    pending.clear();
    afterFlush();
  }
  function queue(name, json) {
    pending.set(name, json);
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  function save(name, json) {
    return new Promise(resolve => {
      acknowledgements.set(name, [...(acknowledgements.get(name) ?? []), resolve]);
      queue(name, json);
    });
  }
  return { queue, save, flush };
}

module.exports = { createProgressWriter };
