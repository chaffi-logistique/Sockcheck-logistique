import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockcheckRouter from "./stockcheck";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(stockcheckRouter);

export default router;
