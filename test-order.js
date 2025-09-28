#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('Starting server...');

// Start the server
const server = spawn('bun', ['run', 'src/index.ts'], {
  cwd: '/Users/alenalex/Desktop/enginenew',
  stdio: ['pipe', 'pipe', 'pipe']
});

// Capture server output
server.stdout.on('data', (data) => {
  console.log(`[SERVER] ${data.toString()}`);
});

server.stderr.on('data', (data) => {
  console.log(`[SERVER ERROR] ${data.toString()}`);
});

// Wait for server to start
await setTimeout(3000);

console.log('\n=== Making test order ===');

// Make a test order
const orderData = {
  type: 'market',
  tokenIn: 'USDC',
  tokenOut: 'ETH',
  amountIn: 1000,
  amountOut: 0.5,
  slippageTolerance: 0.01,
  userId: 'test-user-queue'
};

try {
  const response = await fetch('http://localhost:3000/api/orders/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderData)
  });
  
  const result = await response.json();
  console.log('Order created:', result);
  
  // Wait a bit to see processing logs
  await setTimeout(2000);
  
  // Check queue stats
  const statsResponse = await fetch('http://localhost:3000/api/orders/queue/stats');
  const stats = await statsResponse.json();
  console.log('Queue stats:', stats);
  
  // Check order status
  const orderResponse = await fetch(`http://localhost:3000/api/orders/${result.orderId}`);
  const order = await orderResponse.json();
  console.log('Order status:', order);
  
} catch (error) {
  console.error('Error making order:', error);
}

// Clean up
server.kill();
