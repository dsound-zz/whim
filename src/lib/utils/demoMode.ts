export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}
