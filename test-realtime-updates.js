#!/usr/bin/env node

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

console.log('Real-time Order Updates Test');
console.log('============================\n');

// Connect to test WebSocket
const ws = new WebSocket(`${WS_URL}/api/orders/test-ws`);

let updateCount = 0;

ws.on('open', () => {
  console.log('WebSocket connected!');
  console.log('Listening for real-time order updates...\n');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'connection_established') {
      console.log('Connection established');
      console.log(`Connection ID: ${message.connectionId}\n`);
    } else if (message.type === 'order_update') {
      updateCount++;
      console.log(`Update #${updateCount}:`);
      console.log(`   Order ID: ${message.orderId}`);
      console.log(`   Status: ${message.status}`);
      console.log(`   Message: ${message.message}`);
      console.log(`   Timestamp: ${message.timestamp}`);
      
      if (message.txHash) {
        console.log(`   Transaction Hash: ${message.txHash}`);
      }
      if (message.executedPrice) {
        console.log(`   Executed Price: ${message.executedPrice}`);
      }
      console.log('');
    } else if (message.type === 'pong') {
      console.log('Pong received - connection alive');
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Wait for connection to establish
setTimeout(async () => {
  console.log('Creating test order...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/orders/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'market',
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountIn: 500,
        userId: 'realtime_test',
        slippageTolerance: 0.01
      })
    });

    const orderData = await response.json();
    
    if (orderData.success) {
      console.log(`Order created: ${orderData.orderId}`);
      console.log('Watch for real-time updates above!\n');
    } else {
      console.log(`Order creation failed: ${orderData.error}`);
    }
  } catch (error) {
    console.error('Error creating order:', error);
  }
}, 1000);

// Keep the connection open for 15 seconds
setTimeout(() => {
  console.log(`\nTest completed! Received ${updateCount} real-time updates.`);
  console.log('Closing connection...');
  ws.close();
}, 15000);
