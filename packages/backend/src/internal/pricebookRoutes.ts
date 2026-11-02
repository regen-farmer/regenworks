// /internal/pricebook: Grove team only (mounted behind requireRole("grove-team")
// in routes/internal.ts). Prices never leave these routes for other users.
import express from "express";
import multer from "multer";
import PricebookVersion from "@rw/db/schemas/internal/pricebookVersion.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import {
  buildPricebook,
  isOutdated,
  matchSalesPrices,
  matchSupplierPrices,
  norm,
  PRICEBOOK_FILES,
  suggestPrice,
  type PlantQuery,
  type PricebookData,
} from "./pricebook.ts";
import { priceService } from "./services.ts";
import { priceOverview } from "./priceOverview.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 6, fields: 5, fieldSize: 2000, parts: 12 },
}).fields([...Object.values(PRICEBOOK_FILES), "settings.csv", "services.csv"].map((name) => ({ name, maxCount: 1 })));

/** Upload problems (too big, unexpected file) as a clear 400/413, not a 500. */
function parseUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).send({ error: `Upload refused: ${err.message}${err.field ? ` (${err.field})` : ""}` });
      return;
    }
    next(err);
  });
}

// The active version is the newest; cached per process by version number.
let cache: { version: number; data: PricebookData & { version: number; importedAt: Date } } | null = null;

export async function activePricebook() {
  const latest: any = await PricebookVersion.findOne().sort({ version: -1 }).select("version").lean();
  if (!latest) return null;
  if (cache?.version === latest.version) return cache.data;
  const doc: any = await PricebookVersion.findOne({ version: latest.version }).lean();
  if (!doc) return null;
  cache = { version: doc.version, data: doc };
  return doc as PricebookData & { version: number; importedAt: Date };
}

export async function pricebookVersion(version: number) {
  if (cache?.version === version) return cache.data;
  return (await PricebookVersion.findOne({ version }).lean()) as any;
}

function summary(doc: any) {
  return {
    version: doc.version,
    importedAt: doc.importedAt,
    note: doc.note,
    counts: doc.counts,
    settings: doc.settings ?? {},
    warnings: doc.warnings ?? [],
    suppliers: doc.suppliers,
    documents: (doc.documents ?? []).map((d: any) => ({ ...d, outdated: isOutdated(d.documentDate) })),
  };
}

router.get("/", async (_req: Req, res) => {
  const doc = await activePricebook();
  if (!doc) {
    res.send({ version: null });
    return;
  }
  res.send(summary(doc));
});

router.get("/versions", async (_req: Req, res) => {
  const versions = await PricebookVersion.find()
    .select("version importedAt importedBy note counts")
    .sort({ version: -1 })
    .limit(50)
    .lean();
  res.send({ versions });
});

router.post(
  "/import",
  parseUpload,
  async (req: Req, res) => {
    const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const text = (name: string) => uploaded[name]?.[0]?.buffer.toString("utf8");
    const built = buildPricebook({
      suppliers: text(PRICEBOOK_FILES.suppliers),
      documents: text(PRICEBOOK_FILES.documents),
      supplierPrices: text(PRICEBOOK_FILES.supplierPrices),
      salesPrices: text(PRICEBOOK_FILES.salesPrices),
      settings: text("settings.csv"),
      services: text("services.csv"),
    });
    if (!built.ok) {
      res.status(400).send({ error: built.errors.join("; "), errors: built.errors });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : undefined;
    const previous: any = await PricebookVersion.findOne().sort({ version: -1 }).select("counts.services").lean();
    if ((previous?.counts?.services ?? 0) > 0 && !built.data.services?.length) {
      built.warnings.unshift("services.csv was not included: this version has no services, so offers using it can't price services. Import again with services.csv if that wasn't meant.");
    }
    await PricebookVersion.init(); // make sure the unique version index exists
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest: any = await PricebookVersion.findOne().sort({ version: -1 }).select("version").lean();
      try {
        const created = await PricebookVersion.create({
          version: (latest?.version ?? 0) + 1,
          importedBy: req.user?._id,
          note,
          counts: {
            suppliers: built.data.suppliers.length,
            documents: built.data.documents.length,
            supplierPrices: built.data.supplierPrices.length,
            salesPrices: built.data.salesPrices.length,
            services: built.data.services?.length ?? 0,
          },
          warnings: built.warnings,
          ...built.data,
        });
        res.status(201).send(summary(created.toObject()));
        return;
      } catch (err: any) {
        if (err?.code === 10334 || /too large|BSONObj size|document is larger/i.test(String(err?.message))) {
          res.status(413).send({ error: "This pricebook is too large to store as one version; split or trim the files" });
          return;
        }
        if (err?.code !== 11000) throw err; // version taken by a parallel import: try the next
      }
    }
    res.status(409).send({ error: "Another import was saving at the same time; try again" });
  },
);

const q = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);
const organicParam = (v: unknown) => (v === "true" ? true : v === "false" ? false : undefined);

// Services for the offer calculator, with the price each would get
// (an offer's own version and EUR rate when given, else the newest).
router.get("/services", async (req: Req, res) => {
  const v = Number(req.query.version);
  const doc = Number.isInteger(v) && v > 0 ? await pricebookVersion(v) : await activePricebook();
  if (!doc) {
    res.send({ version: null, services: [], guaranteeText: null });
    return;
  }
  const settings = doc.settings ?? {};
  const services = (doc.services ?? []).map((s: any) => {
    const rate = Number(req.query.eurDkk);
    const p = priceService(s, {
      eurDkk: rate > 1 && rate < 20 ? rate : settings.eurDkk ?? Number.NaN,
      supplierPrices: doc.supplierPrices ?? [],
      documents: doc.documents ?? [],
      defaultMarginPct: settings.targetMarginServices,
    });
    return { ...s, unitPrice: p?.unitPrice ?? null, priceSource: p?.source ?? "none" };
  });
  res.send({ version: doc.version, services, guaranteeText: settings.guaranteeTextDa ?? null });
});

