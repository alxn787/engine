#!/usr/bin/env node

const BASE_URL = 'http://localhost:3000';

async function testSimpleOrderFlow() {
  console.log('Simple Order Execution Test');
  console.log('============================\n');

  try {
    console.log('1. Creating order...');
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
        userId: 'test_simple_flow'
      })
    });

    const orderData = await orderResponse.json();
    
    if (!orderData.success) {
      throw new Error(`Order creation failed: ${orderData.error}`);
    }

    const orderId = orderData.orderId;
    console.log(`Order created: ${orderId}`);
    console.log(`Status: ${orderData.status}\n`);

    console.log('2. Monitoring order execution...');
    console.log('   (Check server logs for detailed execution progress)\n');

    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`${BASE_URL}/api/orders/${orderId}`);
      const statusData = await statusResponse.json();
      
      if (statusData.success) {
        const order = statusData.order;
        console.log(`[${orderId}] Current Status: ${order.status.toUpperCase()}`);
        
        if (order.status === 'confirmed') {
          console.log(`Order completed successfully!`);
          console.log(`   Transaction Hash: ${order.txHash || 'N/A'}`);
          console.log(`   Executed Price: ${order.executedPrice || 'N/A'}`);
          break;
        } else if (order.status === 'failed') {
          console.log(`Order failed: ${order.failureReason || 'Unknown error'}`);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log('Test timeout - order did not complete within 30 seconds');
    }

    console.log('\n3. Final order details:');
    const finalResponse = await fetch(`${BASE_URL}/api/orders/${orderId}`);
    const finalData = await finalResponse.json();
    
    if (finalData.success) {
      const order = finalData.order;
      console.log(`   ID: ${order.id}`);
      console.log(`   Type: ${order.type}`);
      console.log(`   Token Pair: ${order.tokenIn} → ${order.tokenOut}`);
      console.log(`   Amount: ${order.amountIn} ${order.tokenIn}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log(`   Updated: ${order.updatedAt}`);
      
      if (order.txHash) {
        console.log(`   Transaction Hash: ${order.txHash}`);
      }
      if (order.executedPrice) {
        console.log(`   Executed Price: ${order.executedPrice}`);
      }
      if (order.failureReason) {
        console.log(`   Failure Reason: ${order.failureReason}`);
      }
    }

    console.log('\nTest completed!');
    console.log('Check server logs above for detailed execution progress with status updates.');

  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

testSimpleOrderFlow()
  .then(() => {
    console.log('\nSimple order execution test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  });
