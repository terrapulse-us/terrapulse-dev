import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { conversations } from "./conversations";

export interface AssistantItineraryDay {
  day: number;
  driveTime?: string;
  trailWindow?: string;
  weatherNote?: string;
  campground?: string;
}

export interface AssistantItinerary {
  title: string;
  days: AssistantItineraryDay[];
}

export interface AssistantCoverageWarning {
  trailId: string;
  trailTitle: string;
  lat: number;
  lng: number;
  level: "patchy" | "poor";
  note: string;
}

export interface AssistantStructuredData {
  itinerary?: AssistantItinerary;
  coverageWarning?: AssistantCoverageWarning;
}

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolsUsed: jsonb("tools_used").$type<string[]>(),
  structuredData: jsonb("structured_data").$type<AssistantStructuredData>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
