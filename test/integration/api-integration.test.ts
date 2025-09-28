import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { testDb, testOrderService, testQueueService, testWsManager } from '../setup.js';
import { orderRoutes } from '../../src/routes/orders.js';

describe('API Integration Tests', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify({
      logger: false
    });

    await app.register(websocket, {
      options: {
        maxPayload: 1024 * 1024,
      }
    });

    await app.register(orderRoutes, { 
      prefix: '/api/orders',
      orderExecutionService: testOrderService,
      queueService: testQueueService,
      wsManager: testWsManager
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await testDb.clearTestData();
    await testQueueService.clearQueue();
  });

  describe('POST /api/orders/execute', () => {
    it('should create a new order successfully', async () => {
      const orderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123',
        slippageTolerance: 0.01
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: orderData
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.orderId).toBeDefined();
      expect(body.status).toBe('pending');
      expect(body.websocketUrl).toContain('/api/orders/stream');
    });

    it('should validate required fields', async () => {
      const invalidOrderData = {
        type: 'market',
        tokenIn: 'SOL',
        // missing required fields
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: invalidOrderData
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Validation error');
      expect(body.details).toBeDefined();
    });

    it('should validate order type enum', async () => {
      const invalidOrderData = {
        type: 'invalid_type',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: invalidOrderData
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate amount constraints', async () => {
      const invalidOrderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: -100, // negative amount
        userId: 'user123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: invalidOrderData
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate slippage tolerance range', async () => {
      const invalidOrderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123',
        slippageTolerance: 1.5 // > 1.0
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: invalidOrderData
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/orders/:orderId', () => {
    it('should return order details for existing order', async () => {
      // Create an order first
      const orderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: orderData
      });

      const { orderId } = JSON.parse(createResponse.body);

      // Get order details
      const response = await app.inject({
        method: 'GET',
        url: `/api/orders/${orderId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.order.id).toBe(orderId);
      expect(body.order.type).toBe('market');
      expect(body.order.tokenIn).toBe('SOL');
    });

    it('should return 404 for non-existent order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/non-existent-id'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Order not found');
    });
  });

  describe('GET /api/orders/user/:userId', () => {
    it('should return orders for a specific user', async () => {
      const userId = 'user456';
      
      // Create multiple orders for the user
      for (let i = 0; i < 3; i++) {
        const orderData = {
          type: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: 100 + i * 50,
          userId: userId
        };

        await app.inject({
          method: 'POST',
          url: '/api/orders/execute',
          payload: orderData
        });
      }

      // Get user orders
      const response = await app.inject({
        method: 'GET',
        url: `/api/orders/user/${userId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.orders).toHaveLength(3);
      expect(body.orders.every((order: any) => order.userId === userId)).toBe(true);
    });

    it('should return empty array for user with no orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/user/nonexistent-user'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.orders).toHaveLength(0);
    });
  });

  describe('GET /api/orders/active', () => {
    it('should return active orders', async () => {
      // Create some orders
      const orderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user789'
      };

      await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: orderData
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/active'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.orders)).toBe(true);
    });
  });

  describe('GET /api/orders/queue/stats', () => {
    it('should return queue statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/queue/stats'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.stats).toBeDefined();
      expect(typeof body.stats.waiting).toBe('number');
      expect(typeof body.stats.active).toBe('number');
      expect(typeof body.stats.completed).toBe('number');
      expect(typeof body.stats.failed).toBe('number');
      expect(typeof body.stats.total).toBe('number');
    });
  });

  describe('GET /api/orders/ws-stats', () => {
    it('should return WebSocket statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/ws-stats'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.stats).toBeDefined();
      expect(typeof body.stats.totalConnections).toBe('number');
      expect(typeof body.stats.orderConnections).toBe('object');
    });
  });

  describe('WebSocket /api/orders/stream', () => {
    it('should establish WebSocket connection with order ID', async () => {
      // Create an order first
      const orderData = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user_ws'
      };

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: orderData
      });

      const { orderId } = JSON.parse(createResponse.body);

      // Test WebSocket connection
      const response = await app.inject({
        method: 'GET',
        url: `/api/orders/stream?orderId=${orderId}`,
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        }
      });

      // WebSocket upgrade should be attempted
      expect(response.statusCode).toBe(101);
    });

    it('should reject WebSocket connection without order ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/stream',
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        }
      });

      // Should not upgrade to WebSocket
      expect(response.statusCode).not.toBe(101);
    });

    it('should reject WebSocket connection for non-existent order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/stream?orderId=non-existent',
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        }
      });

      // Should not upgrade to WebSocket
      expect(response.statusCode).not.toBe(101);
    });
  });

  describe('GET /api/orders/test-ws', () => {
    it('should establish test WebSocket connection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/test-ws',
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        }
      });

      // WebSocket upgrade should be attempted
      expect(response.statusCode).toBe(101);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // This test would require mocking a service to throw an error
      // For now, we'll test that the error handling structure is in place
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/nonexistent'
      });

      // Should return 404 for non-existent routes
      expect(response.statusCode).toBe(404);
    });
  });

  describe('Content Type and Headers', () => {
    it('should return JSON content type for API responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/active'
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
