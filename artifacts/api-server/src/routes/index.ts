import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockcheckRouter from "./stockcheck";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stockcheckRouter);

export default router;
