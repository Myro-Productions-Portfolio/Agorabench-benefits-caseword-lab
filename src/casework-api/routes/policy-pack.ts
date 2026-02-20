import { Router } from 'express';
import type { PolicyPack } from '@core/policy-pack';
import type { ApiResponse } from '@shared/types';

const router = Router();

router.get('/', (_req, res) => {
  const policyPack = _req.app.locals.policyPack as PolicyPack;
  const response: ApiResponse = {
    success: true,
    data: {
      meta: policyPack.meta,
      ruleIds: Array.from(policyPack.ruleIndex).sort(),
    },
  };
  res.json(response);
});

export { router as policyPackRouter };
