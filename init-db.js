#!/usr/bin/env node

import { Pool } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'order_engine',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

async function initializeDatabase() {
  const pool = new Pool(dbConfig);
  
  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1'); // Test connection
    console.log('Database connection successful');
    
    console.log('Creating orders table...');
    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(36) PRIMARY KEY,
        type VARCHAR(20) NOT NULL,
        token_in VARCHAR(20) NOT NULL,
        token_out VARCHAR(20) NOT NULL,
        amount_in DECIMAL(20, 8) NOT NULL,
        amount_out DECIMAL(20, 8),
        slippage_tolerance DECIMAL(5, 4),
        user_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP,
        tx_hash VARCHAR(100),
        executed_price DECIMAL(20, 8),
        failure_reason TEXT,
        retry_count INTEGER DEFAULT 0
      );
    `;
    
    await pool.query(createOrdersTable);
    console.log('Orders table created successfully');
    
    console.log('Creating indexes...');
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `;
    
    await pool.query(createIndexes);
    console.log('Indexes created successfully');
    
    console.log('Database initialization completed successfully!');
    
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the initialization
initializeDatabase();

