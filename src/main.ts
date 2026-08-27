import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { spawnSync, SpawnSyncReturns } from "child_process";

export interface AutomationReport {
  succeeded: number;
  succeededWithWarnings: number;
  failed: number;
  notRun: number;
  inProcess: number;
  tests: Array<{
    fullTestPath?: string;
    state?: string;
    entries?: unknown[];
  }>;
}

interface TestResult extends AutomationReport {
  automationExitCode: number | null;
  processExitCode: number | null;
  errors: string[];
  warning?: string;
}

interface AllTestsStructure {
  [mainTest: string]: {
    [subTest: string]: string[];
  };
}

export type Subtests = string[] | Record<string, string[]> | "";

interface ResultObject {
  summary: {
    succeeded: number;
    succeededWithWarnings: number;
    failed: number;
    notRun: number;
    inProcess: number;
    errors: string[];
    failedTestset: string[];
  };
  [key: string]: TestResult | ResultObject["summary"];
}

export interface RunEvaluation {
  succeeded: boolean;
  errors: string[];
  warning?: string;
}

const TEST_COMPLETE_PATTERN = /\*{4} TEST COMPLETE\. EXIT CODE: (-?\d+) \*{4}/g;

export const parseTestList = (testList: string): AllTestsStructure => {
  const allTests: AllTestsStructure = {};

  for (const rawLine of testList.split(/\r?\n/)) {
    const values = rawLine
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (values.length === 0) {
      continue;
    }

    const mainTest = values[0];
    const subTest = values.slice(0, 2).join(".");
    const elementaryTest = values.join(".");

    allTests[mainTest] ??= {};
    allTests[mainTest][subTest] ??= [];
    if (!allTests[mainTest][subTest].includes(elementaryTest)) {
      allTests[mainTest][subTest].push(elementaryTest);
    }
  }

  return allTests;
};

export const readAutomationExitCode = (logContents: string): number | null => {
  const matches = [...logContents.matchAll(TEST_COMPLETE_PATTERN)];
  if (matches.length === 0) {
    return null;
  }

  return Number.parseInt(matches[matches.length - 1][1], 10);
};

export const getChildTests = (test: string, subtests: Subtests): string[] => {
  const childTests = subtests === ""
    ? []
    : Array.isArray(subtests)
      ? subtests
      : Object.keys(subtests);

  return [...new Set(childTests)].filter((childTest) => childTest !== test);
};

export const evaluateRun = (
  report: AutomationReport | null,
  automationExitCode: number | null,
  processExitCode: number | null,
  launchError?: Error,
  reportError?: Error
): RunEvaluation => {
  const errors: string[] = [];

  if (launchError) {
    errors.push(`Unable to launch Unreal Editor: ${launchError.message}`);
  }

  if (!report) {
    errors.push(reportError
      ? `Unable to read automation report: ${reportError.message}`
      : "Unreal did not produce a valid automation JSON report.");
  } else {
    const total = report.succeeded
      + report.succeededWithWarnings
      + report.failed
      + report.notRun
      + report.inProcess;

    if (total === 0) {
      errors.push("The automation report contained no tests.");
    }
    if (report.failed > 0) {
      errors.push(`${report.failed} test(s) failed.`);
    }
    if (report.notRun > 0) {
      errors.push(`${report.notRun} test(s) were not run.`);
    }
    if (report.inProcess > 0) {
      errors.push(`${report.inProcess} test(s) were still in process.`);
    }
  }

  if (automationExitCode === null) {
    errors.push("The Unreal log did not contain a TEST COMPLETE exit marker.");
  } else if (automationExitCode !== 0) {
    errors.push(`Unreal automation completed with exit code ${automationExitCode}.`);
  }

  const succeeded = errors.length === 0;
  const warning = succeeded && processExitCode !== null && processExitCode !== 0
    ? `Unreal returned process exit code ${processExitCode} after its JSON report and automation exit marker indicated success.`
    : undefined;

  return { succeeded, errors, warning };
};

const loadReport = (reportPath: string): AutomationReport => {
  const data = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
  const report = JSON.parse(data) as Partial<AutomationReport>;
  const requiredCounts: Array<keyof AutomationReport> = [
    "succeeded",
    "succeededWithWarnings",
    "failed",
    "notRun",
    "inProcess",
  ];

  for (const property of requiredCounts) {
    if (typeof report[property] !== "number") {
      throw new Error(`Automation report property '${property}' is missing or invalid.`);
    }
  }
  if (!Array.isArray(report.tests)) {
    throw new Error("Automation report property 'tests' is missing or invalid.");
  }

  return report as AutomationReport;
};

const sanitizePathSegment = (value: string): string => {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "tests";
};

const createEditorArguments = (
  uprojectFile: string,
  test: string,
  reportDirectory: string,
  unrealLogPath: string
): string[] => [
  uprojectFile,
  `-ExecCmds=Automation RunTests ${test}; Quit`,
  "-TestExit=Automation Test Queue Empty",
  "-log",
  "-nosplash",
  "-Unattended",
  "-nopause",
  "-NullRHI",
  "-NoSound",
  "-stdout",
  "-FullStdOutLogOutput",
  `-ReportExportPath=${reportDirectory}`,
  `-AbsLog=${unrealLogPath}`,
];

