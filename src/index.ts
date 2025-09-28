import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { DatabaseService } from './config/database.js';
import { OrderExecutionService } from './services/order-execution-service.js';
import { QueueService } from './services/queue-service.js';
import { WebSocketManager } from './services/websocket-manager.js';
import { orderRoutes } from './routes/orders.js';
import { DatabaseConfig, RedisConfig, QueueConfig } from './types/index.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'order_engine',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
};

const queueConfig: QueueConfig = {
  concurrency: 10,
  maxRetries: 3,
  retryDelay: 2000,
  maxRetryDelay: 30000,
};

async function startServer() {
  try {
    console.log('Connecting to database...');
    const db = new DatabaseService(dbConfig, redisConfig);
    
    console.log('Initializing services...');
    const wsManager = new WebSocketManager();
    const orderExecutionService = new OrderExecutionService(db, wsManager);
    const queueService = new QueueService(db['redis'], orderExecutionService, queueConfig);
    
    const fastify = Fastify({
      logger: {
        level: 'info'
      }
    });

    await fastify.register(websocket, {
      options: {
        maxPayload: 1024 * 1024,
      }
    });

    await fastify.register(orderRoutes, { 
      prefix: '/api/orders',
      orderExecutionService,
      queueService,
      wsManager
    });

    fastify.get('/health', async (request, reply) => {
      const queueStats = await queueService.getQueueStats();
      const wsStats = wsManager.getStats();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        queue: queueStats,
        websocket: wsStats,
        uptime: process.uptime()
      };
    });

    fastify.get('/', async (request, reply) => {
      return {
        message: 'Order Execution Engine API',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          orders: '/api/orders',
          websocket: '/api/orders/:orderId/ws'
        }
      };
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      
      try {
        await queueService.close();
        await db.close();
        await fastify.close();
        console.log('Server closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    await fastify.listen({ port: Number(PORT), host: HOST });
    
    console.log(`Order Execution Engine started on http://${HOST}:${PORT}`);
    console.log(`Queue processing up to ${queueConfig.concurrency} concurrent orders`);
    console.log(`Processing rate: 100 orders/minute`);
    console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/api/orders/:orderId/ws`);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
