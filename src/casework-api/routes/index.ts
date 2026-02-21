import { Router } from 'express';
import healthRouter from './health';
import casesRouter from './cases';
import { policyPackRouter } from './policy-pack';
import { artifactsRouter } from './artifacts';
import transitionRouter from './transition';
import runsRouter from './runs';
import oracleRouter from './oracle';

const router = Router();
router.use(healthRouter);
router.use(casesRouter);
router.use('/policy-pack', policyPackRouter);
router.use('/artifacts', artifactsRouter);
router.use(transitionRouter);
router.use('/runs', runsRouter);
router.use('/oracle', oracleRouter);

export default router;
