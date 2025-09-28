#!/usr/bin/env node

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function demonstrateHttpToWebSocketPattern() {
  console.log('HTTP → WebSocket Pattern Demo');
  console.log('==============================\n');

  try {
    // Step 1: Create order via HTTP POST
    console.log('1. Creating order via HTTP POST...');
    const orderResponse = await fetch(`${BASE_URL}/api/orders/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'market',
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountIn: 1000,
        userId: 'demo_user',
        slippageTolerance: 0.01
      })
    });

    const orderData = await orderResponse.json();
    
    if (!orderData.success) {
      throw new Error(`Order creation failed: ${orderData.error}`);
    }

    const orderId = orderData.orderId;
    console.log(`Order created: ${orderId}`);
    console.log(`Status: ${orderData.status}`);
    console.log(`WebSocket URL: ${orderData.websocketUrl}`);
    console.log(`Upgrade Instructions:`, orderData.upgradeInstructions);
    console.log('');

    // Step 2: Connect to WebSocket for real-time updates
    console.log('2. Connecting to WebSocket for real-time updates...');
    const wsUrl = `${WS_URL}/api/orders/stream?orderId=${orderId}`;
    console.log(`Connecting to: ${wsUrl}\n`);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('WebSocket connected successfully!');
      console.log('Listening for order updates...\n');
    });

    ws.on('message', (data) => {
      try {
        const update = JSON.parse(data.toString());
        
        if (update.type === 'connection_established') {
          console.log(`Connection established for order: ${update.orderId}`);
          console.log(`Current status: ${update.currentOrderStatus}`);
          console.log('');
        } else if (update.type === 'pong') {
          console.log('Pong received - connection alive');
        } else {
          // Order status update
          console.log(`Order Update:`);
          console.log(`   Order ID: ${update.orderId}`);
          console.log(`   Status: ${update.status}`);
          console.log(`   Message: ${update.message}`);
          console.log(`   Timestamp: ${update.timestamp}`);
          
          if (update.txHash) {
            console.log(`   Transaction Hash: ${update.txHash}`);
          }
          if (update.executedPrice) {
            console.log(`   Executed Price: ${update.executedPrice}`);
          }
          if (update.error) {
            console.log(`   Error: ${update.error}`);
          }
          console.log('');
          
          // Close connection when order is complete
          if (update.status === 'confirmed' || update.status === 'failed') {
            console.log(`Order ${update.status}! Closing WebSocket connection.`);
            setTimeout(() => {
              ws.close();
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Step 3: Send ping to test connection
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('Sending ping to test connection...');
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 3000);

    // Step 4: Check final status via HTTP GET
    setTimeout(async () => {
      console.log('\n3. Checking final order status via HTTP GET...');
      try {
        const statusResponse = await fetch(`${BASE_URL}/api/orders/${orderId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.success) {
          const order = statusData.order;
          console.log(`Final Order Status:`);
          console.log(`   ID: ${order.id}`);
          console.log(`   Status: ${order.status}`);
          console.log(`   Created: ${order.createdAt}`);
          console.log(`   Updated: ${order.updatedAt}`);
          
          if (order.txHash) {
            console.log(`   Transaction Hash: ${order.txHash}`);
          }
          if (order.executedPrice) {
            console.log(`   Executed Price: ${order.executedPrice}`);
          }
          if (order.executedAt) {
            console.log(`   Executed At: ${order.executedAt}`);
          }
          if (order.failureReason) {
            console.log(`   Failure Reason: ${order.failureReason}`);
          }
        }
      } catch (error) {
        console.error('Error checking final status:', error);
      }
    }, 15000);

  } catch (error) {
    console.error('Demo failed:', error.message);
    process.exit(1);
  }
}

// Run the demo
demonstrateHttpToWebSocketPattern()
  .then(() => {
    console.log('\nHTTP → WebSocket pattern demo completed!');
  })
  .catch((error) => {
    console.error('\nDemo failed:', error.message);
    process.exit(1);
  });
