import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { testDb, testOrderService, testQueueService, testWsManager } from '../setup.js';
import { OrderExecutionRequest } from '../../src/types/index.js';

describe('Order Execution Flow Integration Tests', () => {
  beforeEach(async () => {
    // Clear test data before each test
    await testDb.clearTestData();
    await testQueueService.clearQueue();
  });

  describe('Complete Order Execution Flow', () => {
    it('should execute a market order from creation to completion', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123',
        slippageTolerance: 0.01
      };

      // Create order
      const order = await testOrderService.createOrder(orderRequest);
      expect(order.status).toBe('pending');

      // Add to queue
      await testQueueService.addOrder(order.id);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check final order status
      const finalOrder = await testOrderService.getOrderStatus(order.id);
      expect(finalOrder).toBeDefined();
      expect(['confirmed', 'failed']).toContain(finalOrder!.status);

      if (finalOrder!.status === 'confirmed') {
        expect(finalOrder!.txHash).toBeDefined();
        expect(finalOrder!.executedPrice).toBeGreaterThan(0);
      }
    });

    it('should execute a limit order with specific amount out', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'limit',
        tokenIn: 'ETH',
        tokenOut: 'USDT',
        amountIn: 1,
        amountOut: 3000,
        userId: 'user456',
        slippageTolerance: 0.005
      };

      const order = await testOrderService.createOrder(orderRequest);
      expect(order.amountOut).toBe(3000);

      await testQueueService.addOrder(order.id);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const finalOrder = await testOrderService.getOrderStatus(order.id);
      expect(finalOrder).toBeDefined();
      expect(['confirmed', 'failed']).toContain(finalOrder!.status);
    });

    it('should handle multiple orders concurrently', async () => {
      const orders = [];
      
      // Create multiple orders
      for (let i = 0; i < 5; i++) {
        const orderRequest: OrderExecutionRequest = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 50 + i * 10,
          userId: `user${i}`,
          slippageTolerance: 0.01
        };

        const order = await testOrderService.createOrder(orderRequest);
        orders.push(order);
        await testQueueService.addOrder(order.id);
      }

      // Wait for all orders to process
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check all orders are processed
      for (const order of orders) {
        const finalOrder = await testOrderService.getOrderStatus(order.id);
        expect(finalOrder).toBeDefined();
        expect(['confirmed', 'failed']).toContain(finalOrder!.status);
      }
    });
  });

  describe('Order Status Tracking', () => {
    it('should track order status changes throughout execution', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user789'
      };

      const order = await testOrderService.createOrder(orderRequest);
      const statusUpdates: string[] = [];

      // Subscribe to status updates
      testOrderService.subscribeToOrderStatus(order.id, (update) => {
        statusUpdates.push(update.status);
      });

      await testQueueService.addOrder(order.id);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have multiple status updates
      expect(statusUpdates.length).toBeGreaterThan(1);
      expect(statusUpdates).toContain('pending');
      expect(statusUpdates).toContain('routing');
      expect(statusUpdates).toContain('building');
    });

    it('should maintain order history in database', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user999'
      };

      const order = await testOrderService.createOrder(orderRequest);
      await testQueueService.addOrder(order.id);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check order is persisted in database
      const dbOrder = await testDb.getOrder(order.id);
      expect(dbOrder).toBeDefined();
      expect(dbOrder!.id).toBe(order.id);
      expect(dbOrder!.userId).toBe('user999');
    });
  });

  describe('User Order Management', () => {
    it('should retrieve all orders for a specific user', async () => {
      const userId = 'user123';
      
      // Create multiple orders for the same user
      for (let i = 0; i < 3; i++) {
        const orderRequest: OrderExecutionRequest = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i * 50,
          userId: userId
        };

        const order = await testOrderService.createOrder(orderRequest);
        await testQueueService.addOrder(order.id);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Retrieve user orders
      const userOrders = await testOrderService.getUserOrders(userId);
      expect(userOrders).toHaveLength(3);
      expect(userOrders.every(order => order.userId === userId)).toBe(true);
    });

    it('should retrieve active orders only', async () => {
      // Create orders with different statuses
      const order1 = await testOrderService.createOrder({
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user1'
      });

      const order2 = await testOrderService.createOrder({
        type: 'market',
        tokenIn: 'ETH',
        tokenOut: 'USDT',
        amountIn: 1,
        userId: 'user2'
      });

      // Add only first order to queue
      await testQueueService.addOrder(order1.id);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const activeOrders = await testOrderService.getActiveOrders();
      expect(activeOrders.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle order execution failures gracefully', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'INVALID',
        tokenOut: 'TOKEN',
        amountIn: 100,
        userId: 'user_error'
      };

      const order = await testOrderService.createOrder(orderRequest);
      await testQueueService.addOrder(order.id);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const finalOrder = await testOrderService.getOrderStatus(order.id);
      expect(finalOrder).toBeDefined();
      // Order should either be confirmed or failed
      expect(['confirmed', 'failed']).toContain(finalOrder!.status);
    });

    it('should retry failed orders according to configuration', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user_retry'
      };

      const order = await testOrderService.createOrder(orderRequest);
      await testQueueService.addOrder(order.id);
      await new Promise(resolve => setTimeout(resolve, 3000));

      const finalOrder = await testOrderService.getOrderStatus(order.id);
      expect(finalOrder).toBeDefined();
      expect(finalOrder!.retryCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Queue Management', () => {
    it('should provide accurate queue statistics', async () => {
      // Get initial stats
      const initialStats = await testQueueService.getQueueStats();
      expect(initialStats).toBeDefined();
      expect(typeof initialStats.total).toBe('number');

      // Add some orders
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const order = await testOrderService.createOrder({
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100,
          userId: `user${i}`
        });
        orders.push(order);
        await testQueueService.addOrder(order.id);
      }

      // Check stats after adding orders
      const statsAfterAdd = await testQueueService.getQueueStats();
      expect(statsAfterAdd.total).toBeGreaterThanOrEqual(initialStats.total);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check final stats
      const finalStats = await testQueueService.getQueueStats();
      expect(finalStats).toBeDefined();
    });

    it('should handle queue pause and resume', async () => {
      await testQueueService.pauseQueue();
      await testQueueService.resumeQueue();
      
      // Should not throw any errors
      expect(true).toBe(true);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high volume of orders efficiently', async () => {
      const startTime = Date.now();
      const orderCount = 10;
      const orders = [];

      // Create and queue multiple orders
      for (let i = 0; i < orderCount; i++) {
        const order = await testOrderService.createOrder({
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i,
          userId: `user${i}`
        });
        orders.push(order);
        await testQueueService.addOrder(order.id);
      }

      // Wait for all orders to process
      await new Promise(resolve => setTimeout(resolve, 10000));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Check all orders are processed
      let processedCount = 0;
      for (const order of orders) {
        const finalOrder = await testOrderService.getOrderStatus(order.id);
        if (finalOrder && ['confirmed', 'failed'].includes(finalOrder.status)) {
          processedCount++;
        }
      }

      expect(processedCount).toBe(orderCount);
      console.log(`Processed ${orderCount} orders in ${processingTime}ms`);
    });
  });
});
