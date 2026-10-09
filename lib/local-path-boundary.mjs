import path from 'node:path';

// Keep filesystem containment independent of the host platform so drive and
// UNC boundaries can be checked explicitly with path.win32 in regression tests.
export function isPathWithin(root, candidate, {pathImpl = path, allowRoot = false} = {}) {
 const relative = pathImpl.relative(root, candidate);
 return (allowRoot || relative.length > 0) &&
  relative !== '..' && !relative.startsWith('..' + pathImpl.sep) &&
  !pathImpl.isAbsolute(relative);
}
