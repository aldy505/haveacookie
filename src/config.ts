import { z } from "zod";
import rawConfig from "../config.json";

const PrizeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().positive(),
  redeemInstructions: z.string().min(1),
});

const ConfigSchema = z.object({
  token: z.string().min(1),
  clientId: z.string().min(1),
  guildId: z.string().min(1).optional(),
  prefix: z.string().min(1),
  emoji: z.string().min(1),
  maxPerDay: z.number().int().positive(),
  databaseUrl: z.string().min(1),
  prizePurchaseAlertChannel: z.string().min(1),
  prizes: z.array(PrizeSchema),
});

export type Prize = z.infer<typeof PrizeSchema>;
export type AppConfig = z.infer<typeof ConfigSchema>;

export const config: AppConfig = ConfigSchema.parse(rawConfig);
