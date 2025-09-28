#!/usr/bin/env node

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function testWebSocketBroadcast() {
  console.log('WebSocket Broadcast Test');
  console.log('========================\n');

  try {
    // Step 1: Connect to test WebSocket to receive all order updates
    console.log('1. Connecting to test WebSocket...');
    const ws = new WebSocket(`${WS_URL}/api/orders/test-ws`);

    ws.on('open', () => {
      console.log('Test WebSocket connected!');
      console.log('Listening for ALL order updates...\n');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'connection_established') {
          console.log('Test connection established');
          console.log(`Connection ID: ${message.connectionId}\n`);
        } else if (message.type === 'order_update') {
          console.log('Order Update Received:');
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
          if (message.error) {
            console.log(`   Error: ${message.error}`);
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
      console.log('Test WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('Test WebSocket error:', error);
    });

    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Create multiple orders to see broadcasts
    console.log('2. Creating test orders...\n');
    
    const orders = [];
    for (let i = 1; i <= 3; i++) {
      console.log(`Creating order ${i}...`);
      const response = await fetch(`${BASE_URL}/api/orders/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'market',
          tokenIn: 'USDC',
          tokenOut: 'ETH',
          amountIn: 100 * i, // Different amounts
          userId: `test_user_${i}`,
          slippageTolerance: 0.01
        })
      });

      const orderData = await response.json();
      if (orderData.success) {
        orders.push(orderData.orderId);
        console.log(`   Order ${i} created: ${orderData.orderId}`);
      } else {
        console.log(`   Order ${i} failed: ${orderData.error}`);
      }
      
      // Small delay between orders
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\nCreated ${orders.length} orders. Watch for real-time updates above!\n`);

    // Step 3: Send ping to test connection
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('Sending ping to test connection...');
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 2000);

    // Step 4: Wait for all orders to complete
    console.log('Waiting for orders to complete (30 seconds)...\n');
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log('\nFinal order statuses:');
    for (const orderId of orders) {
      try {
        const statusResponse = await fetch(`${BASE_URL}/api/orders/${orderId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.success) {
          const order = statusData.order;
          console.log(`   ${orderId}: ${order.status} ${order.txHash ? `(${order.txHash})` : ''}`);
        }
      } catch (error) {
        console.log(`   ${orderId}: Error checking status`);
      }
    }

    ws.close();
    console.log('\nTest completed! You should have seen real-time order updates above.');

  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

testWebSocketBroadcast()
  .then(() => {
    console.log('\nWebSocket broadcast test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  });
