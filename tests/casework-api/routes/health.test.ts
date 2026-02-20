import { describe, it, expect } from 'vitest';
import healthRouter from '../../../src/casework-api/routes/health';

describe('health router', () => {
  it('exports a router', () => {
    expect(healthRouter).toBeDefined();
    expect(healthRouter.stack).toBeDefined();
  });
});
