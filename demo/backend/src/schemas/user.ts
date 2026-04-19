import { z } from 'zod';

export const UserSchema = z.object({
  createdAt: z.string().datetime(),
  email: z.string().email(),
  id: z.string().uuid(),
  name: z.string().min(1),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({ createdAt: true, id: true });
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial();
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
