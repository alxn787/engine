#!/usr/bin/env bun

/**
 * Test Runner for Order Execution Engine
 * 
 * This script runs all tests in the correct order and provides
 * comprehensive test reporting.
 */

import { spawn } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  private log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  private async runTestSuite(suiteName: string, testPath: string): Promise<TestResult> {
    this.log(`\n${colors.blue}Running ${suiteName}...${colors.reset}`);
    const startTime = Date.now();

    try {
      if (!existsSync(testPath)) {
        throw new Error(`Test file not found: ${testPath}`);
      }

      const result = await spawn({
        cmd: ['bun', 'test', testPath],
        stdio: ['inherit', 'pipe', 'pipe']
      });

      const duration = Date.now() - startTime;
      const passed = result.exitCode === 0;

      if (passed) {
        this.log(`${colors.green}✓ ${suiteName} passed${colors.reset} (${duration}ms)`);
      } else {
        this.log(`${colors.red}✗ ${suiteName} failed${colors.reset} (${duration}ms)`);
      }

      return {
        name: suiteName,
        passed,
        duration,
        error: passed ? undefined : `Exit code: ${result.exitCode}`
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`${colors.red}✗ ${suiteName} failed${colors.reset} (${duration}ms)`);
      
      return {
        name: suiteName,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests() {
    this.startTime = Date.now();
    this.log(`${colors.bright}${colors.cyan}Starting Order Execution Engine Test Suite${colors.reset}`);
    this.log(`${colors.yellow}================================================${colors.reset}`);

    // Test suites in order of execution
    const testSuites = [
      {
        name: 'Unit Tests - Order Execution Service',
        path: 'test/unit/order-execution-service.test.ts'
      },
      {
        name: 'Unit Tests - Queue Service',
        path: 'test/unit/queue-service.test.ts'
      },
      {
        name: 'Unit Tests - WebSocket Manager',
        path: 'test/unit/websocket-manager.test.ts'
      },
      {
        name: 'Unit Tests - Mock DEX Router',
        path: 'test/unit/mock-dex-router.test.ts'
      },
      {
        name: 'Integration Tests - Order Execution Flow',
        path: 'test/integration/order-execution-flow.test.ts'
      },
      {
        name: 'Integration Tests - WebSocket Integration',
        path: 'test/integration/websocket-integration.test.ts'
      },
      {
        name: 'Integration Tests - API Integration',
        path: 'test/integration/api-integration.test.ts'
      },
      {
        name: 'Load Tests - High Volume Processing',
        path: 'test/load/load-test.test.ts'
      }
    ];

    // Run each test suite
    for (const suite of testSuites) {
      const result = await this.runTestSuite(suite.name, suite.path);
      this.results.push(result);
    }

    // Print summary
    this.printSummary();
  }

  private printSummary() {
    const totalTime = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    this.log(`\n${colors.yellow}================================================${colors.reset}`);
    this.log(`${colors.bright}Test Summary${colors.reset}`);
    this.log(`${colors.yellow}================================================${colors.reset}`);
    
    this.log(`Total Tests: ${total}`);
    this.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    this.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    this.log(`Total Time: ${totalTime}ms`);

    if (failed > 0) {
      this.log(`\n${colors.red}Failed Tests:${colors.reset}`);
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          this.log(`  ${colors.red}✗${colors.reset} ${result.name} (${result.duration}ms)`);
          if (result.error) {
            this.log(`    Error: ${result.error}`);
          }
        });
    }

    this.log(`\n${colors.yellow}================================================${colors.reset}`);
    
    if (failed === 0) {
      this.log(`${colors.green}${colors.bright}All tests passed! 🎉${colors.reset}`);
    } else {
      this.log(`${colors.red}${colors.bright}Some tests failed. Please check the output above.${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run the tests
const runner = new TestRunner();
runner.runAllTests().catch(error => {
  console.error(`${colors.red}Test runner failed:${colors.reset}`, error);
  process.exit(1);
});
