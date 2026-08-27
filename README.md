# UE5-RunTests Action

A GitHub Action for running Unreal Engine 5 tests on self-hosted runners with specific parameters.

## Features

- Runs tests on self-hosted runners with UE5 installation
- Supports nested test structures with main tests and subtests
- Generates comprehensive test result reports
- Provides test execution summary
- Streams Unreal output without a fixed in-memory buffer
- Evaluates the exported JSON report and Unreal automation exit marker

## Usage

```yaml
- name: Run UE5 Tests
  uses: Fork-on-the-Table-Collective/UE5-RunTests-Action@v2
  with:
    EnginePath: 'C:\Program Files\Epic Games\UE_5.x'
    uprojectFile: 'C:\path\to\your\project.uproject'
    TestList: |
      TestClass1,TestMethod1
      TestClass1,TestMethod2
      TestClass2,TestMethod1
```

## Inputs

### `EnginePath` (required)
- **Description**: Path to the UE5 installation directory
- **Example**: `C:\Program Files\Epic Games\UE_5.4`

### `uprojectFile` (required)
- **Description**: Path to the Unreal Engine project file
- **Example**: `C:\Projects\MyProject\MyProject.uproject`

### `TestList` (required)
- **Description**: Newline-separated list of tests in CSV format
- **Format**: `TestClass,TestMethod` (supports nested tests with additional comma-separated values)
- **Example**:
  ```
  TestSuite.FirstTest,SubTest1
  TestSuite.FirstTest,SubTest2
  TestSuite.SecondTest
  ```

## Outputs

### `summary`
- **Description**: JSON summary of all test results including passed, failed, and warning counts

## How It Works

1. Parses the test list into a hierarchical structure
2. Executes each test using `UnrealEditor-Cmd.exe` in batch mode
3. Writes each run to a fresh directory under `test_results/`
4. Collects results from `-ReportExportPath` and the Unreal log
5. Requires a valid report and `TEST COMPLETE. EXIT CODE: 0`
6. Aggregates results and provides a comprehensive summary
7. Fails the action if tests fail, remain incomplete, do not run, or reports are invalid

The JSON report and Unreal automation exit marker are authoritative. If both indicate success but
the editor process returns a non-zero status during shutdown, the action emits a warning instead of
reporting successful tests as failed.

## Test Results

The action generates test result reports that include:
- Number of successful tests
- Tests succeeded with warnings
- Number of failed tests
- Tests not run
- Tests in process
- Detailed error information for failed tests
- Unreal automation and editor process exit information

## Requirements

- Self-hosted GitHub Actions runner
- Unreal Engine 5 installed on the runner
- Unreal project with automated tests configured

## License

ISC
