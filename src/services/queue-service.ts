import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { OrderExecutionService } from './order-execution-service.js';
import { QueueConfig } from '../types/index.js';

export class QueueService {
  private orderQueue: Queue;
  private worker: Worker;
  private orderExecutionService: OrderExecutionService;
  private redis: Redis;

  constructor(
    redis: Redis,
    orderExecutionService: OrderExecutionService,
    config: QueueConfig
  ) {
    this.redis = redis;
    this.orderExecutionService = orderExecutionService;

    this.orderQueue = new Queue('order-execution', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: config.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.retryDelay,
        },
      },
    });

    this.worker = new Worker(
      'order-execution',
      this.processOrder.bind(this),
      {
        connection: redis,
        concurrency: config.concurrency,
        limiter: {
          max: 100,
          duration: 60000,
        },
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.worker.on('completed', (job: Job) => {
      console.log(`Order ${job.data.orderId} completed successfully`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      if (job) {
        console.log(`Order ${job.data.orderId} failed:`, err.message);
      } else {
        console.log('Worker failed:', err.message);
      }
    });

    this.worker.on('error', (err: Error) => {
      console.error('Worker error:', err);
    });

    this.worker.on('stalled', (jobId: string) => {
      console.log(`Job ${jobId} stalled`);
    });
  }

  private async processOrder(job: Job) {
    const { orderId } = job.data;
    
    try {
      const order = await this.orderExecutionService.getOrderStatus(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (order.status === 'failed' || order.status === 'confirmed') {
        return;
      }

      console.log(`[${orderId}] PENDING`);
      await this.orderExecutionService.updateOrderStatus(orderId, 'pending', 'Order received and queued');

      if (job.attemptsMade > 0) {
        await this.orderExecutionService.updateOrderStatus(orderId, 'pending', `Retrying order (attempt ${job.attemptsMade + 1}/3)`);
      }

      console.log(`[${orderId}] ROUTING`);
      await this.orderExecutionService.updateOrderStatus(orderId, 'routing', 'Comparing DEX prices');

      console.log(`[${orderId}] BUILDING`);
      await this.orderExecutionService.updateOrderStatus(orderId, 'building', 'Creating transaction');

      await this.orderExecutionService.executeOrder(orderId);
      
    } catch (error) {
      console.error(`[${orderId}] FAILED`);
      
      if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
        console.log(`Order ${orderId} failed after ${job.attemptsMade + 1} attempts`);
        await this.orderExecutionService.updateOrderStatus(orderId, 'failed', `Order failed after ${job.attemptsMade + 1} attempts: ${error instanceof Error ? error.message : String(error)}`, {
          failure_reason: error
        });

        if ((this.orderExecutionService as any).db && (this.orderExecutionService as any).db.removeActiveOrder) {
          await (this.orderExecutionService as any).db.removeActiveOrder(orderId);
        }
      }
      
      throw error;
    }
  }

  async addOrder(orderId: string, priority: number = 0) {
    try {
      const job = await this.orderQueue.add(
        'execute-order',
        { orderId },
        {
          priority,
          jobId: orderId,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      console.log(`Added order ${orderId} to queue (job ${job.id})`);
      return job;
    } catch (error) {
      console.error(`Failed to add order ${orderId} to queue:`, error);
      throw error;
    }
  }

  async getQueueStats() {
    const waiting = await this.orderQueue.getWaiting();
    const active = await this.orderQueue.getActive();
    const completed = await this.orderQueue.getCompleted();
    const failed = await this.orderQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  async getJobStatus(orderId: string) {
    const job = await this.orderQueue.getJob(orderId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
    };
  }

  async pauseQueue() {
    await this.orderQueue.pause();
    console.log('Queue paused');
  }

  async resumeQueue() {
    await this.orderQueue.resume();
    console.log('Queue resumed');
  }

  async clearQueue() {
    await this.orderQueue.obliterate({ force: true });
    console.log('Queue cleared');
  }

  async close() {
    await this.worker.close();
    await this.orderQueue.close();
    console.log('Queue service closed');
  }
}
