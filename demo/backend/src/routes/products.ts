import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { products } from '../data/store';
import { CreateProductSchema, ProductSchema, UpdateProductSchema } from '../schemas/product';

const router: Router = Router();

router.get('/', (_req, res) => {
  res.json(products);
});

router.get('/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});

router.post('/', (req, res) => {
  const parsed = CreateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.issues);
    return;
  }
  const newProduct = {
    id: randomUUID(),
    ...parsed.data,
  };
  const product = ProductSchema.parse(newProduct);
  products.push(product);
  res.status(201).json(product);
});

router.patch('/:id', (req, res) => {
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const parsed = UpdateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.issues);
    return;
  }
  const existing = products[index] as (typeof products)[number];
  products[index] = { ...existing, ...parsed.data };
  res.json(products[index]);
});

router.delete('/:id', (req, res) => {
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  products.splice(index, 1);
  res.status(204).send();
});

export default router;
