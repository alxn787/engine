import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { DatabaseConfig, RedisConfig } from '../types/index.js';

export class DatabaseService {
  private pool: Pool;
  private redis: Redis;

  constructor(dbConfig: DatabaseConfig, redisConfig: RedisConfig) {
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      maxRetriesPerRequest: null,
    });

    this.initializeTables();
  }

  private async initializeTables() {
    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(36) PRIMARY KEY,
        type VARCHAR(20) NOT NULL,
        token_in VARCHAR(20) NOT NULL,
        token_out VARCHAR(20) NOT NULL,
        amount_in DECIMAL(20, 8) NOT NULL,
        amount_out DECIMAL(20, 8),
        slippage_tolerance DECIMAL(5, 4),
        user_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP,
        tx_hash VARCHAR(100),
        executed_price DECIMAL(20, 8),
        failure_reason TEXT,
        retry_count INTEGER DEFAULT 0
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `;

    try {
      await this.pool.query(createOrdersTable);
      await this.pool.query(createIndexes);
      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database tables:', error);
      throw error;
    }
  }

  async saveOrder(order: any) {
    const query = `
      INSERT INTO orders (
        id, type, token_in, token_out, amount_in, amount_out, 
        slippage_tolerance, user_id, status, created_at, updated_at, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        executed_at = EXCLUDED.executed_at,
        tx_hash = EXCLUDED.tx_hash,
        executed_price = EXCLUDED.executed_price,
        failure_reason = EXCLUDED.failure_reason,
        retry_count = EXCLUDED.retry_count
    `;

    const values = [
      order.id,
      order.type,
      order.tokenIn,
      order.tokenOut,
      order.amountIn,
      order.amountOut,
      order.slippageTolerance,
      order.userId,
      order.status,
      order.createdAt,
      order.updatedAt,
      order.retryCount
    ];

    await this.pool.query(query, values);
  }

  async updateOrderStatus(orderId: string, status: string, updates: any = {}) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const query = `
      UPDATE orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP${setClause ? `, ${setClause}` : ''}
      WHERE id = $${Object.keys(updates).length + 2}
    `;

    const values = [status, ...Object.values(updates), orderId];
    await this.pool.query(query, values);
  }

  async getOrder(orderId: string) {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [orderId]);
    const row = result.rows[0];
    if (!row) return null;
    
    return {
      id: row.id,
      type: row.type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      ...(row.amount_out && { amountOut: parseFloat(row.amount_out) }),
      ...(row.slippage_tolerance && { slippageTolerance: parseFloat(row.slippage_tolerance) }),
      userId: row.user_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.executed_at && { executedAt: row.executed_at }),
      ...(row.tx_hash && { txHash: row.tx_hash }),
      ...(row.executed_price && { executedPrice: parseFloat(row.executed_price) }),
      ...(row.failure_reason && { failureReason: row.failure_reason }),
      retryCount: row.retry_count
    };
  }

  async getOrdersByUser(userId: string, limit = 50) {
    const query = `
      SELECT * FROM orders 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userId, limit]);
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      ...(row.amount_out && { amountOut: parseFloat(row.amount_out) }),
      ...(row.slippage_tolerance && { slippageTolerance: parseFloat(row.slippage_tolerance) }),
      userId: row.user_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.executed_at && { executedAt: row.executed_at }),
      ...(row.tx_hash && { txHash: row.tx_hash }),
      ...(row.executed_price && { executedPrice: parseFloat(row.executed_price) }),
      ...(row.failure_reason && { failureReason: row.failure_reason }),
      retryCount: row.retry_count
    }));
  }

  async getActiveOrders() {
    const query = `
      SELECT * FROM orders 
      WHERE status IN ('pending', 'routing', 'building', 'submitted')
      ORDER BY created_at ASC
    `;
    const result = await this.pool.query(query);
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      ...(row.amount_out && { amountOut: parseFloat(row.amount_out) }),
      ...(row.slippage_tolerance && { slippageTolerance: parseFloat(row.slippage_tolerance) }),
      userId: row.user_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.executed_at && { executedAt: row.executed_at }),
      ...(row.tx_hash && { txHash: row.tx_hash }),
      ...(row.executed_price && { executedPrice: parseFloat(row.executed_price) }),
      ...(row.failure_reason && { failureReason: row.failure_reason }),
      retryCount: row.retry_count
    }));
  }

  async setActiveOrder(orderId: string, order: any) {
    await this.redis.setex(`active_order:${orderId}`, 3600, JSON.stringify(order));
  }

  async getActiveOrder(orderId: string) {
    const result = await this.redis.get(`active_order:${orderId}`);
    return result ? JSON.parse(result) : null;
  }

  async removeActiveOrder(orderId: string) {
    await this.redis.del(`active_order:${orderId}`);
  }

  async getAllActiveOrders() {
    const keys = await this.redis.keys('active_order:*');
    if (keys.length === 0) return [];
    
    const orders = await this.redis.mget(keys);
    return orders
      .filter(order => order !== null)
      .map(order => JSON.parse(order!));
  }

  async clearTestData() {
    // Clear all test data
    await this.pool.query('DELETE FROM orders');
    await this.redis.flushdb();
  }

  async initialize() {
    // Ensure tables are created
    await this.initializeTables();
  }

  async close() {
    await this.pool.end();
    await this.redis.quit();
  }
}
