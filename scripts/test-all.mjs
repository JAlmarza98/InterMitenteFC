#!/usr/bin/env node
// Runs the whole test suite (backend unit+integration, frontend unit, E2E)
// against a throwaway Postgres, then writes a single reports/index.html
// linking out to each tool's own detailed report. Runs every layer even if
// an earlier one fails, so one bad suite doesn't hide the others — the
// final exit code reflects the overall result.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const keepDb = process.argv.includes("--keep-db");

// Angular 22's CLI (frontend unit tests, and the E2E dev-server it drives)
// refuses to run below Node 22.22.3. Fail fast with one clear message here
// instead of letting it die halfway through the frontend/E2E suites with a
// wall of Angular CLI output that looks like the tests themselves broke.
function checkNodeVersion() {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  const ok = major > 22 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)));
  if (ok) return;
  console.error(
    `\x1b[31mNode ${process.versions.node} is too old — the frontend (Angular 22) and E2E suites require Node >=22.22.3.\x1b[0m\n` +
      `This repo has an .nvmrc pinning the right version. Run:\n\n` +
      `    nvm use\n\n` +
      `then re-run \`npm test\`. (Backend-only: \`npm run test:backend\` works fine on any Node.)`
  );
  process.exit(1);
}
checkNodeVersion();

function run(cmd, args, cwd) {
  console.log(`\n\x1b[2m$ ${cmd} ${args.join(" ")}  (${path.relative(root, cwd) || "."})\x1b[0m`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  return res.status ?? 1;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function pct(n) {
  return typeof n === "number" ? `${n.toFixed(1)}%` : "—";
}

console.log("=== Starting test database ===");
run("docker", ["compose", "-f", path.join(root, "docker-compose.test.yml"), "up", "-d", "--wait"], root);

console.log("\n=== Applying migrations ===");
run("npm", ["run", "test:db:migrate"], path.join(root, "backend"));

console.log("\n=== Backend: unit + integration (Vitest) ===");
const backendCode = run("npm", ["run", "test:coverage"], path.join(root, "backend"));
const backendTests = readJson(path.join(root, "backend/test-results.json"));
const backendCoverage = readJson(path.join(root, "backend/coverage/coverage-summary.json"));

console.log("\n=== Frontend: unit + component (Karma/Jasmine) ===");
const frontendCode = run("npm", ["test"], path.join(root, "frontend"));
const frontendCoverage = readJson(path.join(root, "frontend/coverage/coverage-summary.json"));

console.log("\n=== E2E (Playwright) ===");
const e2eCode = run("npm", ["test"], path.join(root, "e2e"));
const e2eReport = readJson(path.join(root, "e2e/report.json"));

if (!keepDb) {
  console.log("\n=== Tearing down test database ===");
  run("docker", ["compose", "-f", path.join(root, "docker-compose.test.yml"), "down", "-v"], root);
} else {
  console.log("\n(--keep-db) leaving the test database up for debugging.");
}

const suites = [
  {
    name: "Backend (unit + integration)",
    ok: backendCode === 0,
    summary: backendTests
      ? `${backendTests.numPassedTests}/${backendTests.numTotalTests} tests passed`
      : "no test results found",
    coverage: backendCoverage ? pct(backendCoverage.total.lines.pct) : "—",
    reportPath: "backend/coverage/index.html",
  },
  {
    name: "Frontend (unit + component)",
    ok: frontendCode === 0,
    summary: frontendCode === 0 ? "all specs passed" : "one or more specs failed",
    coverage: frontendCoverage ? pct(frontendCoverage.total.lines.pct) : "—",
    reportPath: "frontend/coverage/index.html",
  },
  {
    name: "E2E (Playwright)",
    ok: e2eCode === 0,
    summary: (() => {
      const total = (e2eReport?.stats?.expected ?? 0) + (e2eReport?.stats?.unexpected ?? 0);
      if (!e2eReport?.stats) return "no report found";
      if (total === 0) return "no tests ran (setup likely failed — see output above)";
      return `${e2eReport.stats.expected}/${total} tests passed`;
    })(),
    coverage: "—",
    reportPath: "e2e/playwright-report/index.html",
  },
];

const overallOk = suites.every((s) => s.ok);

console.log("\n\n=== Summary ===");
for (const s of suites) {
  console.log(`${s.ok ? "✔" : "✘"} ${s.name}: ${s.summary} (coverage: ${s.coverage})`);
}
console.log(overallOk ? "\nAll suites passed." : "\nSome suites failed — see above.");

writeReport(suites, overallOk);

process.exit(overallOk ? 0 : 1);

function writeReport(suites, overallOk) {
  const reportsDir = path.join(root, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const rows = suites
    .map(
      (s) => `
      <tr>
        <td>${s.name}</td>
        <td class="${s.ok ? "ok" : "fail"}">${s.ok ? "PASS" : "FAIL"}</td>
        <td>${s.summary}</td>
        <td>${s.coverage}</td>
        <td><a href="../${s.reportPath}">detailed report</a></td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>inter_mitente — test report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 780px; margin: 2.5rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; }
  .ok { color: #1a7f37; font-weight: 600; }
  .fail { color: #cf222e; font-weight: 600; }
  .overall { font-size: 1.1rem; margin-top: 1.5rem; }
  time { color: #666; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>inter_mitente — test report</h1>
  <time>${new Date().toISOString()}</time>
  <table>
    <thead><tr><th>Suite</th><th>Result</th><th>Summary</th><th>Coverage</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="overall ${overallOk ? "ok" : "fail"}">${overallOk ? "All suites passed." : "Some suites failed."}</p>
</body>
</html>
`;

  fs.writeFileSync(path.join(reportsDir, "index.html"), html);
  console.log(`\nReport written to reports/index.html`);
}
