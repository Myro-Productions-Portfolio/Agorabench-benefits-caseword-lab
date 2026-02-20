import { describe, it, expect } from 'vitest';
import casesRouter from '../../../src/casework-api/routes/cases';

describe('cases router', () => {
  it('exports a router', () => {
    expect(casesRouter).toBeDefined();
    expect(casesRouter.stack).toBeDefined();
  });
});
