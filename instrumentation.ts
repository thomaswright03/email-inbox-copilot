// Runs once when a server instance starts. A production deployment that is
// missing settings it can't work without is reported loudly here, before
// any user runs into it (e.g. every user stuck on the consent screen
// because agreements can't be stored).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { productionConfigProblems } = await import("./lib/config-check");
  const problems = productionConfigProblems();
  if (problems.length === 0) return;
  const { raiseAlert } = await import("./lib/log");
  await raiseAlert("config_invalid", `Production configuration problems: ${problems.join("; ")}`);
}
