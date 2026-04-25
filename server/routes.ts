import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { companies, contacts, insertCompanySchema, insertContactSchema, insertIntelligenceEventSchema } from "@shared/schema";
import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "./index";

async function seedDatabase() {
  const companyCount = await storage.getCompanyCount();
  if (companyCount > 0) {
    log(`Database already has ${companyCount} companies, skipping seed.`);
    return;
  }

  log("Seeding database...");
  try {
    const seedPath = resolve(process.cwd(), "seed-data.json");
    const rawData = readFileSync(seedPath, "utf-8");
    const seedData = JSON.parse(rawData);

    for (const item of seedData) {
      const company = await storage.seedCompany({
        name: item.name || "",
        description: item.description || null,
        website: item.website || null,
        category: item.category || null,
        companyType: item.company_type || null,
        competitionStatus: item.competition_status || null,
        competitionYear: item.competition_year || null,
        competitionEvent: item.competition_event || null,
        yearFounded: item.year_founded || null,
        employeeCount: item.employee_count || null,
        estimatedRevenue: item.estimated_revenue || null,
        maStatus: item.ma_status || null,
        capitalRaised: item.capital_raised || null,
        estimatedValuation: item.estimated_valuation || null,
        gen2Relationship: item.gen2_relationship || null,
        currentStatus: item.current_status || null,
        notes: item.notes || null,
        howItWorks: item.how_it_works || null,
        businessNeed: item.business_need || null,
        businessPotential: item.business_potential || null,
        caseStudy: item.case_study || null,
        workflowPrimary: item.workflow_primary || null,
        workflowSecondary: item.workflow_secondary || null,
        dataModalities: item.data_modalities || null,
        aiPrimary: item.ai_primary || null,
        aiSecondary: item.ai_secondary || null,
        businessModel: item.business_model || null,
        revenueStage: item.revenue_stage || null,
        jtbdPrimary: item.jtbd_primary || null,
        jtbdSecondary: item.jtbd_secondary || null,
        buyerPrimary: item.buyer_primary || null,
        marketsServed: null,
        keyCustomers: null,
        technologyStack: null,
      });

      // Insert contacts
      if (item.contacts && Array.isArray(item.contacts)) {
        for (const contact of item.contacts) {
          await storage.createContact({
            companyId: company.id,
            firstName: contact.first_name || null,
            lastName: contact.last_name || null,
            email: contact.email || null,
            title: contact.title || null,
            linkedinUrl: null,
            phone: null,
            isPrimary: 0,
          });
        }
      }
    }

    log(`Seeded ${seedData.length} companies.`);
  } catch (err: any) {
    log(`Seed error: ${err.message}`);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed on startup
  await seedDatabase();

  // GET /api/companies
  app.get("/api/companies", async (req, res) => {
    try {
      const result = await storage.getCompanies(req.query);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/companies/:id
  app.get("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getCompany(id);
      if (!company) return res.status(404).json({ message: "Company not found" });
      const companyContacts = await storage.getContacts(id);
      const events = await storage.getEvents(id);
      res.json({ ...company, contacts: companyContacts, events });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/companies
  app.post("/api/companies", async (req, res) => {
    try {
      const parsed = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(parsed);
      res.status(201).json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // PATCH /api/companies/:id
  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.updateCompany(id, req.body);
      if (!company) return res.status(404).json({ message: "Company not found" });
      res.json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // DELETE /api/companies/:id
  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCompany(id);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/companies/:id/contacts
  app.get("/api/companies/:id/contacts", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.getContacts(id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/companies/:id/contacts
  app.post("/api/companies/:id/contacts", async (req, res) => {
    try {
      const parsed = insertContactSchema.parse({ ...req.body, companyId: parseInt(req.params.id) });
      const contact = await storage.createContact(parsed);
      res.status(201).json(contact);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/companies/:id/events
  app.get("/api/companies/:id/events", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.getEvents(id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/companies/:id/events
  app.post("/api/companies/:id/events", async (req, res) => {
    try {
      const parsed = insertIntelligenceEventSchema.parse({ ...req.body, companyId: parseInt(req.params.id) });
      const event = await storage.createEvent(parsed);
      res.status(201).json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/stats
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/search
  app.get("/api/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const result = await storage.searchCompanies(q);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/filters
  app.get("/api/filters", async (_req, res) => {
    try {
      const filters = await storage.getFilterValues();
      res.json(filters);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/compare
  app.get("/api/compare", async (req, res) => {
    try {
      const idsStr = (req.query.ids as string) || "";
      const ids = idsStr.split(",").map(Number).filter(n => !isNaN(n));
      const result = await storage.getCompaniesByIds(ids);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/companies/:id/tags
  app.post("/api/companies/:id/tags", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name } = req.body;
      await storage.addTagToCompany(id, name);
      res.status(201).json({ message: "Tag added" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/tags
  app.get("/api/tags", async (_req, res) => {
    try {
      const result = await storage.getTags();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Evaluation Lenses API (Phase 1+)
  // GET /api/companies/:id/scores
  app.get("/api/companies/:id/scores", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lensType = req.query.lens as string | undefined;
      const scores = await storage.getEvaluationScores(id, lensType);
      res.json(scores);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/companies/:id/scores
  app.post("/api/companies/:id/scores", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const scoreData = { ...req.body, companyId: id };
      const score = await storage.createEvaluationScore(scoreData);
      res.status(201).json(score);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/lenses/:type/config
  app.get("/api/lenses/:type/config", async (req, res) => {
    try {
      const config = await storage.getLensConfiguration(req.params.type);
      res.json(config || { lensType: req.params.type, customWeights: null, isDefault: 1 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/lenses/:type/config
  app.post("/api/lenses/:type/config", async (req, res) => {
    try {
      const config = await storage.saveLensConfiguration({
        lensType: req.params.type,
        customWeights: JSON.stringify(req.body.weights || {}),
        isDefault: 0,
      });
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/evaluations/leaderboard - Cross-company aggregated scores
  app.get("/api/evaluations/leaderboard", async (req, res) => {
    try {
      const lensType = (req.query.lens as string) || "iic";
      const result = await storage.getEvaluationLeaderboard(lensType);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/evaluations/summary - High-level stats across all evaluations
  app.get("/api/evaluations/summary", async (req, res) => {
    try {
      const result = await storage.getEvaluationSummary();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
