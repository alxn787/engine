import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WebSocketManager } from '../../src/services/websocket-manager.js';
import { OrderStatusUpdate } from '../../src/types/index.js';

// Mock WebSocket
class MockWebSocket {
  public readyState = 1; // OPEN
  public onclose: ((event: any) => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public onmessage: ((event: any) => void) | null = null;
  private sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({});
    }
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      // Create a mock message object that mimics WebSocket message format
      const mockMessage = {
        data: data,
        toString: () => data
      };
      this.onmessage(mockMessage as any);
    }
  }

  simulateError(error: any) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  on(event: string, handler: Function) {
    // Mock implementation - just store the handler
    if (event === 'close') {
      this.onclose = handler as any;
    } else if (event === 'error') {
      this.onerror = handler as any;
    } else if (event === 'message') {
      this.onmessage = handler as any;
    }
  }
}

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockWs1: MockWebSocket;
  let mockWs2: MockWebSocket;
  let mockWs3: MockWebSocket;

  beforeEach(() => {
    wsManager = new WebSocketManager();
    mockWs1 = new MockWebSocket();
    mockWs2 = new MockWebSocket();
    mockWs3 = new MockWebSocket();
  });

  afterEach(() => {
    // Clean up any remaining connections
    wsManager = new WebSocketManager();
  });

  describe('addConnection', () => {
    it('should add a connection without order ID', () => {
      const connectionId = 'conn1';
      
      wsManager.addConnection(connectionId, mockWs1 as any);
      
      expect(wsManager.getConnectionCount()).toBe(1);
    });

    it('should add a connection with order ID', () => {
      const connectionId = 'conn1';
      const orderId = 'order123';
      
      wsManager.addConnection(connectionId, mockWs1 as any, orderId);
      
      expect(wsManager.getConnectionCount()).toBe(1);
      expect(wsManager.getOrderConnectionCount(orderId)).toBe(1);
    });

    it('should handle multiple connections for the same order', () => {
      const orderId = 'order123';
      
      wsManager.addConnection('conn1', mockWs1 as any, orderId);
      wsManager.addConnection('conn2', mockWs2 as any, orderId);
      
      expect(wsManager.getConnectionCount()).toBe(2);
      expect(wsManager.getOrderConnectionCount(orderId)).toBe(2);
    });
  });

  describe('removeConnection', () => {
    it('should remove a connection without order ID', () => {
      const connectionId = 'conn1';
      
      wsManager.addConnection(connectionId, mockWs1 as any);
      expect(wsManager.getConnectionCount()).toBe(1);
      
      wsManager.removeConnection(connectionId);
      expect(wsManager.getConnectionCount()).toBe(0);
    });

    it('should remove a connection with order ID', () => {
      const connectionId = 'conn1';
      const orderId = 'order123';
      
      wsManager.addConnection(connectionId, mockWs1 as any, orderId);
      expect(wsManager.getOrderConnectionCount(orderId)).toBe(1);
      
      wsManager.removeConnection(connectionId, orderId);
      expect(wsManager.getOrderConnectionCount(orderId)).toBe(0);
    });

    it('should clean up empty order connection sets', () => {
      const orderId = 'order123';
      
      wsManager.addConnection('conn1', mockWs1 as any, orderId);
      wsManager.removeConnection('conn1', orderId);
      
      expect(wsManager.getOrderConnectionCount(orderId)).toBe(0);
    });
  });

  describe('sendToOrder', () => {
    it('should send message to all connections for an order', () => {
      const orderId = 'order123';
      const update: OrderStatusUpdate = {
        orderId,
        status: 'routing',
        message: 'Test message',
        timestamp: new Date()
      };

      wsManager.addConnection('conn1', mockWs1 as any, orderId);
      wsManager.addConnection('conn2', mockWs2 as any, orderId);
      
      wsManager.sendToOrder(orderId, update);
      
      const messages1 = mockWs1.getSentMessages();
      const messages2 = mockWs2.getSentMessages();
      
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      
      const sentUpdate1 = JSON.parse(messages1[0]);
      const sentUpdate2 = JSON.parse(messages2[0]);
      
      expect(sentUpdate1.orderId).toBe(orderId);
      expect(sentUpdate1.status).toBe('routing');
      expect(sentUpdate2.orderId).toBe(orderId);
      expect(sentUpdate2.status).toBe('routing');
    });

    it('should not send message if no connections for order', () => {
      const orderId = 'order123';
      const update: OrderStatusUpdate = {
        orderId,
        status: 'routing',
        message: 'Test message',
        timestamp: new Date()
      };

      wsManager.addConnection('conn1', mockWs1 as any, 'different-order');
      
      wsManager.sendToOrder(orderId, update);
      
      const messages = mockWs1.getSentMessages();
      expect(messages).toHaveLength(0);
    });

    it('should handle closed connections gracefully', () => {
      const orderId = 'order123';
      const update: OrderStatusUpdate = {
        orderId,
        status: 'routing',
        message: 'Test message',
        timestamp: new Date()
      };

      wsManager.addConnection('conn1', mockWs1 as any, orderId);
      mockWs1.readyState = 3; // CLOSED
      
      wsManager.sendToOrder(orderId, update);
      
      // Should not throw an error
      expect(wsManager.getConnectionCount()).toBe(0);
    });
  });

  describe('sendToAll', () => {
    it('should send message to all connections', () => {
      const message = { type: 'broadcast', data: 'test' };

      wsManager.addConnection('conn1', mockWs1 as any);
      wsManager.addConnection('conn2', mockWs2 as any);
      
      wsManager.sendToAll(message);
      
      const messages1 = mockWs1.getSentMessages();
      const messages2 = mockWs2.getSentMessages();
      
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      
      expect(JSON.parse(messages1[0])).toEqual(message);
      expect(JSON.parse(messages2[0])).toEqual(message);
    });
  });

  describe('ping/pong handling', () => {
    it('should respond to ping messages', () => {
      const connectionId = 'conn1';
      
      wsManager.addConnection(connectionId, mockWs1 as any);
      
      mockWs1.simulateMessage(JSON.stringify({ type: 'ping' }));
      
      const messages = mockWs1.getSentMessages();
      expect(messages).toHaveLength(1);
      
      const response = JSON.parse(messages[0]);
      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeDefined();
    });

    it('should handle invalid JSON messages gracefully', () => {
      const connectionId = 'conn1';
      
      wsManager.addConnection(connectionId, mockWs1 as any);
      
      mockWs1.simulateMessage('invalid json');
      
      // Should not throw an error
      expect(wsManager.getConnectionCount()).toBe(1);
    });
  });

  describe('connection lifecycle', () => {
    it('should remove connection on close event', () => {
      const connectionId = 'conn1';
      const orderId = 'order123';
      
      wsManager.addConnection(connectionId, mockWs1 as any, orderId);
      expect(wsManager.getConnectionCount()).toBe(1);
      
      mockWs1.close();
      expect(wsManager.getConnectionCount()).toBe(0);
    });

    it('should remove connection on error event', () => {
      const connectionId = 'conn1';
      const orderId = 'order123';
      
      wsManager.addConnection(connectionId, mockWs1 as any, orderId);
      expect(wsManager.getConnectionCount()).toBe(1);
      
      mockWs1.simulateError(new Error('Connection error'));
      expect(wsManager.getConnectionCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      wsManager.addConnection('conn1', mockWs1 as any, 'order1');
      wsManager.addConnection('conn2', mockWs2 as any, 'order1');
      wsManager.addConnection('conn3', mockWs3 as any, 'order2');
      
      const stats = wsManager.getStats();
      
      expect(stats.totalConnections).toBe(3);
      expect(stats.orderConnections).toEqual({
        'order1': 2,
        'order2': 1
      });
    });
  });

  describe('broadcastToTestConnections', () => {
    it('should broadcast to test connections', () => {
      const update: OrderStatusUpdate = {
        orderId: 'order123',
        status: 'routing',
        message: 'Test message',
        timestamp: new Date()
      };

      wsManager.addConnection('test_conn1', mockWs1 as any);
      wsManager.addConnection('regular_conn', mockWs2 as any);
      wsManager.addConnection('test_conn2', mockWs3 as any);
      
      wsManager.broadcastOrderUpdate(update);
      
      const messages1 = mockWs1.getSentMessages();
      const messages2 = mockWs2.getSentMessages();
      const messages3 = mockWs3.getSentMessages();
      
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0); // Regular connection should not receive
      expect(messages3).toHaveLength(1);
      
      const sentUpdate1 = JSON.parse(messages1[0]);
      const sentUpdate3 = JSON.parse(messages3[0]);
      
      expect(sentUpdate1.type).toBe('order_update');
      expect(sentUpdate3.type).toBe('order_update');
    });
  });
});
