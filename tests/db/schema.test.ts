import { describe, it, expect } from 'vitest';
import { cases } from '../../src/db/schema/cases';
import { events } from '../../src/db/schema/events';

describe('cases schema', () => {
  it('exports a cases table', () => {
    expect(cases).toBeDefined();
    expect((cases as any)[Symbol.for('drizzle:Name')]).toBe('cases');
  });
});

describe('events schema', () => {
  it('exports an events table', () => {
    expect(events).toBeDefined();
    expect((events as any)[Symbol.for('drizzle:Name')]).toBe('events');
  });

  it('has a foreign key to cases', () => {
    const caseIdCol = events.caseId;
    expect(caseIdCol).toBeDefined();
  });
});
