import { Router } from "express";
import { db, stepsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  ListStepsParams,
  CreateStepBody,
  CreateStepParams,
  UpdateStepBody,
  UpdateStepParams,
  DeleteStepParams,
} from "@workspace/api-zod";
import { upsertStep99, STEP_99_NUMBER } from "../lib/step99";

// Public: read-only
export const publicRouter = Router();

publicRouter.get("/products/:productId/steps", async (req, res) => {
  const { productId } = ListStepsParams.parse({ productId: Number(req.params.productId) });
  const steps = await db
    .select()
    .from(stepsTable)
    .where(eq(stepsTable.productId, productId))
    .orderBy(stepsTable.stepNumber, stepsTable.subStepLabel);
  res.json(steps);
});

// Admin: create / update / delete
export const adminRouter = Router();

adminRouter.post("/products/:productId/steps", async (req, res) => {
  const { productId } = CreateStepParams.parse({ productId: Number(req.params.productId) });
  const body = CreateStepBody.parse(req.body);
  if (body.stepNumber === STEP_99_NUMBER) {
    res.status(400).json({ error: "Step 99 is auto-managed and cannot be created manually." });
    return;
  }
  const [step] = await db
    .insert(stepsTable)
    .values({
      productId,
      stepNumber: body.stepNumber,
      subStepLabel: body.subStepLabel ?? null,
      name: body.name,
      description: body.description ?? null,
      standardTimeMinutes: String(body.standardTimeMinutes),
    })
    .returning();
  await upsertStep99(productId);
  res.status(201).json(step);
});

adminRouter.put("/products/:productId/steps/:stepId", async (req, res) => {
  const { productId, stepId } = UpdateStepParams.parse({
    productId: Number(req.params.productId),
    stepId: Number(req.params.stepId),
  });
  const body = UpdateStepBody.parse(req.body);
  const existing = await db
    .select({ stepNumber: stepsTable.stepNumber })
    .from(stepsTable)
    .where(and(eq(stepsTable.id, stepId), eq(stepsTable.productId, productId)))
    .limit(1);
  if (existing[0]?.stepNumber === STEP_99_NUMBER) {
    res.status(400).json({ error: "Step 99 is auto-managed and cannot be edited manually." });
    return;
  }
  const [step] = await db
    .update(stepsTable)
    .set({
      stepNumber: body.stepNumber,
      subStepLabel: body.subStepLabel ?? null,
      name: body.name,
      description: body.description ?? null,
      standardTimeMinutes: String(body.standardTimeMinutes),
    })
    .where(and(eq(stepsTable.id, stepId), eq(stepsTable.productId, productId)))
    .returning();
  if (!step) { res.status(404).json({ error: "Step not found" }); return; }
  await upsertStep99(productId);
  res.json(step);
});

adminRouter.delete("/products/:productId/steps/:stepId", async (req, res) => {
  const { productId, stepId } = DeleteStepParams.parse({
    productId: Number(req.params.productId),
    stepId: Number(req.params.stepId),
  });
  const existing = await db
    .select({ stepNumber: stepsTable.stepNumber })
    .from(stepsTable)
    .where(and(eq(stepsTable.id, stepId), eq(stepsTable.productId, productId)))
    .limit(1);
  if (existing[0]?.stepNumber === STEP_99_NUMBER) {
    res.status(400).json({ error: "Step 99 is auto-managed and cannot be deleted manually." });
    return;
  }
  await db
    .delete(stepsTable)
    .where(and(eq(stepsTable.id, stepId), eq(stepsTable.productId, productId)));
  await upsertStep99(productId);
  res.status(204).end();
});

export default { publicRouter, adminRouter };
