export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmupCaches, startScheduledTasks } = await import('@/lib/scheduled-tasks');
    await warmupCaches();
    startScheduledTasks();
  }
}
