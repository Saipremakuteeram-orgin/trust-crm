const OPERATIONS_FEATURES = Object.freeze({
  trusts: "ENABLE_OPERATIONS_TRUSTS",
  donationsAutomation: "ENABLE_OPERATIONS_DONATIONS_AUTOMATION",
  approvals: "ENABLE_OPERATIONS_APPROVALS",
  funds: "ENABLE_OPERATIONS_FUNDS",
  invoices: "ENABLE_OPERATIONS_INVOICES",
  payroll: "ENABLE_OPERATIONS_PAYROLL",
  automationMonitor: "ENABLE_OPERATIONS_AUTOMATION_MONITOR",
});

const CLIENT_FLAG_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(OPERATIONS_FEATURES).map(([name, envName]) => [name, `VITE_${envName}`]),
));

const FEATURE_NAMES = new Set(Object.keys(OPERATIONS_FEATURES));

function resolveFeatureName(name) {
  if (FEATURE_NAMES.has(name)) return name;
  for (const [logicalName, envName] of Object.entries(OPERATIONS_FEATURES)) {
    if (envName === name) return logicalName;
  }
  return null;
}

export function isOperationsEnabled(name, env = import.meta.env) {
  const logicalName = resolveFeatureName(name);
  if (!logicalName || !env) return false;

  // Only the seven explicitly named, non-secret flags are read by the client.
  return env[CLIENT_FLAG_NAMES[logicalName]] === "true"
    || env[OPERATIONS_FEATURES[logicalName]] === "true";
}

export function getOperationsFlags(env = import.meta.env) {
  return Object.fromEntries(
    Object.keys(OPERATIONS_FEATURES).map((name) => [name, isOperationsEnabled(name, env)]),
  );
}

export { OPERATIONS_FEATURES, CLIENT_FLAG_NAMES };
