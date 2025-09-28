import { v4 as uuidv4 } from 'uuid';
import { Order, OrderExecutionRequest, OrderStatus, OrderStatusUpdate } from '../types/index.js';
import { MockDexRouter } from './mock-dex-router.js';
import { DatabaseService } from '../config/database.js';

export class OrderExecutionService {
  private dexRouter: MockDexRouter;
  private db: DatabaseService;
  private statusSubscribers: Map<string, (update: OrderStatusUpdate) => void> = new Map();

  constructor(db: DatabaseService) {
    this.dexRouter = new MockDexRouter();
    this.db = db;
  }

  async createOrder(request: OrderExecutionRequest): Promise<Order> {
    const order: Order = {
      id: uuidv4(),
      type: request.type,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      ...(request.amountOut !== undefined && { amountOut: request.amountOut }),
      slippageTolerance: request.slippageTolerance || 0.01,
      userId: request.userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      retryCount: 0,
    };

    await this.db.saveOrder(order);
    
    await this.db.setActiveOrder(order.id, order);

    this.emitStatusUpdate(order.id, 'pending', 'Order received and queued');

    return order;
  }

  async executeOrder(orderId: string): Promise<void> {
    try {
      const order = await this.db.getActiveOrder(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      await this.updateOrderStatus(orderId, 'routing', 'Comparing DEX prices');
      
      const quote = await this.dexRouter.getBestQuote(
        order.tokenIn,
        order.tokenOut,
        order.amountIn
      );

      await this.updateOrderStatus(orderId, 'building', 'Creating transaction');

      const result = await this.dexRouter.executeSwap(quote, order);

      if (result.success) {
        await this.updateOrderStatus(orderId, 'submitted', 'Transaction sent to network');
        
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
        await this.updateOrderStatus(orderId, 'confirmed', 'Transaction successful', {
          tx_hash: result.txHash,
          executed_price: result.executedPrice,
          executed_at: new Date().toISOString()
        });

        await this.db.removeActiveOrder(orderId);
        
        this.emitStatusUpdate(orderId, 'confirmed', 'Order executed successfully', {
          txHash: result.txHash,
          executedPrice: result.executedPrice
        });
      } else {
        await this.updateOrderStatus(orderId, 'failed', 'Order execution failed', {
          failure_reason: result.error || 'Unknown error'
        });

        await this.db.removeActiveOrder(orderId);
        
        this.emitStatusUpdate(orderId, 'failed', `Order failed: ${result.error || 'Unknown error'}`, {
          error: result.error
        });
        
        throw new Error(result.error || 'Order execution failed');
      }
    } catch (error) {
      console.error(`Error executing order ${orderId}:`, error);
      
      await this.updateOrderStatus(orderId, 'failed', 'Order execution failed', {
        failure_reason: error instanceof Error ? error.message : 'Unknown error'
      });

      await this.db.removeActiveOrder(orderId);
      
      this.emitStatusUpdate(orderId, 'failed', `Order failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }


  async updateOrderStatus(orderId: string, status: OrderStatus, message: string, additionalUpdates: any = {}) {
    await this.db.updateOrderStatus(orderId, status, additionalUpdates);
    
    const order = await this.db.getActiveOrder(orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
      Object.assign(order, additionalUpdates);
      await this.db.setActiveOrder(orderId, order);
    }

    this.emitStatusUpdate(orderId, status, message, additionalUpdates);
  }

  private emitStatusUpdate(orderId: string, status: OrderStatus, message: string, data: any = {}) {
    const update: OrderStatusUpdate = {
      orderId,
      status,
      message,
      timestamp: new Date(),
      ...data
    };

    const subscriber = this.statusSubscribers.get(orderId);
    if (subscriber) {
      subscriber(update);
    }
  }

  subscribeToOrderStatus(orderId: string, callback: (update: OrderStatusUpdate) => void) {
    this.statusSubscribers.set(orderId, callback);
  }

  unsubscribeFromOrderStatus(orderId: string) {
    this.statusSubscribers.delete(orderId);
  }

  async getOrderStatus(orderId: string): Promise<Order | null> {
    return await this.db.getOrder(orderId);
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return await this.db.getOrdersByUser(userId);
  }

  async getActiveOrders(): Promise<Order[]> {
    return await this.db.getAllActiveOrders();
  }
}
