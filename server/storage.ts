import {
  type Company, type InsertCompany, companies,
  type Contact, type InsertContact, contacts,
  type IntelligenceEvent, type InsertIntelligenceEvent, intelligenceEvents,
  type Tag, type InsertTag, tags,
  companyTags,
  type EvaluationScore, type InsertEvaluationScore, evaluationScores,
  type LensConfiguration, type InsertLensConfiguration, lensConfigurations,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { eq, like, or, desc, asc, sql, count, inArray } from "drizzle-orm";

// DB_PATH allows pointing the SQLite file at a persistent disk on Render.
// Default to ./data.db in the working directory for local dev.
const dbPath = process.env.DB_PATH || "data.db";
const dbDir = path.dirname(dbPath);
if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
// On first boot with a fresh persistent disk, seed from bundled data.db if present.
if (!fs.existsSync(dbPath) && fs.existsSync("data.db") && path.resolve(dbPath) !== path.resolve("data.db")) {
  fs.copyFileSync("data.db", dbPath);
  console.log(`[storage] Seeded ${dbPath} from bundled data.db`);
}
const sqlite = new Database(dbPath);

// Ensure required tables exist (idempotent). Safety net for fresh deploys
// or older databases that pre-date the evaluation lenses schema.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS evaluation_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    lens_type TEXT NOT NULL,
    dimension TEXT NOT NULL,
    score REAL NOT NULL,
    evaluator_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS lens_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lens_type TEXT NOT NULL,
    custom_weights TEXT,
    is_default INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Companies
  getCompanies(filters?: any): Promise<{ companies: Company[]; total: number }>;
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<void>;

  // Contacts
  getContacts(companyId: number): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;

  // Intelligence Events
  getEvents(companyId: number): Promise<IntelligenceEvent[]>;
  createEvent(event: InsertIntelligenceEvent): Promise<IntelligenceEvent>;

  // Tags
  getTags(): Promise<Tag[]>;
  addTagToCompany(companyId: number, tagName: string): Promise<void>;

  // Stats
  getStats(): Promise<any>;

  // Filters
  getFilterValues(): Promise<any>;

  // Search
  searchCompanies(query: string): Promise<Company[]>;

  // Compare
  getCompaniesByIds(ids: number[]): Promise<Company[]>;

  // Seeding
  getCompanyCount(): Promise<number>;
  seedCompany(company: InsertCompany): Promise<Company>;

  // Evaluation Lenses (Phase 1+)
  getEvaluationScores(companyId: number, lensType?: string): Promise<EvaluationScore[]>;
  createEvaluationScore(score: InsertEvaluationScore): Promise<EvaluationScore>;
  getLensConfiguration(lensType: string): Promise<LensConfiguration | undefined>;
  saveLensConfiguration(config: InsertLensConfiguration): Promise<LensConfiguration>;
  getEvaluationLeaderboard(lensType: string): Promise<any>;
  getEvaluationSummary(): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getCompanies(filters?: any): Promise<{ companies: Company[]; total: number }> {
    let query = db.select().from(companies);
    const conditions: any[] = [];

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conditions.push(
        or(
          like(companies.name, s),
          like(companies.description, s),
          like(companies.category, s)
        )
      );
    }
    if (filters?.year) {
      conditions.push(eq(companies.competitionYear, parseInt(filters.year)));
    }
    if (filters?.status) {
      conditions.push(like(companies.competitionStatus, filters.status));
    }
    if (filters?.maStatus) {
      conditions.push(like(companies.maStatus, `%${filters.maStatus}%`));
    }
    if (filters?.category) {
      conditions.push(eq(companies.category, filters.category));
    }
    if (filters?.workflow) {
      conditions.push(like(companies.workflowPrimary, `%${filters.workflow}%`));
    }
    if (filters?.aiRole) {
      conditions.push(like(companies.aiPrimary, `%${filters.aiRole}%`));
    }
    if (filters?.dataModality) {
      conditions.push(like(companies.dataModalities, `%${filters.dataModality}%`));
    }
    if (filters?.businessModel) {
      conditions.push(like(companies.businessModel, `%${filters.businessModel}%`));
    }

    // Build where clause
    let whereClause: any = undefined;
    if (conditions.length === 1) {
      whereClause = conditions[0];
    } else if (conditions.length > 1) {
      // AND all conditions
      whereClause = conditions[0];
      for (let i = 1; i < conditions.length; i++) {
        whereClause = sql`${whereClause} AND ${conditions[i]}`;
      }
    }

    // Get total count
    const countQuery = db.select({ count: count() }).from(companies);
    let totalResult;
    if (whereClause) {
      totalResult = countQuery.where(whereClause).get();
    } else {
      totalResult = countQuery.get();
    }
    const total = totalResult?.count || 0;

    // Build full query with sorting and pagination
    let fullQuery;
    if (whereClause) {
      fullQuery = db.select().from(companies).where(whereClause);
    } else {
      fullQuery = db.select().from(companies);
    }

    // Sorting
    const sortField = filters?.sort || 'name';
    const sortOrder = filters?.order === 'desc' ? desc : asc;
    switch (sortField) {
      case 'year':
        fullQuery = fullQuery.orderBy(sortOrder(companies.competitionYear));
        break;
      case 'revenue':
        fullQuery = fullQuery.orderBy(sortOrder(companies.estimatedRevenue));
        break;
      case 'employees':
        fullQuery = fullQuery.orderBy(sortOrder(companies.employeeCount));
        break;
      default:
        fullQuery = fullQuery.orderBy(sortOrder(companies.name));
    }

    // Pagination
    const page = parseInt(filters?.page || '1');
    const limit = parseInt(filters?.limit || '20');
    const offset = (page - 1) * limit;
    fullQuery = fullQuery.limit(limit).offset(offset);

    const result = fullQuery.all();
    return { companies: result, total };
  }

  async getCompany(id: number): Promise<Company | undefined> {
    return db.select().from(companies).where(eq(companies.id, id)).get();
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    return db.insert(companies).values(company).returning().get();
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined> {
    return db.update(companies).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(companies.id, id)).returning().get();
  }

  async deleteCompany(id: number): Promise<void> {
    db.delete(contacts).where(eq(contacts.companyId, id)).run();
    db.delete(intelligenceEvents).where(eq(intelligenceEvents.companyId, id)).run();
    db.delete(companies).where(eq(companies.id, id)).run();
  }

  async getContacts(companyId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.companyId, companyId)).all();
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    return db.insert(contacts).values(contact).returning().get();
  }

  async getEvents(companyId: number): Promise<IntelligenceEvent[]> {
    return db.select().from(intelligenceEvents).where(eq(intelligenceEvents.companyId, companyId)).orderBy(desc(intelligenceEvents.createdAt)).all();
  }

  async createEvent(event: InsertIntelligenceEvent): Promise<IntelligenceEvent> {
    return db.insert(intelligenceEvents).values(event).returning().get();
  }

  async getTags(): Promise<Tag[]> {
    return db.select().from(tags).all();
  }

  async addTagToCompany(companyId: number, tagName: string): Promise<void> {
    let tag = db.select().from(tags).where(eq(tags.name, tagName)).get();
    if (!tag) {
      tag = db.insert(tags).values({ name: tagName }).returning().get();
    }
    db.insert(companyTags).values({ companyId, tagId: tag.id }).run();
  }

  async getStats(): Promise<any> {
    const totalCompanies = db.select({ count: count() }).from(companies).get()?.count || 0;

    const byYear = db.select({
      year: companies.competitionYear,
      count: count(),
    }).from(companies).groupBy(companies.competitionYear).orderBy(asc(companies.competitionYear)).all();

    const byStatus = db.select({
      status: companies.competitionStatus,
      count: count(),
    }).from(companies).groupBy(companies.competitionStatus).all();

    const byCategory = db.select({
      category: companies.category,
      count: count(),
    }).from(companies).groupBy(companies.category).all();

    const byMaStatus = db.select({
      maStatus: companies.maStatus,
      count: count(),
    }).from(companies).groupBy(companies.maStatus).all();

    const byWorkflow = db.select({
      workflow: companies.workflowPrimary,
      count: count(),
    }).from(companies).groupBy(companies.workflowPrimary).all();

    // Calculate aggregate stats
    const winners = db.select({ count: count() }).from(companies)
      .where(eq(companies.competitionStatus, 'Winner')).get()?.count || 0;

    const withFunding = db.select({ count: count() }).from(companies)
      .where(sql`${companies.capitalRaised} IS NOT NULL AND ${companies.capitalRaised} != ''`).get()?.count || 0;

    const totalRevenue = db.select({ total: sql<number>`SUM(${companies.estimatedRevenue})` })
      .from(companies).get()?.total || 0;

    const activeCompanies = db.select({ count: count() }).from(companies)
      .where(sql`${companies.maStatus} NOT LIKE '%defunct%' AND ${companies.maStatus} NOT LIKE '%out of business%' AND ${companies.maStatus} NOT LIKE '%no longer%'`).get()?.count || 0;

    return {
      totalCompanies,
      winners,
      activeCompanies,
      totalRevenue,
      withFunding,
      byYear: byYear.filter(y => y.year !== null),
      byStatus: byStatus.filter(s => s.status !== null),
      byCategory: byCategory.filter(c => c.category !== null),
      byMaStatus: byMaStatus.filter(m => m.maStatus !== null),
      byWorkflow: byWorkflow.filter(w => w.workflow !== null),
    };
  }

  async getFilterValues(): Promise<any> {
    const years = db.selectDistinct({ value: companies.competitionYear }).from(companies).where(sql`${companies.competitionYear} IS NOT NULL`).orderBy(asc(companies.competitionYear)).all();
    const statuses = db.selectDistinct({ value: companies.competitionStatus }).from(companies).where(sql`${companies.competitionStatus} IS NOT NULL`).all();
    const categories = db.selectDistinct({ value: companies.category }).from(companies).where(sql`${companies.category} IS NOT NULL`).all();
    const maStatuses = db.selectDistinct({ value: companies.maStatus }).from(companies).where(sql`${companies.maStatus} IS NOT NULL`).all();
    const companyTypes = db.selectDistinct({ value: companies.companyType }).from(companies).where(sql`${companies.companyType} IS NOT NULL`).all();
    const workflows = db.selectDistinct({ value: companies.workflowPrimary }).from(companies).where(sql`${companies.workflowPrimary} IS NOT NULL`).all();
    const aiRoles = db.selectDistinct({ value: companies.aiPrimary }).from(companies).where(sql`${companies.aiPrimary} IS NOT NULL`).all();
    const dataModalities = db.selectDistinct({ value: companies.dataModalities }).from(companies).where(sql`${companies.dataModalities} IS NOT NULL`).all();
    const businessModels = db.selectDistinct({ value: companies.businessModel }).from(companies).where(sql`${companies.businessModel} IS NOT NULL`).all();

    return {
      years: years.map(y => y.value),
      statuses: statuses.map(s => s.value),
      categories: categories.map(c => c.value),
      maStatuses: maStatuses.map(m => m.value),
      companyTypes: companyTypes.map(t => t.value),
      workflows: workflows.map(w => w.value),
      aiRoles: aiRoles.map(a => a.value),
      dataModalities: dataModalities.map(d => d.value),
      businessModels: businessModels.map(b => b.value),
    };
  }

  async searchCompanies(query: string): Promise<Company[]> {
    const s = `%${query}%`;
    return db.select().from(companies).where(
      or(
        like(companies.name, s),
        like(companies.description, s),
        like(companies.category, s),
        like(companies.companyType, s),
        like(companies.workflowPrimary, s),
        like(companies.aiPrimary, s),
        like(companies.dataModalities, s),
        like(companies.businessModel, s),
        like(companies.notes, s),
        like(companies.currentStatus, s),
        like(companies.maStatus, s),
        like(companies.howItWorks, s),
        like(companies.businessNeed, s),
        like(companies.buyerPrimary, s),
        like(companies.jtbdPrimary, s),
      )
    ).limit(50).all();
  }

  async getCompaniesByIds(ids: number[]): Promise<Company[]> {
    if (ids.length === 0) return [];
    return db.select().from(companies).where(inArray(companies.id, ids)).all();
  }

  async getCompanyCount(): Promise<number> {
    return db.select({ count: count() }).from(companies).get()?.count || 0;
  }

  async seedCompany(company: InsertCompany): Promise<Company> {
    return db.insert(companies).values(company).returning().get();
  }

  // Evaluation Lenses (Phase 1+)
  async getEvaluationScores(companyId: number, lensType?: string): Promise<EvaluationScore[]> {
    let query = db.select().from(evaluationScores).where(eq(evaluationScores.companyId, companyId));
    if (lensType) {
      query = query.where(eq(evaluationScores.lensType, lensType));
    }
    return query.orderBy(desc(evaluationScores.createdAt)).all();
  }

  async createEvaluationScore(score: InsertEvaluationScore): Promise<EvaluationScore> {
    return db.insert(evaluationScores).values(score).returning().get();
  }

  async getLensConfiguration(lensType: string): Promise<LensConfiguration | undefined> {
    return db.select().from(lensConfigurations)
      .where(eq(lensConfigurations.lensType, lensType))
      .get();
  }

  async saveLensConfiguration(config: InsertLensConfiguration): Promise<LensConfiguration> {
    const existing = await this.getLensConfiguration(config.lensType);
    if (existing) {
      return db.update(lensConfigurations)
        .set({ customWeights: config.customWeights, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(lensConfigurations.lensType, config.lensType))
        .returning().get();
    }
    return db.insert(lensConfigurations).values(config).returning().get();
  }

  async getEvaluationLeaderboard(lensType: string): Promise<any> {
    // For each company that has scores in this lens, get the latest score per dimension and aggregate
    const allScores = db.select().from(evaluationScores)
      .where(eq(evaluationScores.lensType, lensType))
      .orderBy(desc(evaluationScores.createdAt))
      .all();

    // Group by company, then by dimension - take only the latest score per dimension
    const byCompany = new Map<number, Map<string, EvaluationScore>>();
    for (const s of allScores) {
      if (!byCompany.has(s.companyId)) byCompany.set(s.companyId, new Map());
      const dimMap = byCompany.get(s.companyId)!;
      if (!dimMap.has(s.dimension)) dimMap.set(s.dimension, s); // first hit = latest due to desc order
    }

    const companyIds = Array.from(byCompany.keys());
    if (companyIds.length === 0) return { lensType, entries: [] };

    const companyRecords = db.select().from(companies)
      .where(inArray(companies.id, companyIds))
      .all();
    const companyMap = new Map(companyRecords.map(c => [c.id, c]));

    const entries = companyIds.map(cid => {
      const c = companyMap.get(cid);
      const dimMap = byCompany.get(cid)!;
      const dimensions = Array.from(dimMap.values()).map(s => ({
        dimension: s.dimension,
        score: s.score,
        notes: s.notes,
        evaluatorId: s.evaluatorId,
        updatedAt: s.createdAt,
      }));
      const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
      const dimensionCount = dimensions.length;
      const lastUpdated = dimensions.reduce((latest, d) => {
        return (d.updatedAt && (!latest || d.updatedAt > latest)) ? d.updatedAt : latest;
      }, null as string | null);
      return {
        companyId: cid,
        companyName: c?.name || "Unknown",
        category: c?.category || null,
        competitionStatus: c?.competitionStatus || null,
        competitionYear: c?.competitionYear || null,
        companyType: c?.companyType || null,
        totalScore,
        dimensionCount,
        dimensions,
        lastUpdated,
      };
    });

    // Sort by total score descending
    entries.sort((a, b) => b.totalScore - a.totalScore);
    return { lensType, entries };
  }

  async getEvaluationSummary(): Promise<any> {
    const allScores = db.select().from(evaluationScores).all();
    const byLens = new Map<string, { companies: Set<number>; scoreCount: number; sumScore: number }>();
    const evaluatedCompanies = new Set<number>();

    for (const s of allScores) {
      evaluatedCompanies.add(s.companyId);
      if (!byLens.has(s.lensType)) {
        byLens.set(s.lensType, { companies: new Set(), scoreCount: 0, sumScore: 0 });
      }
      const entry = byLens.get(s.lensType)!;
      entry.companies.add(s.companyId);
      entry.scoreCount++;
      entry.sumScore += s.score;
    }

    const totalCompanies = db.select({ c: count() }).from(companies).get()?.c || 0;

    const lensSummary = Array.from(byLens.entries()).map(([lensType, data]) => ({
      lensType,
      companiesEvaluated: data.companies.size,
      totalScores: data.scoreCount,
      averageScore: data.scoreCount > 0 ? data.sumScore / data.scoreCount : 0,
    }));

    return {
      totalCompanies,
      evaluatedCompanies: evaluatedCompanies.size,
      coveragePercent: totalCompanies > 0 ? Math.round((evaluatedCompanies.size / totalCompanies) * 100) : 0,
      totalScoresRecorded: allScores.length,
      byLens: lensSummary,
    };
  }
}

export const storage = new DatabaseStorage();
