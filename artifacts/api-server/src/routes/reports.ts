import { Router } from "express";
import { db, workReportsTable, operatorsTable, productsTable, stepsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  CreateReportBody,
  ListReportsQueryParams,
  GetReportParams,
  DeleteReportParams,
} from "@workspace/api-zod";

async function fetchReportRows(query: { operatorId?: number; productId?: number; date?: string }) {
  const conditions = [];
  if (query.operatorId) conditions.push(eq(workReportsTable.operatorId, query.operatorId));
  if (query.productId) conditions.push(eq(workReportsTable.productId, query.productId));
  if (query.date) conditions.push(eq(workReportsTable.reportDate, query.date));

  const rows = await db
    .select({
      report: workReportsTable,
      operator: operatorsTable,
      product: productsTable,
      step: stepsTable,
    })
    .from(workReportsTable)
    .innerJoin(operatorsTable, eq(workReportsTable.operatorId, operatorsTable.id))
    .innerJoin(productsTable, eq(workReportsTable.productId, productsTable.id))
    .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(workReportsTable.createdAt);

  return rows.map(({ report, operator, product, step }) => ({ ...report, operator, product, step }));
}

// Public: operators can list and submit reports
export const publicRouter = Router();

publicRouter.get("/reports", async (req, res) => {
  const query = ListReportsQueryParams.parse({
    operatorId: req.query.operatorId ? Number(req.query.operatorId) : undefined,
    productId: req.query.productId ? Number(req.query.productId) : undefined,
    date: req.query.date,
  });
  const normalizedQuery = {
    operatorId: query.operatorId,
    productId: query.productId,
    date: query.date ? String(query.date) : undefined,
  };
  res.json(await fetchReportRows(normalizedQuery));
});

publicRouter.get("/reports/:id", async (req, res) => {
  const { id } = GetReportParams.parse({ id: Number(req.params.id) });
  const [row] = await db
    .select({
      report: workReportsTable,
      operator: operatorsTable,
      product: productsTable,
      step: stepsTable,
    })
    .from(workReportsTable)
    .innerJoin(operatorsTable, eq(workReportsTable.operatorId, operatorsTable.id))
    .innerJoin(productsTable, eq(workReportsTable.productId, productsTable.id))
    .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
    .where(eq(workReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Report not found" }); return; }
  res.json({ ...row.report, operator: row.operator, product: row.product, step: row.step });
});

publicRouter.post("/reports", async (req, res) => {
  const body = CreateReportBody.parse(req.body);
  // reportDate arrives as a JS Date (coerced by Zod from "YYYY-MM-DD").
  // Use UTC components so a string like "2026-06-08" is never shifted by the server TZ.
  const rd = body.reportDate;
  const reportDate = `${rd.getUTCFullYear()}-${String(rd.getUTCMonth() + 1).padStart(2, "0")}-${String(rd.getUTCDate()).padStart(2, "0")}`;

  // ── Step 99 duplicate guard: one report per product per day ──────────────
  const [submittedStep] = await db
    .select({ stepNumber: stepsTable.stepNumber })
    .from(stepsTable)
    .where(eq(stepsTable.id, body.stepId))
    .limit(1);

  if (submittedStep?.stepNumber === 99) {
    const existing = await db
      .select({ id: workReportsTable.id })
      .from(workReportsTable)
      .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
      .where(
        and(
          eq(workReportsTable.productId, body.productId),
          eq(workReportsTable.reportDate, reportDate),
          eq(stepsTable.stepNumber, 99),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const [product] = await db
        .select({ name: productsTable.name })
        .from(productsTable)
        .where(eq(productsTable.id, body.productId))
        .limit(1);

      const d = new Date(reportDate + "T00:00:00");
      const displayDate = d.toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      });
      res.status(409).json({
        error: `For ${displayDate} for product "${product?.name ?? String(body.productId)}" a Step 99 report has already been entered`,
      });
      return;
    }
  }

  const [report] = await db.insert(workReportsTable).values({
    operatorId: body.operatorId,
    productId: body.productId,
    stepId: body.stepId,
    timeWorkedMinutes: String(body.timeWorkedMinutes),
    quantityCompleted: body.quantityCompleted,
    operatorCount: body.operatorCount != null ? String(body.operatorCount) : null,
    reportDate,
    notes: body.notes ?? null,
  }).returning();
  const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, report.operatorId));
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, report.productId));
  const [step] = await db.select().from(stepsTable).where(eq(stepsTable.id, report.stepId));
  res.status(201).json({ ...report, operator, product, step });
});

// Admin: delete reports
export const adminRouter = Router();

adminRouter.delete("/reports/:id", async (req, res) => {
  const { id } = DeleteReportParams.parse({ id: Number(req.params.id) });
  await db.delete(workReportsTable).where(eq(workReportsTable.id, id));
  res.status(204).end();
});

export default { publicRouter, adminRouter };
