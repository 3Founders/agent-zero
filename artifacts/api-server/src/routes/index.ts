import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import whatsappRouter from "./whatsapp.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whatsappRouter);
router.use(adminRouter);

export default router;