// Price overview: per product, Grove's sales prices next to every supplier
// cost, each with its price list, date and source file; services likewise.
router.get("/overview", async (req: Req, res) => {
  const v = Number(req.query.version);
  const doc = Number.isInteger(v) && v > 0 ? await pricebookVersion(v) : await activePricebook();
  if (!doc) {
    res.send({ version: null, products: [], services: [] });
    return;
  }
  const rate = Number(req.query.eurDkk);
  const eurDkk = rate > 1 && rate < 20 ? rate : doc.settings?.eurDkk;
  if (!eurDkk) {
    res.status(409).send({ error: "Set eur_dkk in the pricebook's settings.csv" });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  const all = priceOverview(doc, { eurDkk, q });
  // filters, then a page of products (the full list is ~1 MB)
  const only = req.query.only;
  const filtered = all.products.filter((p) =>
    only === "sales" ? p.sales.length > 0 : only === "multi" ? p.summary.suppliers > 1 : only === "flags" ? p.summary.outdated + p.summary.vatUnclear > 0 : true,
  );
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  res.send({
    version: doc.version,
    importedAt: doc.importedAt,
    eurDkk: all.eurDkk,
    targets: all.targets,
    total: filtered.length,
    products: filtered.slice(offset, offset + limit),
    services: all.services,
  });
});

// Free-text search for the pricebook page, or a structured match.
router.get("/search", async (req: Req, res) => {
  // an offer's own version when given, else the newest
  const v = Number(req.query.version);
  const doc = Number.isInteger(v) && v > 0 ? await pricebookVersion(v) : await activePricebook();
  if (!doc) {
    res.send({ version: null, salesPrices: [], supplierPrices: [] });
    return;
  }
  const docs = new Map((doc.documents ?? []).map((d: any) => [d.docId, d]));
  const withAge = (p: any) => {
    const d: any = docs.get(p.docId);
    return { ...p, documentDate: d?.documentDate, outdated: isOutdated(d?.documentDate) };
  };
  const latin = q(req.query.latin);
  if (latin) {
    const query = plantQuery(req.query, latin);
    res.send({
      version: doc.version,
      salesPrices: matchSalesPrices(doc, query).slice(0, 50).map((m) => m.item),
      supplierPrices: matchSupplierPrices(doc, query).slice(0, 100).map((m) => withAge(m.item)),
    });
    return;
  }
  const text = norm(q(req.query.q));
  const hit = (p: any) => !text || norm(`${p.latin} ${p.commonName ?? p.commonNameDa ?? ""} ${p.cultivar ?? ""} ${p.rootstock ?? ""}`).includes(text);
  res.send({
    version: doc.version,
    salesPrices: doc.salesPrices.filter(hit).slice(0, 100),
    supplierPrices: doc.supplierPrices.filter(hit).slice(0, 200).map(withAge),
  });
});

router.get("/suggest", async (req: Req, res) => {
  const doc = await activePricebook();
  const latin = q(req.query.latin);
  if (!doc || !latin) {
    res.send({ suggestion: null });
    return;
  }
  const rates = pricingRates(req.query, doc.settings);
  if ("error" in rates) {
    res.status(400).send({ error: rates.error });
    return;
  }
  res.send({ version: doc.version, suggestion: suggestPrice(doc, plantQuery(req.query, latin), rates) });
});

/**
 * Margin and exchange rate: from the request, else the pricebook's own
 * settings.csv. No built-in default margin: it is Grove's business data.
 */
export function pricingRates(query: any, settings: PricebookData["settings"]): { marginPct: number; eurDkk: number } | { error: string } {
  const parse = (v: unknown) => (v === undefined || v === "" ? undefined : Number(v));
  const marginPct = parse(query.marginPct) ?? settings?.defaultMarginPct;
  const eurDkk = parse(query.eurDkk) ?? settings?.eurDkk;
  if (marginPct === undefined || !Number.isFinite(marginPct) || marginPct < 0 || marginPct > 500) {
    return { error: "Set a margin in % (0-500), or default_margin_pct in the pricebook's settings.csv" };
  }
  if (eurDkk === undefined || !Number.isFinite(eurDkk) || eurDkk <= 1 || eurDkk >= 20) {
    return { error: "Set the EUR to DKK rate, or eur_dkk in the pricebook's settings.csv" };
  }
  return { marginPct, eurDkk };
}

const PROPAGATIONS = ["grafted", "seedling", "own-rooted", "cutting"] as const;
const height = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === "" || !Number.isFinite(n) || n < 0 || n > 5000 ? undefined : n;
};

/** Plant query from URL parameters (hybrid parents as a comma list). */
export function plantQuery(query: any, latin: string): PlantQuery {
  const parents = q(query.hybridParents)?.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 8);
  const genus = q(query.hybridGenus);
  const propagation = q(query.propagation);
  return {
    latin,
    cultivar: q(query.cultivar),
    rootstock: q(query.rootstock),
    organic: organicParam(query.organic),
    propagation: (PROPAGATIONS as readonly string[]).includes(propagation ?? "") ? (propagation as PlantQuery["propagation"]) : undefined,
    heightMin: height(query.heightMin),
    heightMax: height(query.heightMax),
    hybrid: genus && parents && parents.length >= 2 ? { genus, parents } : undefined,
  };
}

export default router;
