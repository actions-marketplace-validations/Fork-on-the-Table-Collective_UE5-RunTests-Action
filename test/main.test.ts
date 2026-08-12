import assert from "node:assert/strict";
import test from "node:test";
import {
  AutomationReport,
  evaluateRun,
  getChildTests,
  parseTestList,
  readAutomationExitCode,
} from "../src/main";

const successfulReport = (): AutomationReport => ({
  succeeded: 3,
  succeededWithWarnings: 0,
  failed: 0,
  notRun: 0,
  inProcess: 0,
  tests: [
    { fullTestPath: "Project.Functional.One", state: "Success" },
    { fullTestPath: "Project.Functional.Two", state: "Success" },
    { fullTestPath: "Project.Functional.Three", state: "Success" },
  ],
});

test("does not retry a failed filter as its own child", () => {
  assert.deepEqual(getChildTests("ViridianCo", ["ViridianCo"]), []);
  assert.deepEqual(
    getChildTests("Project", { Project: ["Project"], "Project.Functional Tests": [] }),
    ["Project.Functional Tests"]
  );
});

test("parses CRLF test hierarchies, ignores blanks, and deduplicates", () => {
  const parsed = parseTestList(
    "Project,Functional Tests,One\r\n\r\nProject,Functional Tests,One\r\nViridianCo\r\n"
  );

  assert.deepEqual(parsed, {
    Project: {
      "Project.Functional Tests": ["Project.Functional Tests.One"],
    },
    ViridianCo: {
      ViridianCo: ["ViridianCo"],
    },
  });
});

test("reads the last Unreal automation exit marker", () => {
  const log = [
    "**** TEST COMPLETE. EXIT CODE: -1 ****",
    "later run",
    "**** TEST COMPLETE. EXIT CODE: 0 ****",
  ].join("\n");

  assert.equal(readAutomationExitCode(log), 0);
  assert.equal(readAutomationExitCode("no marker"), null);
});

test("accepts a successful report and automation marker", () => {
  assert.deepEqual(evaluateRun(successfulReport(), 0, 0), {
    succeeded: true,
    errors: [],
    warning: undefined,
  });
});

test("warns instead of failing on a process-only exit mismatch", () => {
  const result = evaluateRun(successfulReport(), 0, 3);

  assert.equal(result.succeeded, true);
  assert.match(result.warning ?? "", /process exit code 3/);
});

test("rejects failed, not-run, and in-process tests", () => {
  const report = successfulReport();
  report.succeeded = 0;
  report.failed = 1;
  report.notRun = 1;
  report.inProcess = 1;

  const result = evaluateRun(report, 0, 0);

  assert.equal(result.succeeded, false);
  assert.deepEqual(result.errors, [
    "1 test(s) failed.",
    "1 test(s) were not run.",
    "1 test(s) were still in process.",
  ]);
});

test("rejects empty or missing reports", () => {
  const emptyReport = successfulReport();
  emptyReport.succeeded = 0;
  emptyReport.tests = [];

  assert.equal(evaluateRun(emptyReport, 0, 0).succeeded, false);
  assert.match(evaluateRun(emptyReport, 0, 0).errors[0], /contained no tests/);
  assert.equal(evaluateRun(null, 0, 0).succeeded, false);
  assert.match(evaluateRun(null, 0, 0).errors[0], /valid automation JSON report/);
  assert.match(
    evaluateRun(null, 0, 0, undefined, new Error("invalid JSON")).errors[0],
    /Unable to read automation report: invalid JSON/
  );
});

test("rejects missing and non-zero automation exit markers", () => {
  assert.equal(evaluateRun(successfulReport(), null, 0).succeeded, false);
  assert.match(evaluateRun(successfulReport(), null, 0).errors[0], /did not contain/);
  assert.equal(evaluateRun(successfulReport(), -1, 255).succeeded, false);
  assert.match(evaluateRun(successfulReport(), -1, 255).errors[0], /exit code -1/);
});

test("rejects editor launch errors", () => {
  const result = evaluateRun(null, null, null, new Error("ENOENT"));

  assert.equal(result.succeeded, false);
  assert.match(result.errors[0], /ENOENT/);
});
