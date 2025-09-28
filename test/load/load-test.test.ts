import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { testDb, testOrderService, testQueueService, testWsManager } from '../setup.js';
import { OrderExecutionRequest } from '../../src/types/index.js';

describe('Load Testing', () => {
  beforeEach(async () => {
    await testDb.clearTestData();
    await testQueueService.clearQueue();
  });

  afterEach(async () => {
    await testDb.clearTestData();
    await testQueueService.clearQueue();
  });

  describe('High Volume Order Processing', () => {
    it('should handle 50 concurrent orders efficiently', async () => {
      const orderCount = 50;
      const orders: any[] = [];
      const startTime = Date.now();

      // Create orders concurrently
      const orderPromises = [];
      for (let i = 0; i < orderCount; i++) {
        const orderRequest: OrderExecutionRequest = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i,
          userId: `load-test-user-${i}`,
          slippageTolerance: 0.01
        };

        orderPromises.push(testOrderService.createOrder(orderRequest));
      }

      const createdOrders = await Promise.all(orderPromises);
      orders.push(...createdOrders);

      // Add all orders to queue
      const queuePromises = orders.map(order => testQueueService.addOrder(order.id));
      await Promise.all(queuePromises);

      // Wait for all orders to process
      await new Promise(resolve => setTimeout(resolve, 15000));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify all orders are processed
      let processedCount = 0;
      let confirmedCount = 0;
      let failedCount = 0;

      for (const order of orders) {
        const finalOrder = await testOrderService.getOrderStatus(order.id);
        if (finalOrder && ['confirmed', 'failed'].includes(finalOrder.status)) {
          processedCount++;
          if (finalOrder.status === 'confirmed') {
            confirmedCount++;
          } else {
            failedCount++;
          }
        }
      }

      console.log(`Processed ${processedCount}/${orderCount} orders in ${processingTime}ms`);
      console.log(`Confirmed: ${confirmedCount}, Failed: ${failedCount}`);
      console.log(`Average processing time: ${processingTime / orderCount}ms per order`);

      expect(processedCount).toBe(orderCount);
      expect(processingTime).toBeLessThan(20000); // Should complete within 20 seconds
    });

    it('should maintain system stability under load', async () => {
      const orderCount = 100;
      const orders: any[] = [];

      // Create and queue orders in batches
      for (let batch = 0; batch < 5; batch++) {
        const batchOrders = [];
        for (let i = 0; i < 20; i++) {
          const orderRequest: OrderExecutionRequest = {
            type: 'market',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amountIn: 50 + i,
            userId: `batch-${batch}-user-${i}`,
            slippageTolerance: 0.01
          };

          const order = await testOrderService.createOrder(orderRequest);
          batchOrders.push(order);
        }

        // Add batch to queue
        const queuePromises = batchOrders.map(order => testQueueService.addOrder(order.id));
        await Promise.all(queuePromises);
        orders.push(...batchOrders);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Check system health
      const queueStats = await testQueueService.getQueueStats();
      const wsStats = testWsManager.getStats();

      console.log('Queue Stats:', queueStats);
      console.log('WebSocket Stats:', wsStats);

      // Verify most orders are processed
      let processedCount = 0;
      for (const order of orders) {
        const finalOrder = await testOrderService.getOrderStatus(order.id);
        if (finalOrder && ['confirmed', 'failed'].includes(finalOrder.status)) {
          processedCount++;
        }
      }

      expect(processedCount).toBeGreaterThan(orderCount * 0.8); // At least 80% processed
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during high volume processing', async () => {
      const initialMemory = process.memoryUsage();
      const orderCount = 200;

      // Process orders in waves
      for (let wave = 0; wave < 4; wave++) {
        const orders = [];
        
        for (let i = 0; i < 50; i++) {
          const orderRequest: OrderExecutionRequest = {
            type: 'market',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amountIn: 100 + i,
            userId: `wave-${wave}-user-${i}`,
            slippageTolerance: 0.01
          };

          const order = await testOrderService.createOrder(orderRequest);
          orders.push(order);
          await testQueueService.addOrder(order.id);
        }

        // Wait for wave to process
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Concurrent User Operations', () => {
    it('should handle multiple users creating orders simultaneously', async () => {
      const userCount = 10;
      const ordersPerUser = 5;
      const totalOrders = userCount * ordersPerUser;

      const userPromises = [];
      for (let userId = 0; userId < userCount; userId++) {
        const userPromise = (async () => {
          const userOrders = [];
          for (let i = 0; i < ordersPerUser; i++) {
            const orderRequest: OrderExecutionRequest = {
              type: 'market',
              tokenIn: 'SOL',
              tokenOut: 'USDC',
              amountIn: 100 + i,
              userId: `concurrent-user-${userId}`,
              slippageTolerance: 0.01
            };

            const order = await testOrderService.createOrder(orderRequest);
            userOrders.push(order);
            await testQueueService.addOrder(order.id);
          }
          return userOrders;
        })();
        userPromises.push(userPromise);
      }

      const allUserOrders = await Promise.all(userPromises);
      const allOrders = allUserOrders.flat();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify all orders are processed
      let processedCount = 0;
      for (const order of allOrders) {
        const finalOrder = await testOrderService.getOrderStatus(order.id);
        if (finalOrder && ['confirmed', 'failed'].includes(finalOrder.status)) {
          processedCount++;
        }
      }

      expect(processedCount).toBe(totalOrders);
    });
  });

  describe('Queue Performance Under Load', () => {
    it('should maintain queue performance with high throughput', async () => {
      const orderCount = 100;
      const startTime = Date.now();

      // Create and queue orders rapidly
      const orderPromises = [];
      for (let i = 0; i < orderCount; i++) {
        const orderRequest: OrderExecutionRequest = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i,
          userId: `throughput-user-${i}`,
          slippageTolerance: 0.01
        };

        const orderPromise = (async () => {
          const order = await testOrderService.createOrder(orderRequest);
          await testQueueService.addOrder(order.id);
          return order;
        })();
        orderPromises.push(orderPromise);
      }

      const orders = await Promise.all(orderPromises);
      const queueTime = Date.now() - startTime;

      console.log(`Queued ${orderCount} orders in ${queueTime}ms`);
      console.log(`Queue rate: ${(orderCount / queueTime * 1000).toFixed(2)} orders/second`);

      // Queue time should be reasonable
      expect(queueTime).toBeLessThan(5000); // Should queue 100 orders in under 5 seconds

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Check final queue stats
      const finalStats = await testQueueService.getQueueStats();
      console.log('Final queue stats:', finalStats);
    });
  });

  describe('WebSocket Performance Under Load', () => {
    it('should handle multiple WebSocket connections efficiently', async () => {
      const connectionCount = 20;
      const orderCount = 10;

      // Create orders
      const orders = [];
      for (let i = 0; i < orderCount; i++) {
        const orderRequest: OrderExecutionRequest = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i,
          userId: `ws-load-user-${i}`,
          slippageTolerance: 0.01
        };

        const order = await testOrderService.createOrder(orderRequest);
        orders.push(order);
        await testQueueService.addOrder(order.id);
      }

      // Simulate multiple WebSocket connections
      const mockConnections = [];
      for (let i = 0; i < connectionCount; i++) {
        const mockWs = {
          readyState: 1,
          send: () => {},
          on: () => {},
          close: () => {}
        };
        mockConnections.push(mockWs);
        testWsManager.addConnection(`load-test-conn-${i}`, mockWs as any, orders[i % orderCount].id);
      }

      const initialStats = testWsManager.getStats();
      expect(initialStats.totalConnections).toBe(connectionCount);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Clean up connections
      for (let i = 0; i < connectionCount; i++) {
        testWsManager.removeConnection(`load-test-conn-${i}`, orders[i % orderCount].id);
      }

      const finalStats = testWsManager.getStats();
      expect(finalStats.totalConnections).toBe(0);
    });
  });
});
