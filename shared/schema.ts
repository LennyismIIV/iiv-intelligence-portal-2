import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  website: text("website"),
  category: text("category"),
  companyType: text("company_type"),
  competitionStatus: text("competition_status"),
  competitionYear: integer("competition_year"),
  competitionEvent: text("competition_event"),
  yearFounded: integer("year_founded"),
  employeeCount: integer("employee_count"),
  estimatedRevenue: real("estimated_revenue"),
  maStatus: text("ma_status"),
  capitalRaised: text("capital_raised"),
  estimatedValuation: real("estimated_valuation"),
  gen2Relationship: text("gen2_relationship"),
  currentStatus: text("current_status"),
  notes: text("notes"),
  howItWorks: text("how_it_works"),
  businessNeed: text("business_need"),
  businessPotential: text("business_potential"),
  caseStudy: text("case_study"),
  workflowPrimary: text("workflow_primary"),
  workflowSecondary: text("workflow_secondary"),
  dataModalities: text("data_modalities"),
  aiPrimary: text("ai_primary"),
  aiSecondary: text("ai_secondary"),
  businessModel: text("business_model"),
  revenueStage: text("revenue_stage"),
  jtbdPrimary: text("jtbd_primary"),
  jtbdSecondary: text("jtbd_secondary"),
  buyerPrimary: text("buyer_primary"),
  marketsServed: text("markets_served"),
  keyCustomers: text("key_customers"),
  technologyStack: text("technology_stack"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  phone: text("phone"),
  isPrimary: integer("is_primary").default(0),
});

export const intelligenceEvents = sqliteTable("intelligence_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  sourceUrl: text("source_url"),
  sourceDate: text("source_date"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const companyTags = sqliteTable("company_tags", {
  companyId: integer("company_id").references(() => companies.id),
  tagId: integer("tag_id").references(() => tags.id),
});

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
});

export const insertIntelligenceEventSchema = createInsertSchema(intelligenceEvents).omit({
  id: true,
  createdAt: true,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
});

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type IntelligenceEvent = typeof intelligenceEvents.$inferSelect;
export type InsertIntelligenceEvent = z.infer<typeof insertIntelligenceEventSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

// Evaluation Lenses Schema (Phase 1+)
export const evaluationScores = sqliteTable("evaluation_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  lensType: text("lens_type").notNull(), // 'iic', 'thesis', 'momentum', etc.
  dimension: text("dimension").notNull(),
  score: real("score").notNull(),
  evaluatorId: text("evaluator_id"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const lensConfigurations = sqliteTable("lens_configurations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lensType: text("lens_type").notNull(),
  customWeights: text("custom_weights"), // JSON string of weights
  isDefault: integer("is_default").default(0),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Insert schemas
export const insertEvaluationScoreSchema = createInsertSchema(evaluationScores).omit({
  id: true,
  createdAt: true,
});

export const insertLensConfigurationSchema = createInsertSchema(lensConfigurations).omit({
  id: true,
  updatedAt: true,
});

// Types
export type EvaluationScore = typeof evaluationScores.$inferSelect;
export type InsertEvaluationScore = z.infer<typeof insertEvaluationScoreSchema>;
export type LensConfiguration = typeof lensConfigurations.$inferSelect;
export type InsertLensConfiguration = z.infer<typeof insertLensConfigurationSchema>;
