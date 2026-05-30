import { spawn } from 'child_process';

const SCRIPTS = [
  { name: 'Ticketmaster', command: 'sync:ticketmaster' },
  { name: 'Eventbrite', command: 'sync:eventbrite' },
  { name: 'SeatGeek', command: 'sync:seatgeek' },
  { name: 'NYC Parks', command: 'sync:nyc-parks' },
  { name: 'Dice Scraper', command: 'scrape:dice' },
  { name: 'Songkick Scraper', command: 'scrape:songkick' },
  { name: 'Bandsintown Enrichment', command: 'enrich:bandsintown' },
  { name: 'Event Cleanup', command: 'cleanup:events' },
];

async function runCommand(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    // npm commands need shell: true on Windows/mac
    const child = spawn(cmd, args, { 
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('=====================================');
  console.log(' Starting Full Ingestion Pipeline    ');
  console.log('=====================================');

  const startAll = Date.now();
  const summary: Array<{ name: string; status: 'SUCCESS' | 'FAILED'; code: number }> = [];

  for (let i = 0; i < SCRIPTS.length; i++) {
    const script = SCRIPTS[i];
    console.log(`\n[${i + 1}/${SCRIPTS.length}] Running ${script.name} Ingestion...`);
    
    try {
      const code = await runCommand('npm', ['run', script.command]);
      if (code === 0) {
        console.log(`[${script.name}] Completed successfully.`);
        summary.push({ name: script.name, status: 'SUCCESS', code });
      } else {
        console.error(`[${script.name}] Failed with exit code ${code}.`);
        summary.push({ name: script.name, status: 'FAILED', code });
      }
    } catch (err) {
      console.error(`[${script.name}] Encountered fatal error:`, err);
      summary.push({ name: script.name, status: 'FAILED', code: -1 });
    }
  }

  const durationSeconds = ((Date.now() - startAll) / 1000).toFixed(1);
  console.log('\n=====================================');
  console.log(` Ingestion Pipeline Finished in ${durationSeconds}s`);
  console.log('=====================================');
  console.table(summary);

  const hasFailures = summary.some(s => s.status === 'FAILED');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error('[SyncAll] Fatal error:', err);
  process.exit(1);
});
