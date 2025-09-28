import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { OrderExecutionService } from '../../src/services/order-execution-service.js';
import { WebSocketManager } from '../../src/services/websocket-manager.js';
import { DatabaseService } from '../../src/config/database.js';
import { OrderExecutionRequest, OrderStatus } from '../../src/types/index.js';

// Mock database service
class MockDatabaseService {
  private orders: Map<string, any> = new Map();
  private activeOrders: Map<string, any> = new Map();

  async saveOrder(order: any) {
    this.orders.set(order.id, order);
  }

  async updateOrderStatus(orderId: string, status: string, updates: any = {}) {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
      Object.assign(order, updates);
      this.orders.set(orderId, order);
    }
  }

  async getOrder(orderId: string) {
    return this.orders.get(orderId) || null;
  }

  async getActiveOrder(orderId: string) {
    return this.activeOrders.get(orderId) || null;
  }

  async setActiveOrder(orderId: string, order: any) {
    this.activeOrders.set(orderId, order);
  }

  async removeActiveOrder(orderId: string) {
    this.activeOrders.delete(orderId);
  }

  async getOrdersByUser(userId: string) {
    return Array.from(this.orders.values()).filter(order => order.userId === userId);
  }

  async getAllActiveOrders() {
    return Array.from(this.activeOrders.values());
  }

  async clearTestData() {
    this.orders.clear();
    this.activeOrders.clear();
  }

  async initialize() {}
  async close() {}
}

describe('OrderExecutionService', () => {
  let orderService: OrderExecutionService;
  let mockDb: MockDatabaseService;
  let mockWsManager: WebSocketManager;

  beforeEach(() => {
    mockDb = new MockDatabaseService();
    mockWsManager = new WebSocketManager();
    orderService = new OrderExecutionService(mockDb as any, mockWsManager);
  });

  afterEach(() => {
    mockDb.clearTestData();
  });

  describe('createOrder', () => {
    it('should create a new order with correct properties', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123',
        slippageTolerance: 0.01
      };

      const order = await orderService.createOrder(orderRequest);

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.type).toBe('market');
      expect(order.tokenIn).toBe('SOL');
      expect(order.tokenOut).toBe('USDC');
      expect(order.amountIn).toBe(100);
      expect(order.userId).toBe('user123');
      expect(order.status).toBe('pending');
      expect(order.slippageTolerance).toBe(0.01);
      expect(order.retryCount).toBe(0);
      expect(order.createdAt).toBeInstanceOf(Date);
      expect(order.updatedAt).toBeInstanceOf(Date);
    });

    it('should set default slippage tolerance if not provided', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'limit',
        tokenIn: 'ETH',
        tokenOut: 'USDT',
        amountIn: 50,
        userId: 'user456'
      };

      const order = await orderService.createOrder(orderRequest);

      expect(order.slippageTolerance).toBe(0.01);
    });

    it('should handle optional amountOut parameter', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'limit',
        tokenIn: 'BTC',
        tokenOut: 'USDC',
        amountIn: 1,
        amountOut: 50000,
        userId: 'user789'
      };

      const order = await orderService.createOrder(orderRequest);

      expect(order.amountOut).toBe(50000);
    });
  });

  describe('getOrderStatus', () => {
    it('should return order if it exists', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const createdOrder = await orderService.createOrder(orderRequest);
      const retrievedOrder = await orderService.getOrderStatus(createdOrder.id);

      expect(retrievedOrder).toEqual(createdOrder);
    });

    it('should return null if order does not exist', async () => {
      const nonExistentOrder = await orderService.getOrderStatus('non-existent-id');
      expect(nonExistentOrder).toBeNull();
    });
  });

  describe('getUserOrders', () => {
    it('should return all orders for a specific user', async () => {
      const user1Request: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user1'
      };

      const user2Request: OrderExecutionRequest = {
        type: 'limit',
        tokenIn: 'ETH',
        tokenOut: 'USDT',
        amountIn: 50,
        userId: 'user2'
      };

      await orderService.createOrder(user1Request);
      await orderService.createOrder(user2Request);
      await orderService.createOrder({ ...user1Request, amountIn: 200 });

      const user1Orders = await orderService.getUserOrders('user1');
      const user2Orders = await orderService.getUserOrders('user2');

      expect(user1Orders).toHaveLength(2);
      expect(user2Orders).toHaveLength(1);
      expect(user1Orders.every(order => order.userId === 'user1')).toBe(true);
      expect(user2Orders.every(order => order.userId === 'user2')).toBe(true);
    });
  });

  describe('getActiveOrders', () => {
    it('should return all active orders', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const order = await orderService.createOrder(orderRequest);
      const activeOrders = await orderService.getActiveOrders();

      expect(activeOrders).toHaveLength(1);
      expect(activeOrders[0].id).toBe(order.id);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status and emit status update', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const order = await orderService.createOrder(orderRequest);
      
      // Mock the emitStatusUpdate method to track calls
      let emitCallCount = 0;
      const originalEmit = (orderService as any).emitStatusUpdate;
      (orderService as any).emitStatusUpdate = (...args: any[]) => {
        emitCallCount++;
        return originalEmit.apply(orderService, args);
      };
      
      await orderService.updateOrderStatus(order.id, 'routing', 'Comparing DEX prices');

      expect(emitCallCount).toBe(1);
    });
  });

  describe('subscribeToOrderStatus', () => {
    it('should register a status subscriber', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const order = await orderService.createOrder(orderRequest);
      let callbackCalled = false;
      const callback = () => { callbackCalled = true; };
      
      orderService.subscribeToOrderStatus(order.id, callback);
      
      // Trigger a status update
      await orderService.updateOrderStatus(order.id, 'routing', 'Test message');
      
      expect(callbackCalled).toBe(true);
    });

    it('should unsubscribe from order status', async () => {
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user123'
      };

      const order = await orderService.createOrder(orderRequest);
      let callbackCalled = false;
      const callback = () => { callbackCalled = true; };
      
      orderService.subscribeToOrderStatus(order.id, callback);
      orderService.unsubscribeFromOrderStatus(order.id);
      
      // Trigger a status update
      await orderService.updateOrderStatus(order.id, 'routing', 'Test message');
      
      expect(callbackCalled).toBe(false);
    });
  });
});
