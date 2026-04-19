import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { users } from '../data/store';
import { CreateUserSchema, UpdateUserSchema, UserSchema } from '../schemas/user';

const router = Router();

router.get('/', (_req, res) => {
  res.json(users);
});

router.get('/:id', (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

router.post('/', (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.issues);
    return;
  }
  const newUser = {
    id: randomUUID(),
    ...parsed.data,
    createdAt: new Date().toISOString(),
  };
  const user = UserSchema.parse(newUser);
  users.push(user);
  res.status(201).json(user);
});

router.patch('/:id', (req, res) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.issues);
    return;
  }
  const existing = users[index] as (typeof users)[number];
  users[index] = { ...existing, ...parsed.data };
  res.json(users[index]);
});

router.delete('/:id', (req, res) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  users.splice(index, 1);
  res.status(204).send();
});

export default router;
