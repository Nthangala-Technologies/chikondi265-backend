import { Router, type IRouter } from "express";
import authRouter from "./auth";
import connectionsRouter from "./connections";
import discoveryRouter from "./discovery";
import meRouter from "./me";
import messagesRouter from "./messages";
import paymentsRouter from "./payments";
import safetyRouter from "./safety";
import swipesRouter from "./swipes";

const router: IRouter = Router();

router.use(authRouter);
router.use(meRouter);
router.use(discoveryRouter);
router.use(swipesRouter);
router.use(connectionsRouter);
router.use(paymentsRouter);
router.use(messagesRouter);
router.use(safetyRouter);

export default router;
