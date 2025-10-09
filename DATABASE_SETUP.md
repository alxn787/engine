# Database Setup

This document explains how to set up the database for the Order Execution Engine.

## Prerequisites

1. PostgreSQL database server running
2. Redis server running (for caching and queues)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=order_engine
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Test Database Configuration (optional)
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=order_engine_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=password

TEST_REDIS_HOST=localhost
TEST_REDIS_PORT=6379
TEST_REDIS_PASSWORD=
```

## Database Initialization

### Option 1: Using npm scripts (Recommended)

```bash
# Install dependencies
npm install

# Initialize database with TypeScript
npm run init-db

# Or initialize with JavaScript
npm run init-db:js
```

### Option 2: Manual execution

```bash
# TypeScript version
bun run init-db.ts

# JavaScript version
node init-db.js
```

## Database Schema

The initialization script creates the following table:

### `orders` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(36) | Primary key (UUID) |
| `type` | VARCHAR(20) | Order type (market, limit, sniper) |
| `token_in` | VARCHAR(20) | Input token symbol |
| `token_out` | VARCHAR(20) | Output token symbol |
| `amount_in` | DECIMAL(20, 8) | Input amount |
| `amount_out` | DECIMAL(20, 8) | Expected output amount (optional) |
| `slippage_tolerance` | DECIMAL(5, 4) | Maximum slippage tolerance |
| `user_id` | VARCHAR(100) | User identifier |
| `status` | VARCHAR(20) | Order status |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `executed_at` | TIMESTAMP | Execution timestamp (optional) |
| `tx_hash` | VARCHAR(100) | Transaction hash (optional) |
| `executed_price` | DECIMAL(20, 8) | Actual execution price (optional) |
| `failure_reason` | TEXT | Failure reason (optional) |
| `retry_count` | INTEGER | Number of retry attempts |

### Indexes

- `idx_orders_user_id` - Index on user_id for user queries
- `idx_orders_status` - Index on status for status-based queries
- `idx_orders_created_at` - Index on created_at for time-based queries

## Verification

After running the initialization script, you can verify the setup by:

1. Checking the table exists:
   ```sql
   \dt orders
   ```

2. Checking the indexes:
   ```sql
   \d orders
   ```

3. Running the test suite:
   ```bash
   npm test
   ```

## Troubleshooting

### Connection Issues

- Ensure PostgreSQL is running on the specified host and port
- Verify the database credentials in your `.env` file
- Check that the database exists (create it if it doesn't)

### Permission Issues

- Ensure the database user has CREATE TABLE permissions
- For production, use a dedicated database user with minimal required permissions

### Port Conflicts

- Default PostgreSQL port is 5432
- Default Redis port is 6379
- Adjust ports in your `.env` file if needed

