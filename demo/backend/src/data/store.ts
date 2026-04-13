import type { Product } from '../schemas/product.js';
import type { User } from '../schemas/user.js';

export const users: User[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    createdAt: '2024-01-15T10:30:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Bob Smith',
    email: 'bob@example.com',
    createdAt: '2024-02-20T14:45:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Carol White',
    email: 'carol@example.com',
    createdAt: '2024-03-10T09:15:00.000Z',
  },
];

export const products: Product[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440010',
    name: 'Laptop',
    price: 999.99,
    description: 'High-performance laptop',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440011',
    name: 'Mouse',
    price: 29.99,
    description: 'Wireless mouse',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440012',
    name: 'Keyboard',
    price: 79.99,
    description: 'Mechanical keyboard',
  },
];
