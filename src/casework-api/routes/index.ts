import { Router } from 'express';
import healthRouter from './health';
import casesRouter from './cases';

const router = Router();
router.use(healthRouter);
router.use(casesRouter);

export default router;
