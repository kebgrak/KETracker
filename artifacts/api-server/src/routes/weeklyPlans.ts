import { Router } from "express";
import { db, weeklyPlansTable, productsTable, workReportsTable, stepsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

export const publicRouter = Router();
export const adminRouter = Router();

// ── GET /api/weekly-plans ─────────────────────────────────────────────────────
publicRouter.get("/weekly-plans", async (req, res) => {
  const weekStart = req.query.weekStart;
  if (!weekStart || typeof weekStart !== "string") {
    res.status(400).json({ error: "weekStart query param is required (YYYY-MM-DD)" });
    return;
  }

  const rows = await db
    .select({
      plan: weeklyPlansTable,
      product: productsTable,
    })
    .from(weeklyPlansTable)
    .innerJoin(productsTable, eq(weeklyPlansTable.productId, productsTable.id))
    .where(eq(weeklyPlansTable.weekStart, weekStart));

  res.json(
    rows.map(({ plan, product }) => ({
      ...plan,
      product,
    })),
  );
});

// ── POST /api/weekly-plans ─────────────────────────────────────────────────────
adminRouter.post("/weekly-plans", async (req, res) => {
  const body = req.body;
  const productId = Number(body.productId);
  const weekStart = String(body.weekStart ?? "");
  const plannedQuantity = Number(body.plannedQuantity);

  if (!weekStart || !productId || Number.isNaN(plannedQuantity) || plannedQuantity < 0) {
    res.status(400).json({ error: "Invalid body: productId, weekStart, plannedQuantity required" });
    return;
  }

  // Upsert: delete any existing plan for this product+week, then insert
  await db
    .delete(weeklyPlansTable)
    .where(
      and(
        eq(weeklyPlansTable.productId, productId),
        eq(weeklyPlansTable.weekStart, weekStart),
      ),
    );

  const [inserted] = await db
    .insert(weeklyPlansTable)
    .values({
      productId,
      weekStart,
      plannedQuantity,
    })
    .returning();

  const [row] = await db
    .select({
      plan: weeklyPlansTable,
      product: productsTable,
    })
    .from(weeklyPlansTable)
    .innerJoin(productsTable, eq(weeklyPlansTable.productId, productsTable.id))
    .where(eq(weeklyPlansTable.id, inserted.id));

  res.status(201).json({
    ...row.plan,
    product: row.product,
  });
});

// ── DELETE /api/weekly-plans/:id ──────────────────────────────────────────────
adminRouter.delete("/weekly-plans/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }
  await db.delete(weeklyPlansTable).where(eq(weeklyPlansTable.id, id));
  res.status(204).send();
});

// ── GET /api/weekly-plans/progress ────────────────────────────────────────────
publicRouter.get("/weekly-plans/progress", async (req, res) => {
  const weekStart = req.query.weekStart;
  if (!weekStart || typeof weekStart !== "string") {
    res.status(400).json({ error: "weekStart query param is required (YYYY-MM-DD)" });
    return;
  }

  // Compute week end (Sunday)
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekEnd = end.toISOString().split("T")[0];

  // Get all products with their plans for this week
  const productsWithPlans = await db
    .select({
      product: productsTable,
      plan: weeklyPlansTable,
    })
    .from(productsTable)
    .leftJoin(
      weeklyPlansTable,
      and(
        eq(weeklyPlansTable.productId, productsTable.id),
        eq(weeklyPlansTable.weekStart, weekStart),
      ),
    );

  // Get step 99 reports for each product in this week
  const step99 = db.$with("step99").as(
    db.select().from(stepsTable).where(eq(stepsTable.stepNumber, 99))
  );

  const reports = await db
    .with(step99)
    .select({
      productId: workReportsTable.productId,
      quantityCompleted: workReportsTable.quantityCompleted,
    })
    .from(workReportsTable)
    .innerJoin(step99, eq(workReportsTable.stepId, step99.id))
    .where(
      and(
        gte(workReportsTable.reportDate, weekStart),
        lte(workReportsTable.reportDate, weekEnd),
      ),
    );

  // Aggregate completed by product
  const completedByProduct = new Map<number, number>();
  for (const r of reports) {
    const current = completedByProduct.get(r.productId) ?? 0;
    completedByProduct.set(r.productId, current + (r.quantityCompleted ?? 0));
  }

  const result = productsWithPlans.map(({ product, plan }) => {
    const planned = plan?.plannedQuantity ?? 0;
    const completed = completedByProduct.get(product.id) ?? 0;
    const remaining = Math.max(0, planned - completed);
    const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
    return {
      productId: product.id,
      productName: product.name,
      plannedQuantity: planned,
      completedQuantity: completed,
      remainingQuantity: remaining,
      percentageComplete: pct,
      planId: plan?.id ?? null,
    };
  });

  res.json(result);
});

export default { publicRouter, adminRouter };
