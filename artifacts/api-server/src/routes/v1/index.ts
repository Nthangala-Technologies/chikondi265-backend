import { Router, type IRouter } from "express";
import authRouter from "./auth";
import connectionsRouter from "./connections";
import discoveryRouter from "./discovery";
import likesRouter from "./likes";
import meRouter from "./me";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import paymentsRouter from "./payments";
import preferencesRouter from "./preferences";
import realtimeRouter from "./realtime";
import safetyRouter from "./safety";
import swipesRouter from "./swipes";

const router: IRouter = Router();

router.use(authRouter);
router.use(meRouter);
router.use(preferencesRouter);
router.use(discoveryRouter);
router.use(likesRouter);
router.use(swipesRouter);
router.use(connectionsRouter);
router.use(notificationsRouter);
router.use(realtimeRouter);
router.use(paymentsRouter);
router.use(messagesRouter);
router.use(safetyRouter);

export default router;
