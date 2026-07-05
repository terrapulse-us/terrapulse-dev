import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import osmRouter from "./osm";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(osmRouter);
router.use(assistantRouter);

export default router;
