import { Router } from 'express';
import healthRouter from './health';
import casesRouter from './cases';
import { policyPackRouter } from './policy-pack';
import { artifactsRouter } from './artifacts';
import transitionRouter from './transition';
import runsRouter from './runs';

const router = Router();
router.use(healthRouter);
router.use(casesRouter);
router.use('/policy-pack', policyPackRouter);
router.use('/artifacts', artifactsRouter);
router.use(transitionRouter);
router.use('/runs', runsRouter);

export default router;
