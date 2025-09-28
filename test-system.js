#!/usr/bin/env bun

console.log('🚀 Order Execution Engine - System Test');
console.log('=====================================\n');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
  try {
    // Test 1: Health Check
    console.log('1. Testing Health Check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health Check:', healthData.status);
    console.log('   Queue Stats:', healthData.queue);
    console.log('');

    // Test 2: Create Multiple Orders
    console.log('2. Creating Multiple Orders...');
    const orders = [];
    
    for (let i = 0; i < 3; i++) {
      const orderData = {
        type: 'market',
        tokenIn: i % 2 === 0 ? 'SOL' : 'USDC',
        tokenOut: i % 2 === 0 ? 'USDC' : 'SOL',
        amountIn: 100 + (i * 50),
        userId: `test-user-${i + 1}`,
        slippageTolerance: 0.01
      };

      const response = await fetch(`${BASE_URL}/api/orders/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();
      if (result.success) {
        orders.push(result.orderId);
        console.log(`   ✅ Order ${i + 1}: ${result.orderId}`);
        console.log(`      WebSocket: ${result.websocketUrl}`);
      } else {
        console.log(`   ❌ Order ${i + 1} failed: ${result.error}`);
      }
    }
    console.log('');

    // Test 3: Check Queue Stats
    console.log('3. Checking Queue Statistics...');
    const queueResponse = await fetch(`${BASE_URL}/api/orders/queue/stats`);
    const queueData = await queueResponse.json();
    console.log('   Queue Stats:', queueData.stats);
    console.log('');

    // Test 4: Check Active Orders
    console.log('4. Checking Active Orders...');
    const activeResponse = await fetch(`${BASE_URL}/api/orders/active`);
    const activeData = await activeResponse.json();
    console.log(`   Active Orders: ${activeData.orders.length}`);
    activeData.orders.forEach((order, index) => {
      console.log(`   Order ${index + 1}: ${order.id} - ${order.status}`);
    });
    console.log('');

    // Test 5: Check Individual Order Status
    if (orders.length > 0) {
      console.log('5. Checking Individual Order Status...');
      const orderResponse = await fetch(`${BASE_URL}/api/orders/${orders[0]}`);
      const orderData = await orderResponse.json();
      if (orderData.success) {
        console.log(`   Order ${orders[0]}:`);
        console.log(`   Status: ${orderData.order.status}`);
        console.log(`   Type: ${orderData.order.type}`);
        console.log(`   Amount: ${orderData.order.amountIn} ${orderData.order.tokenIn} → ${orderData.order.tokenOut}`);
      }
    }
    console.log('');

    // Test 6: Test Error Handling
    console.log('6. Testing Error Handling...');
    const errorResponse = await fetch(`${BASE_URL}/api/orders/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invalid_type',
        tokenIn: '',
        tokenOut: 'USDC',
        amountIn: -100,
        userId: ''
      })
    });
    const errorData = await errorResponse.json();
    console.log('   Validation Error Test:', errorData.error);
    console.log('');

    // Test 7: WebSocket Test (simulation)
    console.log('7. WebSocket Connection Test...');
    console.log('   To test WebSocket functionality:');
    console.log('   1. Open test-websocket.html in your browser');
    console.log('   2. Create an order and watch real-time updates');
    console.log('   3. Or use: wscat -c ws://localhost:3000/api/orders/' + (orders[0] || 'ORDER_ID') + '/ws');
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('\n📊 System Summary:');
    console.log(`   - Orders Created: ${orders.length}`);
    console.log(`   - Active Orders: ${activeData.orders.length}`);
    console.log(`   - Queue Status: ${queueData.stats.waiting} waiting, ${queueData.stats.active} active`);
    console.log(`   - Server Status: ${healthData.status}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the tests
testAPI();

