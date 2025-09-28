import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseService } from '../src/config/database.js';
import { OrderExecutionService } from '../src/services/order-execution-service.js';
import { QueueService } from '../src/services/queue-service.js';
import { WebSocketManager } from '../src/services/websocket-manager.js';
import { DatabaseConfig, RedisConfig, QueueConfig } from '../src/types/index.js';

// Test configuration
const testDbConfig: DatabaseConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'order_engine_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'password',
};

const testRedisConfig: RedisConfig = {
  host: process.env.TEST_REDIS_HOST || 'localhost',
  port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
  ...(process.env.TEST_REDIS_PASSWORD && { password: process.env.TEST_REDIS_PASSWORD }),
};

const testQueueConfig: QueueConfig = {
  concurrency: 2,
  maxRetries: 2,
  retryDelay: 1000,
  maxRetryDelay: 5000,
};

// Global test services
export let testDb: DatabaseService;
export let testOrderService: OrderExecutionService;
export let testQueueService: QueueService;
export let testWsManager: WebSocketManager;

beforeAll(async () => {
  console.log('Setting up test environment...');
  
  // Initialize test database
  testDb = new DatabaseService(testDbConfig, testRedisConfig);
  await testDb.initialize();
  
  // Initialize test services
  testWsManager = new WebSocketManager();
  testOrderService = new OrderExecutionService(testDb, testWsManager);
  testQueueService = new QueueService(testDb['redis'], testOrderService, testQueueConfig);
  
  console.log('Test environment ready');
});

afterAll(async () => {
  console.log('Cleaning up test environment...');
  
  // Close all services
  await testQueueService.close();
  await testDb.close();
  
  console.log('Test environment cleaned up');
});

beforeEach(async () => {
  // Clear test data before each test
  await testDb.clearTestData();
  await testQueueService.clearQueue();
});

export { testDbConfig, testRedisConfig, testQueueConfig };
