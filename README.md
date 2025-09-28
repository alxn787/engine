# Order Execution Engine

A high-performance order execution engine with DEX routing and WebSocket status updates, built with Bun, TypeScript, Fastify, and BullMQ.

## 🚀 Features

- **Order Types**: Market orders with DEX routing (Raydium & Meteora simulation)
- **Real-time Updates**: WebSocket status streaming for order lifecycle
- **Concurrent Processing**: Queue system managing up to 10 concurrent orders
- **DEX Routing**: Automatic price comparison and best execution venue selection
- **Retry Logic**: Exponential back-off retry (≤3 attempts) with failure handling
- **Database Persistence**: PostgreSQL for historical data, Redis for active orders
- **High Throughput**: Process 100 orders/minute with rate limiting

## 🏗️ Architecture

### Order Execution Flow

1. **Order Submission**: User submits order via POST `/api/orders/execute`
2. **Validation**: API validates order and returns `orderId`
3. **WebSocket Upgrade**: Same HTTP connection upgrades to WebSocket for live updates
4. **DEX Routing**: System fetches quotes from both Raydium and Meteora pools
5. **Price Comparison**: Selects best execution venue based on price/liquidity
6. **Execution**: Routes order to chosen DEX with slippage protection
7. **Status Updates**: Real-time WebSocket updates throughout the process

### Status Lifecycle

- `pending` - Order received and queued
- `routing` - Comparing DEX prices
- `building` - Creating transaction
- `submitted` - Transaction sent to network
- `confirmed` - Transaction successful (includes txHash)
- `failed` - If any step fails (includes error)

## 🛠️ Tech Stack

- **Runtime**: Bun (JavaScript runtime)
- **Framework**: Fastify with WebSocket support
- **Queue**: BullMQ with Redis
- **Database**: PostgreSQL + Redis
- **Language**: TypeScript
- **Testing**: Bun test framework

## 📦 Installation

### Prerequisites

- [Bun](https://bun.sh) installed
- PostgreSQL running
- Redis running

### Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd order-execution-engine
   bun install
   ```

2. **Environment configuration**:
   ```bash
   cp env.example .env
   # Edit .env with your database and Redis credentials
   ```

3. **Start services with Docker**:
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Run the application**:
   ```bash
   # Development
   bun run dev
   
   # Production
   bun run start
   ```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

## 📡 API Endpoints

### Order Management

- `POST /api/orders/execute` - Create and execute order
- `GET /api/orders/:orderId` - Get order status
- `GET /api/orders/user/:userId` - Get user orders
- `GET /api/orders/active` - Get active orders
- `GET /api/orders/queue/stats` - Get queue statistics

### System

- `GET /health` - Health check with queue stats
- `GET /` - API information

### WebSocket

- `ws://localhost:3000/api/orders/:orderId/ws` - Real-time order status updates

## 🔌 WebSocket Usage

The API supports HTTP to WebSocket upgrade for real-time order tracking:

```javascript
// 1. Create order via HTTP POST
const response = await fetch('http://localhost:3000/api/orders/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'market',
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amountIn: 100,
    userId: 'user123'
  })
});

const { orderId } = await response.json();

// 2. Upgrade to WebSocket for live updates
const ws = new WebSocket(`ws://localhost:3000/api/orders/${orderId}/ws`);

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Order status:', update);
  // Handle: pending → routing → building → submitted → confirmed
};
```

## 📊 Order Types

### Market Order (Implemented)
- **Why chosen**: Most common order type, immediate execution at current market price
- **Extension**: Limit orders can be added by implementing price monitoring, and sniper orders by adding token launch detection

### Extension to Other Order Types

**Limit Orders**: Add price monitoring service that checks current market price against target price and triggers execution when conditions are met.

**Sniper Orders**: Integrate with token launch detection services and add pre-configured execution parameters for new token pairs.

## 🏃‍♂️ Performance

- **Concurrency**: Up to 10 orders processed simultaneously
- **Throughput**: 100 orders per minute
- **Retry Logic**: Exponential back-off with max 3 attempts
- **Queue Management**: BullMQ with Redis for reliable job processing
- **Database**: Optimized queries with proper indexing

## 🐳 Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## 📋 Postman Collection

Import the included Postman collection (`postman/Order-Execution-Engine.postman_collection.json`) to test all API endpoints with pre-configured requests.

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=order_engine
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue
QUEUE_CONCURRENCY=10
QUEUE_MAX_RETRIES=3
QUEUE_RETRY_DELAY=2000
```

## 🚨 Error Handling

- **Validation Errors**: 400 Bad Request with detailed error messages
- **Order Not Found**: 404 Not Found
- **Server Errors**: 500 Internal Server Error
- **Retry Logic**: Automatic retry with exponential back-off
- **Failure Persistence**: Failed orders logged with reason for analysis

## 📈 Monitoring

- **Health Check**: `/health` endpoint with queue statistics
- **Queue Stats**: Real-time queue status and processing metrics
- **Order Tracking**: Complete order lifecycle with timestamps
- **Error Logging**: Comprehensive error tracking and reporting

## 🔒 Security Considerations

- Input validation with Zod schemas
- SQL injection prevention with parameterized queries
- Rate limiting on queue processing
- WebSocket connection management
- Error message sanitization

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📞 Support

For issues and questions, please open an issue in the repository or contact the development team.

