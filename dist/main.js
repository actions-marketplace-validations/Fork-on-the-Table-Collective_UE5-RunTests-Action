"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const readAndParseString = (testlistString) => {
    const lines = [];
    for (const line of testlistString.split("\n")) {
        const values = line.split(",");
        lines.push(values);
    }
    return lines;
};
function getAllTests(TestList) {
    const AllTests = {};
    readAndParseString(TestList).forEach((subTestList) => {
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
const command = (EnginePath, uprojectFile, test, currentPath) => {
    return `"${EnginePath}\\Engine\\Binaries\\Win64\\UnrealEditor.exe" "${uprojectFile}" -ExecCmds="Automation RunTest ${test};quit" -TestExit="Automation Test Queue Empty" -log -nosplash -Unattended -nopause -NullRHI -ReportOutputPath="${currentPath}\\test_results"`;
};
const cleanString = (input) => {
    let output = "";
    for (let i = 0; i < input.length; i++) {
        if (input.charCodeAt(i) <= 127) {
            output += input.charAt(i);
        }
    }
    return output;
};
const loadJSON = (jsonFilePath) => {
    try {
        const data = fs.readFileSync(jsonFilePath, "utf8");
        const obj = JSON.parse(cleanString(data));
        return obj;
    }
    catch (error) {
        console.error("Error loading or parsing JSON:", error);
        throw error;
    }
};
const runTest = (EnginePath, uprojectFile, currentPath, test, Subtests, result) => {
    console.log(`Running test: ${test}`);
    const logfile = currentPath + "\\test_results\\index.json";
    try {
        const cmd = command(EnginePath, uprojectFile, test, currentPath);
        (0, child_process_1.execSync)(cmd);
        const obj = loadJSON(logfile);
        result[test] = {
            succeeded: obj.succeeded,
            succeededWithWarnings: obj.succeededWithWarnings,
            failed: obj.failed,
            notRun: obj.notRun,
            inProcess: obj.inProcess,
            errors: JSON.stringify(obj.tests.filter((test) => test.state !== "Success"), null, 2),
        };
        result.summary.succeeded += result[test].succeeded;
        result.summary.succeededWithWarnings += result[test].succeededWithWarnings;
        result.summary.failed += result[test].failed;
        result.summary.notRun += result[test].notRun;
        result.summary.inProcess += result[test].inProcess;
    }
    catch (error) {
        result[test] = {
            errors: `Error executing Test: ${test}. Message: ${error.message}`,
        };
        console.log(`Error executing Test: ${test}. Message: ${error.message}`);
        if (Subtests === "") {
            result.summary.failedTestset.push(test);
        }
        else {
            const SubTestList = Array.isArray(Subtests)
                ? Subtests
                : Object.keys(Subtests);
            SubTestList.forEach((SubTest) => {
                runTest(EnginePath, uprojectFile, currentPath, SubTest, Array.isArray(Subtests) ? "" : Subtests[SubTest], result);
            });
        }
    }
};
const main = () => {
    const EnginePath = core.getInput("EnginePath");
    const uprojectFile = core.getInput("uprojectFile");
    const TestList = core.getInput("TestList");
    const currentPath = process.cwd();
    const result = {
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
        MainTests.forEach((MainTest) => {
            const Subtests = AllTests[MainTest];
            runTest(EnginePath, uprojectFile, currentPath, MainTest, Subtests, result);
        });
        if (result.summary.failed > 0 ||
            result.summary.failedTestset.length > 0) {
            core.setFailed(`Some tests failed. ${JSON.stringify(result, null, 2)}`);
        }
        else if (result.summary.failedTestset.length > 0) {
            core.setFailed(`Some tests run into error. ${JSON.stringify(result, null, 2)}`);
        }
        else {
            console.log(JSON.stringify(result.summary, null, 2));
            core.setOutput("summary", JSON.stringify(result.summary, null, 2));
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
    console.log("Job finished");
};
main();
