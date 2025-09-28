import { DexQuote, ExecutionResult, Order } from './index.js';

export interface IDexRouter {
  getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote>;
  getMeteoraQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote>;
  getBestQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote>;
  executeSwap(quote: DexQuote, order: Order): Promise<ExecutionResult>;
}
