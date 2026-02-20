import { describe, it, expect } from 'vitest';
import { cases } from '../../src/db/schema/cases';
import { events } from '../../src/db/schema/events';
import { artifacts } from '@db/schema';

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

describe('artifacts schema', () => {
  it('has artifacts table defined', () => {
    expect(artifacts).toBeDefined();
  });

  it('artifacts has required columns', () => {
    const cols = Object.keys(artifacts);
    expect(cols).toContain('id');
    expect(cols).toContain('caseId');
    expect(cols).toContain('eventId');
    expect(cols).toContain('type');
    expect(cols).toContain('content');
    expect(cols).toContain('citations');
    expect(cols).toContain('createdAt');
  });
});

describe('events schema updates', () => {
  it('events has citations column', () => {
    const cols = Object.keys(events);
    expect(cols).toContain('citations');
  });

  it('events has artifactId column', () => {
    const cols = Object.keys(events);
    expect(cols).toContain('artifactId');
  });
});