const appendSummary = async (result: ResultObject): Promise<void> => {
  const summary = result.summary;
  await core.summary
    .addHeading("Unreal automation tests")
    .addTable([
      [
        { data: "Passed", header: true },
        { data: "Warnings", header: true },
        { data: "Failed", header: true },
        { data: "Not run", header: true },
        { data: "In process", header: true },
      ],
      [
        summary.succeeded.toString(),
        summary.succeededWithWarnings.toString(),
        summary.failed.toString(),
        summary.notRun.toString(),
        summary.inProcess.toString(),
      ],
    ])
    .write();
};

const addResultToSummary = (result: ResultObject, testResult: TestResult): void => {
  result.summary.succeeded += testResult.succeeded;
  result.summary.succeededWithWarnings += testResult.succeededWithWarnings;
  result.summary.failed += testResult.failed;
  result.summary.notRun += testResult.notRun;
  result.summary.inProcess += testResult.inProcess;
};

const runTest = (
  editorPath: string,
  uprojectFile: string,
  outputRoot: string,
  test: string,
  subtests: Subtests,
  result: ResultObject,
  runNumber: { value: number }
): void => {
  runNumber.value += 1;
  const runDirectory = path.join(
    outputRoot,
    `${runNumber.value.toString().padStart(3, "0")}-${sanitizePathSegment(test)}`
  );
  const reportDirectory = path.join(runDirectory, "report");
  const unrealLogPath = path.join(runDirectory, "Unreal.log");
  const reportPath = path.join(reportDirectory, "index.json");

  fs.rmSync(runDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  core.info(`Running test filter: ${test}`);
  core.info(`Diagnostics directory: ${runDirectory}`);

  const processResult: SpawnSyncReturns<Buffer> = spawnSync(
    editorPath,
    createEditorArguments(uprojectFile, test, reportDirectory, unrealLogPath),
    { stdio: "inherit", windowsHide: true }
  );

  let report: AutomationReport | null = null;
  let reportError: Error | undefined;
  try {
    report = loadReport(reportPath);
  } catch (error) {
    reportError = error as Error;
  }

  let automationExitCode: number | null = null;
  try {
    automationExitCode = readAutomationExitCode(fs.readFileSync(unrealLogPath, "utf8"));
  } catch {
    // The evaluation below reports the missing exit marker.
  }

  const evaluation = evaluateRun(
    report,
    automationExitCode,
    processResult.status,
    processResult.error,
    reportError
  );

  if (evaluation.warning) {
    core.warning(evaluation.warning);
  }

  if (evaluation.succeeded && report) {
    const testResult: TestResult = {
      ...report,
      automationExitCode,
      processExitCode: processResult.status,
      errors: [],
      warning: evaluation.warning,
    };
    result[test] = testResult;
    addResultToSummary(result, testResult);
    return;
  }

  const childTests = getChildTests(test, subtests);

  if (childTests.length > 0) {
    for (const childTest of childTests) {
      const childSubtests = Array.isArray(subtests)
        ? ""
        : subtests === ""
          ? ""
          : subtests[childTest];
      runTest(
        editorPath,
        uprojectFile,
        outputRoot,
        childTest,
        childSubtests,
        result,
        runNumber
      );
    }
    return;
  }

  const failedResult: TestResult = {
    succeeded: report?.succeeded ?? 0,
    succeededWithWarnings: report?.succeededWithWarnings ?? 0,
    failed: report?.failed ?? 0,
    notRun: report?.notRun ?? 0,
    inProcess: report?.inProcess ?? 0,
    tests: report?.tests ?? [],
    automationExitCode,
    processExitCode: processResult.status,
    errors: evaluation.errors,
  };
  result[test] = failedResult;
  addResultToSummary(result, failedResult);
  result.summary.failedTestset.push(test);
  result.summary.errors.push(...evaluation.errors.map((error) => `${test}: ${error}`));
};

export const main = async (): Promise<void> => {
  const enginePath = core.getInput("EnginePath", { required: true });
  const uprojectFile = core.getInput("uprojectFile", { required: true });
  const testList = core.getInput("TestList", { required: true });
  const editorPath = path.join(
    enginePath,
    "Engine",
    "Binaries",
    "Win64",
    "UnrealEditor-Cmd.exe"
  );
  const outputRoot = path.join(process.cwd(), "test_results");
  const allTests = parseTestList(testList);
  const mainTests = Object.keys(allTests);
  const result: ResultObject = {
    summary: {
      succeeded: 0,
      succeededWithWarnings: 0,
      failed: 0,
      notRun: 0,
      inProcess: 0,
      errors: [],
      failedTestset: [],
    },
  };

  try {
    if (!fs.existsSync(editorPath)) {
      throw new Error(`Unreal command-line editor was not found at '${editorPath}'.`);
    }
    if (!fs.existsSync(uprojectFile)) {
      throw new Error(`Unreal project file was not found at '${uprojectFile}'.`);
    }
    if (mainTests.length === 0) {
      throw new Error("TestList did not contain a test filter.");
    }

    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });

    const runNumber = { value: 0 };
    for (const mainTest of mainTests) {
      runTest(
        editorPath,
        uprojectFile,
        outputRoot,
        mainTest,
        allTests[mainTest],
        result,
        runNumber
      );
    }

    await appendSummary(result);
    if (result.summary.failedTestset.length > 0) {
      core.setFailed(`Some test filters failed. ${JSON.stringify(result, null, 2)}`);
      return;
    }

    core.setOutput("summary", JSON.stringify(result.summary, null, 2));
    core.info(JSON.stringify(result.summary, null, 2));
  } catch (error) {
    core.setFailed((error as Error).message);
  }
};

if (require.main === module) {
  void main();
}
