import { DexQuote, ExecutionResult, Order } from '../types/index.js';
import { IDexRouter } from '../types/dex-router.interface.js';

export class MockDexRouter implements IDexRouter {
  private basePrices: Map<string, number> = new Map();

  constructor() {
    this.basePrices.set('SOL-USDC', 100);
    this.basePrices.set('USDC-SOL', 0.01);
    this.basePrices.set('SOL-USDT', 100);
    this.basePrices.set('USDT-SOL', 0.01);
  }

  private getBasePrice(tokenIn: string, tokenOut: string): number {
    const pair = `${tokenIn}-${tokenOut}`;
    const reversePair = `${tokenOut}-${tokenIn}`;
    
    if (this.basePrices.has(pair)) {
      return this.basePrices.get(pair)!;
    }
    
    if (this.basePrices.has(reversePair)) {
      return 1 / this.basePrices.get(reversePair)!;
    }
    
    return 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateMockTxHash(): string {
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).substr(2, 32);
    const dex = Math.random() > 0.5 ? 'raydium' : 'meteora';
    const dexPrefix = dex === 'raydium' ? 'ray' : 'met';
    
    return `0x${dexPrefix}${timestamp}${random}`.toLowerCase();
  }

  async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    await this.sleep(100 + Math.random() * 50);
    
    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const priceVariation = 0.98 + Math.random() * 0.04;
    const price = basePrice * priceVariation;
    
    return {
      dex: 'raydium',
      price,
      fee: 0.003,
      liquidity: 1000000 + Math.random() * 500000,
      estimatedSlippage: Math.random() * 0.01,
    };
  }

  async getMeteoraQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    await this.sleep(100 + Math.random() * 50);
    
    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const priceVariation = 0.97 + Math.random() * 0.05;
    const price = basePrice * priceVariation;
    
    return {
      dex: 'meteora',
      price,
      fee: 0.002,
      liquidity: 800000 + Math.random() * 400000,
      estimatedSlippage: Math.random() * 0.015,
    };
  }

  async getBestQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amount),
      this.getMeteoraQuote(tokenIn, tokenOut, amount),
    ]);

    const raydiumEffectivePrice = raydiumQuote.price * (1 - raydiumQuote.fee);
    const meteoraEffectivePrice = meteoraQuote.price * (1 - meteoraQuote.fee);

    const bestQuote = raydiumEffectivePrice > meteoraEffectivePrice ? raydiumQuote : meteoraQuote;
    
    return bestQuote;
  }

  async executeSwap(quote: DexQuote, order: Order): Promise<ExecutionResult> {
    const executionTime = 50 + Math.random() * 25;
    await this.sleep(executionTime);
    
    let shouldFail = false;
    let failureReason = '';
    
    if (order.tokenIn === 'INVALID_TOKEN' || order.tokenOut === 'INVALID_TOKEN') {
      shouldFail = true;
      failureReason = 'Invalid token pair';
    } else if (order.amountIn <= 0) {
      shouldFail = true;
      failureReason = 'Invalid amount (must be positive)';
    } else if (order.amountIn > 1000) {
      shouldFail = true;
      failureReason = 'Amount too large (exceeds limit)';
    } else if (Math.random() < 0.05) {
      shouldFail = true;
      const errorMessages = [
        'Insufficient liquidity',
        'Network congestion',
        'Transaction timeout',
        'DEX temporarily unavailable'
      ];
      failureReason = errorMessages[Math.floor(Math.random() * errorMessages.length)]!;
    }
    
    if (shouldFail) {
      return {
        success: false,
        error: failureReason,
        txHash: undefined as any,
        executedPrice: 0
      };
    }

    const baseSlippage = Math.random() * 0.002; 
    const sizeImpact = Math.min(order.amountIn / 20000, 0.005); 
    const marketVolatility = Math.random() * 0.001; 
    
    const actualSlippage = baseSlippage + sizeImpact + marketVolatility;
    const maxAllowedSlippage = order.slippageTolerance || 0.01;
    
    if (actualSlippage > 0.05) {
      return {
        success: false,
        error: `Slippage extremely high: ${(actualSlippage * 100).toFixed(3)}% exceeds maximum of 5%`,
        txHash: undefined as any,
        executedPrice: 0
      };
    }
    
    const executedPrice = quote.price * (1 - actualSlippage);
    
    const txHash = this.generateMockTxHash();
    
    return {
      success: true,
      txHash,
      executedPrice,
      slippage: actualSlippage,
    };
  }

  updateBasePrice(tokenIn: string, tokenOut: string, newPrice: number) {
    const pair = `${tokenIn}-${tokenOut}`;
    this.basePrices.set(pair, newPrice);
  }

  getExecutionDetails(quote: DexQuote, order: Order, result: ExecutionResult) {
    return {
      dex: quote.dex,
      quotePrice: quote.price,
      fee: quote.fee,
      liquidity: quote.liquidity,
      estimatedSlippage: quote.estimatedSlippage,
      actualSlippage: result.slippage,
      slippageTolerance: order.slippageTolerance || 0.01,
      executedPrice: result.executedPrice,
      txHash: result.txHash,
      success: result.success,
      error: result.error
    };
  }
}
