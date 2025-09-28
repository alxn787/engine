import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OrderExecutionService } from '../services/order-execution-service.js';
import { QueueService } from '../services/queue-service.js';
import { OrderExecutionRequest } from '../types/index.js';
import { WebSocketManager } from '../services/websocket-manager.js';

const OrderExecutionSchema = z.object({
  type: z.enum(['market', 'limit', 'sniper']),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.number().positive(),
  amountOut: z.number().positive().optional(),
  slippageTolerance: z.number().min(0).max(1).optional(),
  userId: z.string().min(1),
});

export async function orderRoutes(
  fastify: FastifyInstance,
  { orderExecutionService, queueService, wsManager }: { 
    orderExecutionService: OrderExecutionService, 
    queueService: QueueService,
    wsManager: WebSocketManager
  }
) {

  fastify.post('/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = OrderExecutionSchema.parse(request.body) as OrderExecutionRequest;
      
      const order = await orderExecutionService.createOrder(body);
      await queueService.addOrder(order.id);
      
      return {
        success: true,
        orderId: order.id,
        status: order.status,
        message: 'Order created successfully. Connect to WebSocket for live updates.',
        websocketUrl: `/api/orders/stream?orderId=${order.id}`,
        upgradeInstructions: {
          method: 'WebSocket upgrade',
          url: `ws://localhost:3000/api/orders/stream?orderId=${order.id}`,
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13'
          }
        }
      };
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }
      
      console.error('Error creating order:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  fastify.get('/stream', { websocket: true }, async (connection, request: FastifyRequest) => {
    const { orderId } = request.query as { orderId: string };
    
    if (!orderId) {
      connection.socket.send(JSON.stringify({
        success: false,
        error: 'Order ID required in query parameter',
        example: 'ws://localhost:3000/api/orders/stream?orderId=your-order-id'
      }));
      connection.socket.close();
      return;
    }

    const connectionId = `${orderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const order = await orderExecutionService.getOrderStatus(orderId);
      if (!order) {
        connection.socket.send(JSON.stringify({
          success: false,
          error: 'Order not found',
          orderId
        }));
        connection.socket.close();
        return;
      }

      wsManager.addConnection(connectionId, connection.socket, orderId);
      
      connection.socket.send(JSON.stringify({
        type: 'connection_established',
        orderId,
        status: 'connected',
        message: 'WebSocket connected successfully',
        timestamp: new Date().toISOString(),
        currentOrderStatus: order.status
      }));
      
    } catch (error) {
      console.error(`Error setting up WebSocket for order ${orderId}:`, error);
      connection.socket.send(JSON.stringify({
        type: 'error',
        success: false,
        error: 'Internal server error',
        orderId
      }));
      connection.socket.close();
      return;
    }
    
    connection.socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          connection.socket.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error(`Error parsing WebSocket message for order ${orderId}:`, error);
      }
    });
    
    connection.socket.on('close', () => {
      wsManager.removeConnection(connectionId, orderId);
    });
    
    connection.socket.on('error', (error: any) => {
      console.error(`WebSocket error for order ${orderId} (${connectionId}):`, error);
      wsManager.removeConnection(connectionId, orderId);
    });
  });


  fastify.get('/:orderId', async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
    try {
      const { orderId } = request.params;
      const order = await orderExecutionService.getOrderStatus(orderId);
      
      if (!order) {
        return reply.status(404).send({
          success: false,
          error: 'Order not found'
        });
      }
      
      return {
        success: true,
        order
      };
    } catch (error) {
      console.error('Error fetching order:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  fastify.get('/user/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const orders = await orderExecutionService.getUserOrders(userId);
      
      return {
        success: true,
        orders
      };
    } catch (error) {
      console.error('Error fetching user orders:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  fastify.get('/active', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orders = await orderExecutionService.getActiveOrders();
      
      return {
        success: true,
        orders
      };
    } catch (error) {
      console.error('Error fetching active orders:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  fastify.get('/queue/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await queueService.getQueueStats();
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  fastify.get('/test-ws', { websocket: true }, (connection, request) => {
    const connectionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    wsManager.addConnection(connectionId, connection.socket);
    
    connection.socket.send(JSON.stringify({
      type: 'connection_established',
      message: 'Test WebSocket connected successfully!',
      timestamp: new Date().toISOString(),
      connectionId
    }));
    
    connection.socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          connection.socket.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error(`Test WebSocket message error (${connectionId}):`, error);
      }
    });
    
    connection.socket.on('close', () => {
      wsManager.removeConnection(connectionId);
    });
    
    connection.socket.on('error', (error) => {
      console.error(`Test WebSocket error (${connectionId}):`, error);
      wsManager.removeConnection(connectionId);
    });
  });

  fastify.get('/ws-stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = wsManager.getStats();
      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Error fetching WebSocket stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}