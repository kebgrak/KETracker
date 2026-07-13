import { Router } from "express";
import { db, workReportsTable, operatorsTable, productsTable, stepsTable } from "@workspace/db";
import { and, eq, count, sum, ne, desc } from "drizzle-orm";

const router = Router();

// All summary routes are scoped to step 99 ("Ready parts for the day") reports only

router.get("/summary/dashboard", async (req, res) => {
  const [operatorCount] = await db.select({ count: count() }).from(operatorsTable);
  const [productCount] = await db.select({ count: count() }).from(productsTable);

  const [totals] = await db
    .select({
      totalReports: count(),
      totalQuantity: sum(workReportsTable.quantityCompleted),
      totalTime: sum(workReportsTable.timeWorkedMinutes),
    })
    .from(workReportsTable)
    .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
    .where(eq(stepsTable.stepNumber, 99));

  const recentRows = await db
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
    .where(eq(stepsTable.stepNumber, 99))
    .orderBy(desc(workReportsTable.createdAt))
    .limit(20);

  const recentReports = recentRows.map(({ report, operator, product, step }) => ({
    ...report,
    operator,
    product,
    step,
  }));

  res.json({
    totalOperators: operatorCount.count,
    totalProducts: productCount.count,
    totalReports: totals.totalReports,
    totalQuantityCompleted: Number(totals.totalQuantity ?? 0),
    totalTimeMinutes: Number(totals.totalTime ?? 0),
    recentReports,
  });
});

router.get("/summary/operator-stats", async (req, res) => {
  const operators = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.isLineleader, false));

  const stats = await Promise.all(
    operators.map(async (op) => {
      const [agg] = await db
        .select({
          totalReports: count(),
          totalQuantity: sum(workReportsTable.quantityCompleted),
          totalTime: sum(workReportsTable.timeWorkedMinutes),
        })
        .from(workReportsTable)
        .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
        .where(
          and(
            eq(workReportsTable.operatorId, op.id),
            ne(stepsTable.stepNumber, 99),
          ),
        );

      return {
        operatorId: op.id,
        operatorName: op.name,
        employeeId: op.employeeId,
        totalReports: agg.totalReports,
        totalQuantityCompleted: Number(agg.totalQuantity ?? 0),
        totalTimeMinutes: Number(agg.totalTime ?? 0),
      };
    })
  );

  res.json(stats);
});

router.get("/summary/product-stats", async (req, res) => {
  const products = await db.select().from(productsTable);

  const stats = await Promise.all(
    products.map(async (p) => {
      const [agg] = await db
        .select({
          totalReports: count(),
          totalQuantity: sum(workReportsTable.quantityCompleted),
          totalTime: sum(workReportsTable.timeWorkedMinutes),
        })
        .from(workReportsTable)
        .innerJoin(stepsTable, eq(workReportsTable.stepId, stepsTable.id))
        .where(
          and(
            eq(workReportsTable.productId, p.id),
            eq(stepsTable.stepNumber, 99),
          ),
        );

      const [allStepCount] = await db
        .select({ count: count() })
        .from(stepsTable)
        .where(eq(stepsTable.productId, p.id));

      return {
        productId: p.id,
        productName: p.name,
        totalReports: agg.totalReports,
        totalQuantityCompleted: Number(agg.totalQuantity ?? 0),
        totalTimeMinutes: Number(agg.totalTime ?? 0),
        stepCount: allStepCount?.count ?? 0,
      };
    })
  );

  res.json(stats);
});

export default router;
