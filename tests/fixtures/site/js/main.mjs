// A real module entry. Its imports can be followed statically, which is what
// makes bundling safe here and unsafe for a classic script (ADR-003).
import { formatBytes } from './lib.mjs';

const output = document.querySelector('#size');
if (output) output.textContent = formatBytes(2048);
