// Coalesce edits per profile, but acknowledge only the physical write of the newest edit.
// Older callers in the same batch are superseded by that edit, never written over it.
function createProgressWriter({ write, backup, afterFlush, beforeWrite = () => null, delay = 400, maxWait = 2000 }) {
  const pending = new Map();
  const acknowledgements = new Map();
  const backedUp = new Set();
  let timer = null;
  function flush() {
    clearTimeout(timer);
    timer = null;
    const results = new Map();
    for (const [name, json] of pending) {
      let result;
      try {
        result = beforeWrite(name, json);
        if (!result) {
          if (!backedUp.has(name)) {
            backedUp.add(name);
            backup(name);
          }
          result = write(name, json);
        }
      } catch { result = { ok: false, error: 'WRITE_FAILED' }; }
      results.set(name, result);
      for (const resolve of acknowledgements.get(name) ?? []) resolve(result);
      acknowledgements.delete(name);
    }
    pending.clear();
    afterFlush();
    return results;
  }
  // Edits that never pause still reach the disk: after maxWait the timer is no longer pushed back.
  let since = 0;
  function queue(name, json) {
    pending.set(name, json);
    if (!timer) since = Date.now();
    else if (Date.now() - since >= maxWait) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  function save(name, json) {
    return new Promise(resolve => {
      acknowledgements.set(name, [...(acknowledgements.get(name) ?? []), resolve]);
      queue(name, json);
    });
  }
  // Profile switching is rare and needs a physical receipt before the renderer can reload.
  function saveNow(name, json) {
    queue(name, json);
    return flush().get(name);
  }
  return { queue, save, saveNow, flush };
}

module.exports = { createProgressWriter };
