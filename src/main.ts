import * as core from "@actions/core";
import * as fs from "fs";
import * as readline from "readline";
import { execSync } from "child_process";

interface TestResult {
  succeeded: number;
  succeededWithWarnings: number;
  failed: number;
  notRun: number;
  inProcess: number;
  errors?: string;
}

interface AllTestsStructure {
  [mainTest: string]: {
    [subTest: string]: string[];
  };
}

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
  [key: string]: TestResult | {
    succeeded: number;
    succeededWithWarnings: number;
    failed: number;
    notRun: number;
    inProcess: number;
    errors: string[];
    failedTestset: string[];
  };
}

const readAndParseString = (testlistString: string): string[][] => {
  const lines: string[][] = [];
  for (const line of testlistString.split("\n")) {
    const values = line.split(",");
    lines.push(values);
  }
  return lines;
};

function getAllTests(TestList: string): AllTestsStructure {
  const AllTests: AllTestsStructure = {};

  readAndParseString(TestList).forEach((subTestList: string[]) => {
    const mainTest = subTestList[0];
    const subTest = subTestList.slice(0, 2).join(".");
    const elementaryTest = subTestList.join(".");

    if (!(mainTest in AllTests)) {
      AllTests[mainTest] = {};
    }
    subTest in AllTests[mainTest]
      ? AllTests[mainTest][subTest].push(elementaryTest)
      : (AllTests[mainTest][subTest] = [elementaryTest]);
  });

  return AllTests;
}

const command = (
  EnginePath: string,
  uprojectFile: string,
  test: string,
  currentPath: string
): string => {
  return `"${EnginePath}\\Engine\\Binaries\\Win64\\UnrealEditor.exe" "${uprojectFile}" -ExecCmds="Automation RunTest ${test};quit" -TestExit="Automation Test Queue Empty" -log -nosplash -Unattended -nopause -NullRHI -ReportOutputPath="${currentPath}\\test_results"`;
};

const cleanString = (input: string): string => {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  return output;
};

const loadJSON = (jsonFilePath: string): any => {
  try {
    const data = fs.readFileSync(jsonFilePath, "utf8");
    const obj = JSON.parse(cleanString(data));
    return obj;
  } catch (error) {
    console.error("Error loading or parsing JSON:", error);
    throw error;
  }
};

const runTest = (
  EnginePath: string,
  uprojectFile: string,
  currentPath: string,
  test: string,
  Subtests: string[] | Record<string, any> | string,
  result: ResultObject
): void => {
  console.log(`Running test: ${test}`);
  const logfile = currentPath + "\\test_results\\index.json";
  try {
    const cmd = command(EnginePath, uprojectFile, test, currentPath);
    execSync(cmd);
    const obj = loadJSON(logfile);

    (result as any)[test] = {
      succeeded: obj.succeeded,
      succeededWithWarnings: obj.succeededWithWarnings,
      failed: obj.failed,
      notRun: obj.notRun,
      inProcess: obj.inProcess,
      errors: JSON.stringify(
        obj.tests.filter((test: any) => test.state !== "Success"),
        null,
        2
      ),
    };

    result.summary.succeeded += (result as any)[test].succeeded;
    result.summary.succeededWithWarnings += (result as any)[test].succeededWithWarnings;
    result.summary.failed += (result as any)[test].failed;
    result.summary.notRun += (result as any)[test].notRun;
    result.summary.inProcess += (result as any)[test].inProcess;
  } catch (error) {
    (result as any)[test] = {
      errors: `Error executing Test: ${test}. Message: ${(error as Error).message}`,
    };
    console.log(
      `Error executing Test: ${test}. Message: ${(error as Error).message}`
    );

    if (Subtests === "") {
      result.summary.failedTestset.push(test);
    } else {
      const SubTestList = Array.isArray(Subtests)
        ? Subtests
        : Object.keys(Subtests as Record<string, any>);
      SubTestList.forEach((SubTest: string) => {
        runTest(
          EnginePath,
          uprojectFile,
          currentPath,
          SubTest,
          Array.isArray(Subtests) ? "" : (Subtests as Record<string, any>)[SubTest],
          result
        );
      });
    }
  }
};

const main = (): void => {
  const EnginePath = core.getInput("EnginePath");
  const uprojectFile = core.getInput("uprojectFile");
  const TestList = core.getInput("TestList");
  const currentPath = process.cwd();
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
    const AllTests = getAllTests(TestList);
    const MainTests = Object.keys(AllTests);
    MainTests.forEach((MainTest: string) => {
      const Subtests = AllTests[MainTest];
      runTest(
        EnginePath,
        uprojectFile,
        currentPath,
        MainTest,
        Subtests,
        result
      );
    });
    if (
      result.summary.failed > 0 ||
      result.summary.failedTestset.length > 0
    ) {
      core.setFailed(
        `Some tests failed. ${JSON.stringify(result, null, 2)}`
      );
    } else if (result.summary.failedTestset.length > 0) {
      core.setFailed(
        `Some tests run into error. ${JSON.stringify(result, null, 2)}`
      );
    } else {
      console.log(JSON.stringify(result.summary, null, 2));
      core.setOutput("summary", JSON.stringify(result.summary, null, 2));
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
  console.log("Job finished");
};

main();
