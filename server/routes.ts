import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, db, sqlite } from "./storage";
import { companies, contacts, insertCompanySchema, insertContactSchema, insertIntelligenceEventSchema } from "@shared/schema";
import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "./index";

function buildCompanyPayload(item: any) {
  return {
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
  };
}

async function reseedFromFile(): Promise<{ inserted: number; updated: number; total: number }> {
  const seedPath = resolve(process.cwd(), "seed-data.json");
  const rawData = readFileSync(seedPath, "utf-8");
  const seedData = JSON.parse(rawData);

  const existing = await storage.getCompanies({ limit: 100000 });
  const byName = new Map<string, any>();
  for (const c of existing.companies) {
    if (c.name) byName.set(c.name.trim().toLowerCase(), c);
  }

  let inserted = 0;
  let updated = 0;

  for (const item of seedData) {
    const payload = buildCompanyPayload(item);
    const key = (item.name || "").trim().toLowerCase();
    const existingRow = key ? byName.get(key) : undefined;

    if (existingRow) {
      await storage.updateCompany(existingRow.id, payload);
      updated++;
    } else {
      const created = await storage.seedCompany(payload);
      inserted++;
      if (item.contacts && Array.isArray(item.contacts)) {
        for (const contact of item.contacts) {
          await storage.createContact({
            companyId: created.id,
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
  }

  return { inserted, updated, total: seedData.length };
}

async function seedDatabase() {
  const companyCount = await storage.getCompanyCount();
  if (companyCount > 0) {
    log(`Database already has ${companyCount} companies, running upsert sync from seed-data.json...`);
    try {
      const result = await reseedFromFile();
      log(`Upsert sync complete: ${result.inserted} inserted, ${result.updated} updated, ${result.total} total in file.`);
    } catch (err: any) {
      log(`Upsert sync error: ${err.message}`);
    }
    return;
  }

  log("Seeding database (empty DB)...");
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
  // When evaluatorId is provided, upserts (replaces) the existing score for
  // that (judge, lens, dimension) tuple. Without evaluatorId, falls back to
  // legacy insert-only behavior so existing IIC scoring keeps working.
  app.post("/api/companies/:id/scores", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const scoreData = { ...req.body, companyId: id };
      const score = scoreData.evaluatorId
        ? await storage.upsertEvaluationScore(scoreData)
        : await storage.createEvaluationScore(scoreData);
      res.status(201).json(score);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/companies/:id/founder-session?evaluatorId=...
  app.get("/api/companies/:id/founder-session", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const evaluatorId = req.query.evaluatorId as string | undefined;
      if (!evaluatorId) {
        return res.status(400).json({ message: "evaluatorId query param required" });
      }
      const session = await storage.getFounderSession(id, evaluatorId);
      res.json(session ?? null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PUT /api/companies/:id/founder-session
  // Body: { evaluatorId, architecture?, stage? }
  app.put("/api/companies/:id/founder-session", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { evaluatorId, architecture, stage } = req.body || {};
      if (!evaluatorId) {
        return res.status(400).json({ message: "evaluatorId required" });
      }
      const session = await storage.upsertFounderSession({
        companyId: id,
        evaluatorId,
        architecture: architecture ?? null,
        stage: stage ?? null,
      });
      res.json(session);
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

  // ===== Phase 1 CRM: Interactions & Files =====
  app.get("/api/companies/:id/interactions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const interactions = await storage.getCompanyInteractions(id);
      res.json(interactions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies/:id/interactions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { date, type, notes, transcriptUrl, createdBy } = req.body || {};
      if (!date || !type) {
        return res.status(400).json({ message: "date and type are required" });
      }
      const interaction = await storage.createCompanyInteraction({
        companyId: id,
        date,
        type,
        notes: notes || null,
        transcriptUrl: transcriptUrl || null,
        createdBy: createdBy || "team",
      });
      res.status(201).json(interaction);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/companies/:id/files", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const files = await storage.getCompanyFiles(id);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Attach a Google Drive file by URL. We parse the file ID from the URL
  // (supports /file/d/ID/, /open?id=ID, /uc?id=ID, /document/d/ID, /spreadsheets/d/ID, /presentation/d/ID).
  app.post("/api/companies/:id/files", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { fileName, driveUrl, mimeType, uploadedBy } = req.body || {};
      if (!fileName || !driveUrl) {
        return res.status(400).json({ message: "fileName and driveUrl are required" });
      }
      const match = String(driveUrl).match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{10,})/);
      const driveFileId = match ? match[1] : driveUrl;
      const file = await storage.createCompanyFile({
        companyId: id,
        fileName,
        driveFileId,
        driveUrl,
        mimeType: mimeType || null,
        uploadedBy: uploadedBy || "team",
      });
      res.status(201).json(file);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Phase 2: Diligence (append-only versioned log, company-wide).
  // GET returns history (newest first). ?latest=1 returns just the most recent row.
  app.get("/api/companies/:id/diligence", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (req.query.latest === "1" || req.query.latest === "true") {
        const row = await storage.getLatestDiligenceResponse(id);
        return res.json(row || null);
      }
      const rows = await storage.getDiligenceResponses(id);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies/:id/diligence", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { responses, filledBy, notes } = req.body || {};
      if (!responses || typeof responses !== "object") {
        return res.status(400).json({ message: "responses (object) required" });
      }
      const latest = await storage.getLatestDiligenceResponse(id);
      const nextVersion = latest ? (latest.version || 0) + 1 : 1;
      const saved = await storage.createDiligenceResponse({
        companyId: id,
        version: nextVersion,
        responses: JSON.stringify(responses),
        filledBy: filledBy || "team",
        isExternal: 0,
        notes: notes || null,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Phase 2: lead source autocomplete (distinct non-empty values across companies).
  app.get("/api/lead-sources", async (_req, res) => {
    try {
      const sources = await storage.getDistinctLeadSources();
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Phase 2: Decile export — clean JSON bundle for a company.
  app.get("/api/companies/:id/export/decile", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getCompany(id);
      if (!company) return res.status(404).json({ message: "Company not found" });

      const [scores, interactions, files, diligence] = await Promise.all([
        storage.getEvaluationScores(id),
        storage.getCompanyInteractions(id),
        storage.getCompanyFiles(id),
        storage.getLatestDiligenceResponse(id),
      ]);

      // Group scores by lensType for readability.
      const scoresByLens: Record<string, any[]> = {};
      for (const s of scores) {
        const lens = (s as any).lensType || "unknown";
        if (!scoresByLens[lens]) scoresByLens[lens] = [];
        scoresByLens[lens].push(s);
      }

      // Parse diligence responses JSON for the export (keep raw too).
      let diligenceParsed: any = null;
      if (diligence) {
        let parsed: any = null;
        try { parsed = JSON.parse(diligence.responses); } catch { parsed = diligence.responses; }
        diligenceParsed = {
          version: diligence.version,
          filledBy: diligence.filledBy,
          updatedAt: diligence.updatedAt,
          responses: parsed,
          notes: diligence.notes,
        };
      }

      res.json({
        exportedAt: new Date().toISOString(),
        format: "iiv-decile-v1",
        company,
        scoresByLens,
        diligence: diligenceParsed,
        interactions,
        files,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Lightweight pipeline status update on the company itself.
  app.patch("/api/companies/:id/pipeline", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { pipelineStatus, leadSource } = req.body || {};
      const updates: any = {};
      if (typeof pipelineStatus === "string") updates.pipelineStatus = pipelineStatus;
      if (typeof leadSource === "string") updates.leadSource = leadSource;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Provide pipelineStatus or leadSource" });
      }
      const updated = await storage.updateCompany(id, updates);
      if (!updated) return res.status(404).json({ message: "Company not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin: targeted row deletions for cleaning test data.
  // Internal-only portal; no auth gate added. Useful for occasional maintenance.
  // ---------------------------------------------------------------------------
  app.delete("/api/admin/diligence/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = sqlite.prepare("DELETE FROM diligence_responses WHERE id = ?").run(id);
      res.json({ deleted: result.changes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/interactions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = sqlite.prepare("DELETE FROM company_interactions WHERE id = ?").run(id);
      res.json({ deleted: result.changes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/files/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = sqlite.prepare("DELETE FROM company_files WHERE id = ?").run(id);
      res.json({ deleted: result.changes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/scores/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = sqlite.prepare("DELETE FROM evaluation_scores WHERE id = ?").run(id);
      res.json({ deleted: result.changes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
