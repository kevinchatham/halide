import cors from 'cors';
import express from 'express';
import productsRouter from './routes/products.js';
import usersRouter from './routes/users.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);

app.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});
