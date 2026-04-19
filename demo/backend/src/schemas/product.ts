import { z } from 'zod';

export const ProductSchema = z.object({
  description: z.string().optional(),
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = ProductSchema.omit({ id: true });
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
