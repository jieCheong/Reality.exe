import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Local parent report only; photos are limited to accepted step evidence. */
export function routineReportWriter(directory) {
  return async report => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, 'report.json.tmp');
    await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, join(directory, 'report.json'));
  };
}
