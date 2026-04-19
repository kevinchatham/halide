import { z } from 'zod';

export const ProductSchema: z.ZodObject<z.ZodRawShape> = z.object({
  description: z.string().optional(),
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema: z.ZodObject<z.ZodRawShape> = ProductSchema.omit({ id: true });
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema: z.ZodObject<z.ZodRawShape> = CreateProductSchema.partial();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
