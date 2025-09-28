export interface Order {
  id: string;
  type: 'market' | 'limit' | 'sniper';
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  slippageTolerance?: number;
  userId: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  txHash?: string;
  executedPrice?: number;
  failureReason?: string;
  retryCount: number;
}

export type OrderStatus = 
  | 'pending' 
  | 'routing' 
  | 'building' 
  | 'submitted' 
  | 'confirmed' 
  | 'failed';

export interface DexQuote {
  dex: 'raydium' | 'meteora';
  price: number;
  fee: number;
  liquidity: number;
  estimatedSlippage: number;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  executedPrice?: number;
  slippage?: number;
  error?: string;
}

export interface OrderExecutionRequest {
  type: 'market' | 'limit' | 'sniper';
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut?: number;
  slippageTolerance?: number;
  userId: string;
}

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  message: string;
  timestamp: Date;
  txHash?: string;
  executedPrice?: number;
  error?: string;
}

export interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  maxRetryDelay: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}
