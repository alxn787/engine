import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { testDb, testOrderService, testQueueService, testWsManager } from '../setup.js';
import { OrderExecutionRequest } from '../../src/types/index.js';
import { WebSocket } from 'ws';

// Mock WebSocket for testing
class TestWebSocket {
  public readyState = 1; // OPEN
  public messages: string[] = [];
  public onclose: ((event: any) => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public onmessage: ((event: any) => void) | null = null;

  send(data: string) {
    this.messages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({});
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  simulateError(error: any) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  getAllMessages() {
    return this.messages;
  }

  clearMessages() {
    this.messages = [];
  }
}

describe('WebSocket Integration Tests', () => {
  let testWs: TestWebSocket;

  beforeEach(() => {
    testWs = new TestWebSocket();
    testWs.clearMessages();
  });

  afterEach(async () => {
    await testDb.clearTestData();
    await testQueueService.clearQueue();
  });

  describe('WebSocket Connection Management', () => {
    it('should establish WebSocket connection for order tracking', () => {
      const connectionId = 'test_conn_1';
      const orderId = 'test_order_1';

      testWsManager.addConnection(connectionId, testWs as any, orderId);

      expect(testWsManager.getConnectionCount()).toBe(1);
      expect(testWsManager.getOrderConnectionCount(orderId)).toBe(1);
    });

    it('should handle multiple connections for the same order', () => {
      const orderId = 'test_order_2';
      const ws1 = new TestWebSocket();
      const ws2 = new TestWebSocket();

      testWsManager.addConnection('conn1', ws1 as any, orderId);
      testWsManager.addConnection('conn2', ws2 as any, orderId);

      expect(testWsManager.getConnectionCount()).toBe(2);
      expect(testWsManager.getOrderConnectionCount(orderId)).toBe(2);
    });

    it('should remove connections on close', () => {
      const connectionId = 'test_conn_3';
      const orderId = 'test_order_3';

      testWsManager.addConnection(connectionId, testWs as any, orderId);
      expect(testWsManager.getConnectionCount()).toBe(1);

      testWs.close();
      expect(testWsManager.getConnectionCount()).toBe(0);
    });
  });

  describe('Order Status Broadcasting', () => {
    it('should broadcast order status updates to connected clients', async () => {
      const orderId = 'test_order_4';
      const connectionId = 'test_conn_4';

      testWsManager.addConnection(connectionId, testWs as any, orderId);

      // Simulate order status update
      const statusUpdate = {
        orderId,
        status: 'routing' as const,
        message: 'Comparing DEX prices',
        timestamp: new Date()
      };

      testWsManager.sendToOrder(orderId, statusUpdate);

      expect(testWs.getAllMessages()).toHaveLength(1);
      const receivedMessage = JSON.parse(testWs.getLastMessage());
      expect(receivedMessage.orderId).toBe(orderId);
      expect(receivedMessage.status).toBe('routing');
    });

    it('should not send updates to disconnected clients', async () => {
      const orderId = 'test_order_5';
      const connectionId = 'test_conn_5';

      testWsManager.addConnection(connectionId, testWs as any, orderId);
      testWs.close(); // Simulate disconnection

      const statusUpdate = {
        orderId,
        status: 'routing' as const,
        message: 'Comparing DEX prices',
        timestamp: new Date()
      };

      testWsManager.sendToOrder(orderId, statusUpdate);

      // Should not have any messages since connection is closed
      expect(testWs.getAllMessages()).toHaveLength(0);
    });

    it('should handle ping/pong messages', () => {
      const connectionId = 'test_conn_6';
      const orderId = 'test_order_6';

      testWsManager.addConnection(connectionId, testWs as any, orderId);
      testWs.clearMessages();

      // Send ping
      testWs.simulateMessage(JSON.stringify({ type: 'ping' }));

      expect(testWs.getAllMessages()).toHaveLength(1);
      const pongMessage = JSON.parse(testWs.getLastMessage());
      expect(pongMessage.type).toBe('pong');
    });
  });

  describe('End-to-End WebSocket Order Tracking', () => {
    it('should track complete order execution via WebSocket', async () => {
      const orderId = 'test_order_7';
      const connectionId = 'test_conn_7';
      const receivedUpdates: any[] = [];

      // Set up WebSocket connection
      testWsManager.addConnection(connectionId, testWs as any, orderId);

      // Create order
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user_ws_test'
      };

      const order = await testOrderService.createOrder(orderRequest);
      expect(order.id).toBeDefined();

      // Subscribe to order status updates
      testOrderService.subscribeToOrderStatus(order.id, (update) => {
        receivedUpdates.push(update);
      });

      // Add order to queue for processing
      await testQueueService.addOrder(order.id);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check that we received status updates
      expect(receivedUpdates.length).toBeGreaterThan(0);
      expect(receivedUpdates.some(update => update.status === 'pending')).toBe(true);
      expect(receivedUpdates.some(update => update.status === 'routing')).toBe(true);
    });

    it('should handle WebSocket connection during order processing', async () => {
      const orderId = 'test_order_8';
      const connectionId = 'test_conn_8';

      // Create order first
      const orderRequest: OrderExecutionRequest = {
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        userId: 'user_ws_test2'
      };

      const order = await testOrderService.createOrder(orderRequest);
      await testQueueService.addOrder(order.id);

      // Connect WebSocket after order is already processing
      testWsManager.addConnection(connectionId, testWs as any, order.id);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should receive updates even though we connected after processing started
      expect(testWs.getAllMessages().length).toBeGreaterThan(0);
    });
  });

  describe('WebSocket Error Handling', () => {
    it('should handle malformed WebSocket messages gracefully', () => {
      const connectionId = 'test_conn_9';
      const orderId = 'test_order_9';

      testWsManager.addConnection(connectionId, testWs as any, orderId);
      testWs.clearMessages();

      // Send malformed JSON
      testWs.simulateMessage('invalid json');

      // Should not crash and connection should remain active
      expect(testWsManager.getConnectionCount()).toBe(1);
    });

    it('should handle WebSocket errors gracefully', () => {
      const connectionId = 'test_conn_10';
      const orderId = 'test_order_10';

      testWsManager.addConnection(connectionId, testWs as any, orderId);
      expect(testWsManager.getConnectionCount()).toBe(1);

      // Simulate error
      testWs.simulateError(new Error('Connection error'));

      // Connection should be removed
      expect(testWsManager.getConnectionCount()).toBe(0);
    });
  });

  describe('WebSocket Statistics and Monitoring', () => {
    it('should provide accurate connection statistics', () => {
      const order1 = 'test_order_11';
      const order2 = 'test_order_12';
      const ws1 = new TestWebSocket();
      const ws2 = new TestWebSocket();
      const ws3 = new TestWebSocket();

      testWsManager.addConnection('conn1', ws1 as any, order1);
      testWsManager.addConnection('conn2', ws2 as any, order1);
      testWsManager.addConnection('conn3', ws3 as any, order2);

      const stats = testWsManager.getStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.orderConnections[order1]).toBe(2);
      expect(stats.orderConnections[order2]).toBe(1);
    });

    it('should track test connections separately', () => {
      const testConnectionId = 'test_conn_13';
      const regularConnectionId = 'regular_conn_1';
      const orderId = 'test_order_13';

      testWsManager.addConnection(testConnectionId, testWs as any, orderId);
      testWsManager.addConnection(regularConnectionId, new TestWebSocket() as any, orderId);

      const statusUpdate = {
        orderId,
        status: 'routing' as const,
        message: 'Test message',
        timestamp: new Date()
      };

      testWsManager.broadcastOrderUpdate(statusUpdate);

      // Test connection should receive the update
      expect(testWs.getAllMessages().length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent WebSocket Operations', () => {
    it('should handle multiple concurrent WebSocket connections', async () => {
      const orderCount = 5;
      const connections: TestWebSocket[] = [];
      const orderIds: string[] = [];

      // Create multiple orders and connections
      for (let i = 0; i < orderCount; i++) {
        const orderId = `concurrent_order_${i}`;
        const ws = new TestWebSocket();
        
        testWsManager.addConnection(`conn_${i}`, ws as any, orderId);
        connections.push(ws);
        orderIds.push(orderId);
      }

      expect(testWsManager.getConnectionCount()).toBe(orderCount);

      // Send updates to all orders
      for (const orderId of orderIds) {
        const statusUpdate = {
          orderId,
          status: 'routing' as const,
          message: 'Concurrent test',
          timestamp: new Date()
        };
        testWsManager.sendToOrder(orderId, statusUpdate);
      }

      // All connections should receive their respective updates
      for (let i = 0; i < orderCount; i++) {
        expect(connections[i].getAllMessages().length).toBeGreaterThan(0);
      }
    });
  });
});
