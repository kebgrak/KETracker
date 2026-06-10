import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import operatorsRouter from "./operators";
import productsRouter from "./products";
import stepsRouter from "./steps";
import reportsRouter from "./reports";
import weeklyPlansRouter from "./weeklyPlans";
import summaryRouter from "./summary";
import { requireAdmin } from "../middlewares/requireAdmin";
import { requireModerator } from "../middlewares/requireModerator";

const router: IRouter = Router();

// Always public
router.use(healthRouter);
router.use(authRouter);

// Public operator-facing reads
router.use(operatorsRouter.publicRouter);
router.use(productsRouter.publicRouter);
router.use(stepsRouter.publicRouter);
router.use(reportsRouter.publicRouter);
router.use(weeklyPlansRouter.publicRouter);

// Admin-only routes (full write access to operators, products, steps)
router.use(requireAdmin, operatorsRouter.adminRouter);
router.use(requireAdmin, productsRouter.adminRouter);
router.use(requireAdmin, stepsRouter.adminRouter);

// Moderator+ routes (admin or moderator may access)
router.use(requireModerator, reportsRouter.adminRouter);
router.use(requireModerator, weeklyPlansRouter.adminRouter);
router.use(requireModerator, summaryRouter);

export default router;
