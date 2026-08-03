import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import whatsappRouter from "./whatsapp.js";
import adminRouter from "./admin.js";
import setupRouter from "./setup.js";
import cronRouter from "./cron.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whatsappRouter);
router.use(adminRouter);
router.use(setupRouter);
router.use(cronRouter);

export default router;
