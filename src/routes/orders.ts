import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OrderExecutionService } from '../services/order-execution-service.js';
import { QueueService } from '../services/queue-service.js';
import { OrderExecutionRequest } from '../types/index.js';

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
  { orderExecutionService, queueService }: { orderExecutionService: OrderExecutionService, queueService: QueueService }
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
        websocketUrl: `/api/orders/${order.id}/ws`
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

  fastify.get('/:orderId/ws', { websocket: true }, async (connection, request) => {
    const { orderId } = request.params as { orderId: string };
    
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
      
      console.log(`WebSocket connected for order ${orderId}`);
      
      orderExecutionService.subscribeToOrderStatus(orderId, (update) => {
        try {
          connection.socket.send(JSON.stringify(update));
        } catch (error: any) {
          console.error(`Error sending WebSocket update for order ${orderId}:`, error);
        }
      });
      
      connection.socket.on('close', () => {
        console.log(`WebSocket disconnected for order ${orderId}`);
        orderExecutionService.unsubscribeFromOrderStatus(orderId);
      });
      
      connection.socket.on('error', (error: any) => {
        console.error(`WebSocket error for order ${orderId}:`, error);
        orderExecutionService.unsubscribeFromOrderStatus(orderId);
      });
      
      connection.socket.send(JSON.stringify({
        orderId,
        status: 'connected',
        message: 'WebSocket connected successfully',
        timestamp: new Date(),
        currentOrderStatus: order.status
      }));
      
    } catch (error) {
      console.error(`Error setting up WebSocket for order ${orderId}:`, error);
      connection.socket.send(JSON.stringify({
        success: false,
        error: 'Internal server error',
        orderId
      }));
      connection.socket.close();
    }
  });

  fastify.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = OrderExecutionSchema.parse(request.body) as OrderExecutionRequest;
      
      const order = await orderExecutionService.createOrder(body);
      
      await queueService.addOrder(order.id);
      
      return {
        success: true,
        orderId: order.id,
        status: order.status,
        message: 'Order created successfully. Use WebSocket endpoint for live updates.',
        websocketUrl: `/api/orders/execute`
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
}

