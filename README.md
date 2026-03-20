# UE5-RunTests Action

A GitHub Action for running Unreal Engine 5 tests on self-hosted runners with specific parameters.

## Features

- Runs tests on self-hosted runners with UE5 installation
- Supports nested test structures with main tests and subtests
- Generates comprehensive test result reports
- Provides test execution summary

## Usage

```yaml
- name: Run UE5 Tests
  uses: Fork-on-the-Table-Collective/UE5-RunTests@v1
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
2. Executes each test using the Unreal Editor in batch mode
3. Collects test results from the JSON output file
4. Aggregates results and provides a comprehensive summary
5. Fails the action if any tests failed or encountered errors

## Test Results

The action generates test result reports that include:
- Number of successful tests
- Tests succeeded with warnings
- Number of failed tests
- Tests not run
- Tests in process
- Detailed error information for failed tests

## Requirements

- Self-hosted GitHub Actions runner
- Unreal Engine 5 installed on the runner
- Unreal project with automated tests configured

## License

ISC
