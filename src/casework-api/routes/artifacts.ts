import { Router } from 'express';
import { db } from '@db/connection';
import { artifacts } from '@db/schema/artifacts';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/:id', async (req, res) => {
  const rows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, req.params.id));
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: 'Artifact not found' });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

export { router as artifactsRouter };
