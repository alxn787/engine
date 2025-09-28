/**
 * Manual WebSocket Test
 * 
 * This script provides a manual way to test WebSocket functionality
 * without requiring a full test framework setup.
 */

const WebSocket = require('ws');

const BASE_URL = process.env.TEST_URL || 'ws://localhost:3000';
const ORDER_ID = process.argv[2] || 'test-order-123';

console.log(`🔌 Connecting to WebSocket: ${BASE_URL}/api/orders/stream?orderId=${ORDER_ID}`);

const ws = new WebSocket(`${BASE_URL}/api/orders/stream?orderId=${ORDER_ID}`);

ws.on('open', function open() {
  console.log('✅ WebSocket connected successfully!');
  console.log('📡 Listening for order status updates...');
  console.log('💡 Send "ping" to test ping/pong functionality');
  console.log('🛑 Press Ctrl+C to disconnect\n');
});

ws.on('message', function message(data) {
  try {
    const update = JSON.parse(data.toString());
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`[${timestamp}] 📨 Received:`, {
      type: update.type || 'order_update',
      status: update.status,
      message: update.message,
      orderId: update.orderId,
      ...(update.txHash && { txHash: update.txHash }),
      ...(update.executedPrice && { executedPrice: update.executedPrice }),
      ...(update.error && { error: update.error })
    });
  } catch (error) {
    console.log(`[${new Date().toLocaleTimeString()}] 📨 Raw message:`, data.toString());
  }
});

ws.on('close', function close(code, reason) {
  console.log(`\n🔌 WebSocket disconnected (code: ${code}, reason: ${reason})`);
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

// Handle user input for ping/pong testing
process.stdin.setEncoding('utf8');
process.stdin.on('readable', function() {
  const chunk = process.stdin.read();
  if (chunk !== null) {
    const input = chunk.trim();
    
    if (input === 'ping') {
      console.log('🏓 Sending ping...');
      ws.send(JSON.stringify({ type: 'ping' }));
    } else if (input === 'close') {
      console.log('🔌 Closing connection...');
      ws.close();
    } else if (input === 'help') {
      console.log('\n📋 Available commands:');
      console.log('  ping  - Send ping message');
      console.log('  close - Close connection');
      console.log('  help  - Show this help');
      console.log('  Ctrl+C - Exit\n');
    } else if (input !== '') {
      console.log('❓ Unknown command. Type "help" for available commands.');
    }
  }
});

// Show help on startup
console.log('📋 Available commands:');
console.log('  ping  - Send ping message');
console.log('  close - Close connection');
console.log('  help  - Show this help');
console.log('  Ctrl+C - Exit\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  ws.close();
  process.exit(0);
});
