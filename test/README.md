# Order Execution Engine - Test Suite



## Test Structure

```
test/
├── setup.ts                           # Test configuration and setup
├── unit/                              # Unit tests for individual components
│   ├── order-execution-service.test.ts
│   ├── queue-service.test.ts
│   ├── websocket-manager.test.ts
│   └── mock-dex-router.test.ts
├── integration/                       # Integration tests for component interactions
│   ├── order-execution-flow.test.ts
│   ├── websocket-integration.test.ts
│   └── api-integration.test.ts
├── load/                              # Load and performance tests
│   └── load-test.test.ts
├── run-tests.ts                       # Test runner script
├── websocket-manual.test.js           # Manual WebSocket testing tool
└── README.md                          # This file
```

## Test Categories

### 1. Unit Tests (`test/unit/`)

**Order Execution Service Tests**
- Order creation and validation
- Status updates and tracking
- User order management
- Error handling

**Queue Service Tests**
- Order queuing and processing
- Queue statistics and monitoring
- Retry logic and failure handling
- Queue control operations

**WebSocket Manager Tests**
- Connection management
- Message broadcasting
- Ping/pong handling
- Error handling and cleanup

**Mock DEX Router Tests**
- Quote generation
- Swap execution simulation
- Slippage calculation
- Error scenarios

### 2. Integration Tests (`test/integration/`)

**Order Execution Flow Tests**
- Complete order lifecycle
- Multi-order processing
- Status tracking throughout execution
- Database persistence

**WebSocket Integration Tests**
- Real-time order updates
- Connection lifecycle management
- Concurrent connections
- Error handling

**API Integration Tests**
- REST endpoint functionality
- Request validation
- Response formatting
- Error handling

### 3. Load Tests (`test/load/`)

**High Volume Processing**
- Concurrent order processing
- Memory management
- Queue performance
- WebSocket scalability

## Running Tests

### Prerequisites

1. **Database Setup**: Ensure PostgreSQL and Redis are running
2. **Environment Variables**: Set up test environment variables
3. **Dependencies**: Install all required packages

```bash
# Install dependencies
bun install

# Set up test environment variables
cp env.example .env.test
# Edit .env.test with test database credentials
```

### Test Commands

```bash
# Run all tests
bun run test:all

# Run specific test categories
bun test test/unit/                    # Unit tests only
bun test test/integration/             # Integration tests only
bun test test/load/                    # Load tests only

# Run individual test files
bun test test/unit/order-execution-service.test.ts

# Run with coverage
bun run test:coverage

# Run in watch mode
bun run test:watch

# Manual WebSocket testing
bun run test:ws-manual
```

### Test Runner

The `test/run-tests.ts` script provides a comprehensive test runner that:
- Runs all test suites in the correct order
- Provides detailed progress reporting
- Shows test results and timing
- Exits with appropriate status codes

```bash
bun run test/run-tests.ts
```

## Test Configuration

### Environment Variables

Create a `.env.test` file with the following variables:

```env
# Test Database Configuration
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=order_engine_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=password

# Test Redis Configuration
TEST_REDIS_HOST=localhost
TEST_REDIS_PORT=6379
TEST_REDIS_PASSWORD=

# Test Server Configuration
TEST_URL=ws://localhost:3000
```

### Test Database Setup

The test suite automatically:
- Creates test database tables
- Clears test data between tests
- Manages test data isolation

## API Testing with Postman

### Postman Collection

A comprehensive Postman collection is available at:
`postman/Order-Execution-Engine-Complete.postman_collection.json`

### Collection Features

**Order Management**
- Create market, limit, and sniper orders
- Retrieve order status and details
- Get user orders and active orders

**Queue Management**
- Monitor queue statistics
- Track processing metrics

**WebSocket Testing**
- Real-time order status updates
- Connection testing
- Ping/pong functionality

**Validation Testing**
- Input validation tests
- Error handling scenarios
- Edge case testing

**Load Testing**
- High volume order creation
- Performance monitoring

### Using the Collection

1. **Import**: Import the collection into Postman
2. **Environment**: Set up environment variables
3. **Server**: Ensure the server is running
4. **Execute**: Run individual requests or the entire collection

### WebSocket Testing

For WebSocket testing, use the manual test tool:

```bash
# Test with specific order ID
bun run test:ws-manual <order-id>

# Test with default order ID
bun run test:ws-manual
```

## Test Coverage

The test suite covers:

### ✅ Core Functionality
- [x] Order creation and validation
- [x] Order execution flow
- [x] Status tracking and updates
- [x] Queue processing
- [x] WebSocket communication
- [x] Database operations

### ✅ Error Handling
- [x] Validation errors
- [x] Network errors
- [x] Database errors
- [x] WebSocket errors
- [x] Order execution failures

### ✅ Performance
- [x] High volume processing
- [x] Memory management
- [x] Queue performance
- [x] WebSocket scalability
- [x] Concurrent operations

### ✅ Integration
- [x] End-to-end order flow
- [x] Real-time updates
- [x] API endpoints
- [x] Database persistence
- [x] Queue integration

## Test Data Management

### Automatic Cleanup
- Test data is automatically cleared between tests
- Each test runs in isolation
- No test data persists between runs

### Test Data Generation
- Orders are created with realistic data
- User IDs are generated dynamically
- Token pairs use common cryptocurrencies

## Debugging Tests

### Verbose Output
```bash
# Run with detailed output
bun test --verbose

# Run specific test with debugging
bun test test/unit/order-execution-service.test.ts --verbose
```

### WebSocket Debugging
```bash
# Manual WebSocket testing with debugging
DEBUG=* bun run test:ws-manual
```

### Database Debugging
- Check test database for data persistence
- Monitor Redis for active orders
- Review logs for detailed execution flow

## Continuous Integration

### GitHub Actions
The test suite is designed to work with CI/CD pipelines:

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:6
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v2
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test:all
```

## Performance Benchmarks

### Expected Performance
- **Order Creation**: < 100ms per order
- **Queue Processing**: 100+ orders/second
- **WebSocket Updates**: < 50ms latency
- **Database Operations**: < 200ms per query

### Load Test Results
- **Concurrent Orders**: 50+ orders processed simultaneously
- **Memory Usage**: < 100MB increase under load
- **Queue Throughput**: 100+ orders/second
- **WebSocket Connections**: 20+ concurrent connections

## Troubleshooting

### Common Issues

**Database Connection Errors**
- Ensure PostgreSQL is running
- Check database credentials
- Verify database exists

**Redis Connection Errors**
- Ensure Redis is running
- Check Redis configuration
- Verify Redis connectivity

**WebSocket Connection Errors**
- Ensure server is running
- Check WebSocket URL
- Verify order ID exists

**Test Timeout Errors**
- Increase test timeout
- Check system resources
- Review test complexity

### Getting Help

1. Check test logs for detailed error messages
2. Verify environment configuration
3. Ensure all services are running
4. Review test data setup

## Contributing

When adding new tests:

1. **Follow naming conventions**: `component.test.ts`
2. **Use descriptive test names**: Clear what is being tested
3. **Add proper setup/teardown**: Clean test data
4. **Include error cases**: Test failure scenarios
5. **Document test purpose**: Add comments for complex tests

### Test Guidelines

- **Isolation**: Each test should be independent
- **Cleanup**: Always clean up test data
- **Realistic Data**: Use realistic test data
- **Error Testing**: Test both success and failure cases
- **Performance**: Consider test execution time
