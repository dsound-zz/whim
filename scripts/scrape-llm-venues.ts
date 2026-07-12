import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { runLlmExtractionIngestion } = await import('../src/lib/llmExtraction/ingest');
  console.log('[LLM Extraction Runner] Starting:', new Date().toISOString());

  const result = await runLlmExtractionIngestion();

  console.log('[LLM Extraction Runner] Complete:', result);
}

main()
  .then(() => {
    console.log('[LLM Extraction Runner] Exiting successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[LLM Extraction Runner] Fatal error:', error);
    process.exit(1);
  });
