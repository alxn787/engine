import { DexQuote, ExecutionResult, Order } from '../types/index.js';
import { IDexRouter } from '../interfaces/dex-router.interface.js';

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
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    await this.sleep(2000 + Math.random() * 100);
    
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
    await this.sleep(2000 + Math.random() * 100);
    
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
    console.log(`Fetching quotes for ${amount} ${tokenIn} → ${tokenOut}`);
    
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amount),
      this.getMeteoraQuote(tokenIn, tokenOut, amount),
    ]);

    const raydiumEffectivePrice = raydiumQuote.price * (1 - raydiumQuote.fee);
    const meteoraEffectivePrice = meteoraQuote.price * (1 - meteoraQuote.fee);

    const bestQuote = raydiumEffectivePrice > meteoraEffectivePrice ? raydiumQuote : meteoraQuote;
    
    console.log(`Raydium: ${raydiumQuote.price.toFixed(6)} (fee: ${raydiumQuote.fee})`);
    console.log(`Meteora: ${meteoraQuote.price.toFixed(6)} (fee: ${meteoraQuote.fee})`);
    console.log(`Selected: ${bestQuote.dex} with effective price: ${bestQuote.price.toFixed(6)}`);
    
    return bestQuote;
  }

  async executeSwap(quote: DexQuote, order: Order): Promise<ExecutionResult> {
    console.log(`Executing swap on ${quote.dex} for order ${order.id}`);
    
    const executionTime = 2000 + Math.random() * 1000;
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
    } else if (Math.random() < 0.15) {
      shouldFail = true;
      const errorMessages = [
        'Insufficient liquidity',
        'Slippage too high',
        'Network congestion',
        'Transaction timeout',
        'DEX temporarily unavailable'
      ];
      failureReason = errorMessages[Math.floor(Math.random() * errorMessages.length)]!;
    }
    
    if (shouldFail) {
      console.log(`Swap execution failed: ${failureReason}`);
      return {
        success: false,
        error: failureReason,
        txHash: undefined as any,
        executedPrice: 0
      };
    }
    
    const slippage = Math.random() * 0.005;
    const executedPrice = quote.price * (1 - slippage);
    
    return {
      success: true,
      txHash: this.generateMockTxHash(),
      executedPrice,
      slippage,
    };
  }

  updateBasePrice(tokenIn: string, tokenOut: string, newPrice: number) {
    const pair = `${tokenIn}-${tokenOut}`;
    this.basePrices.set(pair, newPrice);
    console.log(`Updated base price for ${pair}: ${newPrice}`);
  }
}
