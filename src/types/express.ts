declare global {
  namespace Express {
    interface Request {
      claims?: unknown;
    }
  }
}
