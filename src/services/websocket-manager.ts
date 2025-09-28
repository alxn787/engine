import { WebSocket } from 'ws';
import { OrderStatusUpdate } from '../types/index.js';

export class WebSocketManager {
  private connections: Map<string, WebSocket> = new Map();
  private orderConnections: Map<string, Set<string>> = new Map();

  addConnection(connectionId: string, ws: WebSocket, orderId?: string) {
    this.connections.set(connectionId, ws);
    
    if (orderId) {
      if (!this.orderConnections.has(orderId)) {
        this.orderConnections.set(orderId, new Set());
      }
      this.orderConnections.get(orderId)!.add(connectionId);
    }

    ws.on('close', () => {
      this.removeConnection(connectionId, orderId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for connection ${connectionId}:`, error);
      this.removeConnection(connectionId, orderId);
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
        }
      } catch (error) {
        console.error(`Error handling message from ${connectionId}:`, error);
      }
    });
  }

  removeConnection(connectionId: string, orderId?: string) {
    this.connections.delete(connectionId);
    
    if (orderId && this.orderConnections.has(orderId)) {
      this.orderConnections.get(orderId)!.delete(connectionId);
      
      if (this.orderConnections.get(orderId)!.size === 0) {
        this.orderConnections.delete(orderId);
      }
    }
  }

  sendToOrder(orderId: string, update: OrderStatusUpdate) {
    console.log(`[WebSocket] Order ${orderId} status: ${update.status} - ${update.message}`);
    
    const connections = this.orderConnections.get(orderId);
    if (connections) {
      const message = JSON.stringify(update);

      for (const connectionId of connections) {
        const ws = this.connections.get(connectionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
            console.log(`[WebSocket] Sent update to connection ${connectionId} for order ${orderId}`);
          } catch (error) {
            console.error(`Error sending message to connection ${connectionId}:`, error);
            this.removeConnection(connectionId, orderId);
          }
        } else {
          this.removeConnection(connectionId, orderId);
        }
      }
    }

    this.broadcastToTestConnections(update);
  }

  broadcastOrderUpdate(update: OrderStatusUpdate) {
    this.broadcastToTestConnections(update);
  }

  private broadcastToTestConnections(update: OrderStatusUpdate) {
    const testConnections = Array.from(this.connections.entries())
      .filter(([connectionId, ws]) => 
        connectionId.includes('test') && ws.readyState === WebSocket.OPEN
      );


    const message = JSON.stringify({
      type: 'order_update',
      ...update
    });

    for (const [connectionId, ws] of testConnections) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`Error sending to test connection ${connectionId}:`, error);
        this.removeConnection(connectionId);
      }
    }
  }

  sendToAll(message: any) {
    const messageStr = JSON.stringify(message);

    for (const [connectionId, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`Error sending message to connection ${connectionId}:`, error);
          this.removeConnection(connectionId);
        }
      } else {
        this.removeConnection(connectionId);
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getOrderConnectionCount(orderId: string): number {
    return this.orderConnections.get(orderId)?.size || 0;
  }

  getStats() {
    return {
      totalConnections: this.connections.size,
      orderConnections: Object.fromEntries(
        Array.from(this.orderConnections.entries()).map(([orderId, connections]) => [
          orderId,
          connections.size
        ])
      )
    };
  }
}

export const wsManager = new WebSocketManager();