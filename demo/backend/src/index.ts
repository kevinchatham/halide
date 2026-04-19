import cors from 'cors';
import express from 'express';
import productsRouter from './routes/products';
import usersRouter from './routes/users';

const app: express.Express = express();
const PORT: string | number = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);

app.listen(PORT, () => {
  // biome-ignore lint/suspicious/noConsole: demo backend startup log
  console.log(`Mock server running on port ${PORT}`);
});
