import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { QueueService } from '../../src/services/queue-service.js';
import { OrderExecutionService } from '../../src/services/order-execution-service.js';
import { QueueConfig } from '../../src/types/index.js';

// Mock Redis
class MockRedis {
  private data: Map<string, any> = new Map();

  async setex(key: string, ttl: number, value: string) {
    this.data.set(key, value);
  }

  async get(key: string) {
    return this.data.get(key) || null;
  }

  async del(key: string) {
    this.data.delete(key);
  }

  async keys(pattern: string) {
    return Array.from(this.data.keys()).filter(key => key.includes(pattern.replace('*', '')));
  }

  async mget(keys: string[]) {
    return keys.map(key => this.data.get(key) || null);
  }

  async flushdb() {
    this.data.clear();
  }

  async quit() {}
}

// Mock OrderExecutionService
class MockOrderExecutionService {
  private orders: Map<string, any> = new Map();
  private statusUpdates: any[] = [];

  async getOrderStatus(orderId: string) {
    return this.orders.get(orderId) || null;
  }

  async updateOrderStatus(orderId: string, status: string, message: string, additionalUpdates: any = {}) {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
      Object.assign(order, additionalUpdates);
      this.orders.set(orderId, order);
    }
    this.statusUpdates.push({ orderId, status, message, additionalUpdates });
    console.log(`[${orderId}] ${status.toUpperCase()}`);
  }

  async executeOrder(orderId: string) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Simulate successful execution
    order.status = 'confirmed';
    order.txHash = `tx_${orderId}`;
    order.executedPrice = 100;
    this.orders.set(orderId, order);
  }

  setOrder(order: any) {
    this.orders.set(order.id, order);
  }

  getStatusUpdates() {
    return this.statusUpdates;
  }

  clearStatusUpdates() {
    this.statusUpdates = [];
  }
}

describe('QueueService', () => {
  let queueService: QueueService;
  let mockRedis: MockRedis;
  let mockOrderService: MockOrderExecutionService;
  let queueConfig: QueueConfig;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockOrderService = new MockOrderExecutionService();
    queueConfig = {
      concurrency: 2,
      maxRetries: 2,
      retryDelay: 1000,
      maxRetryDelay: 5000
    };

    queueService = new QueueService(mockRedis as any, mockOrderService as any, queueConfig);
  });

  afterEach(async () => {
    await queueService.close();
  });

  describe('addOrder', () => {
    it('should add an order to the queue', async () => {
      const orderId = 'test-order-123';
      
      const job = await queueService.addOrder(orderId);
      
      expect(job).toBeDefined();
      expect(job.data.orderId).toBe(orderId);
    });

    it('should add an order with priority', async () => {
      const orderId = 'test-order-456';
      const priority = 10;
      
      const job = await queueService.addOrder(orderId, priority);
      
      expect(job).toBeDefined();
      expect(job.data.orderId).toBe(orderId);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await queueService.getQueueStats();
      
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('total');
      
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.total).toBe('number');
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for existing job', async () => {
      const orderId = 'test-order-789';
      await queueService.addOrder(orderId);
      
      const jobStatus = await queueService.getJobStatus(orderId);
      
      expect(jobStatus).toBeDefined();
      expect(jobStatus?.data.orderId).toBe(orderId);
    });

    it('should return null for non-existent job', async () => {
      const jobStatus = await queueService.getJobStatus('non-existent-order');
      
      expect(jobStatus).toBeNull();
    });
  });

  describe('queue control', () => {
    it('should pause and resume queue', async () => {
      await queueService.pauseQueue();
      await queueService.resumeQueue();
      
      // No assertions needed, just ensuring no errors are thrown
      expect(true).toBe(true);
    });

    it('should clear queue', async () => {
      await queueService.addOrder('order1');
      await queueService.addOrder('order2');
      
      await queueService.clearQueue();
      
      const stats = await queueService.getQueueStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('order processing', () => {

    it('should not process already completed orders', async () => {
      const orderId = 'test-order-completed';
      const order = {
        id: orderId,
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123',
        status: 'confirmed', // Already completed
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      };

      mockOrderService.setOrder(order);
      await queueService.addOrder(orderId);

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const statusUpdates = mockOrderService.getStatusUpdates();
      // Should not have any status updates since order is already completed
      expect(statusUpdates.length).toBe(0);
    });
  });
});
