import { describe, it, expect } from '@jest/globals';
import {
  formatExecutionSummary,
  formatExecutionDetails,
  getStatusIndicator,
  summarizeExecutions
} from '../../../src/utils/execution-formatter.js';
import {
  createMockExecution,
  createMockExecutions
} from '../../mocks/n8n-fixtures.js';


describe('Execution Formatter Utilities', () => {
  describe('getStatusIndicator', () => {
    it('returns the correct emoji for known statuses', () => {
      expect(getStatusIndicator('success')).toBe('✅');
      expect(getStatusIndicator('error')).toBe('❌');
      expect(getStatusIndicator('waiting')).toBe('⏳');
      expect(getStatusIndicator('canceled')).toBe('🛑');
    });

    it('returns a default emoji for unknown status', () => {
      expect(getStatusIndicator('unknown')).toBe('⏱️');
    });
  });

  describe('formatExecutionSummary', () => {
    it('formats execution data into a summary', () => {
      const execution = createMockExecution({
        id: 'exec1',
        workflowId: 'wf1',
        status: 'success',
        startedAt: '2025-01-01T00:00:00.000Z',
        stoppedAt: '2025-01-01T00:00:05.000Z'
      });

      const summary = formatExecutionSummary(execution);

      expect(summary).toMatchObject({
        id: 'exec1',
        workflowId: 'wf1',
        status: '✅ success',
        startedAt: '2025-01-01T00:00:00.000Z',
        stoppedAt: '2025-01-01T00:00:05.000Z',
        finished: true
      });
      expect(summary.duration).toBe('5s');
    });

    it('marks execution as in progress when stoppedAt is missing', () => {
      const execution = createMockExecution({
        stoppedAt: undefined as any,
        status: 'waiting'
      });

      const summary = formatExecutionSummary(execution);
      expect(summary.stoppedAt).toBe('In progress');
    });
  });

  describe('formatExecutionDetails', () => {
    it('includes node results when present', () => {
      const execution = createMockExecution({
        data: {
          resultData: {
            runData: {
              MyNode: [
                {
                  status: 'success',
                  data: { main: [[{ foo: 'bar' }]] }
                }
              ]
            }
          }
        },
        status: 'success'
      });

      const details = formatExecutionDetails(execution);
      expect(details.nodeResults.MyNode).toEqual({
        status: 'success',
        items: 1,
        data: [{ foo: 'bar' }]
      });
    });

    it('adds error information when present', () => {
      const execution = createMockExecution({
        data: {
          resultData: {
            runData: {},
            error: { message: 'boom', stack: 'trace' }
          } as any
        },
        status: 'error'
      });

      const details = formatExecutionDetails(execution);
      expect(details.error).toEqual({ message: 'boom', stack: 'trace' });
    });
  });

  describe('summarizeExecutions', () => {
    it('summarizes counts and percentages', () => {
      const executions = [
        createMockExecution({ status: 'success' }),
        createMockExecution({ status: 'error' }),
        createMockExecution({ status: 'waiting' }),
        createMockExecution({ status: 'success' })
      ];

      const summary = summarizeExecutions(executions);

      expect(summary.total).toBe(4);
      const success = summary.byStatus.find((s: any) => s.status.includes('success'));
      const error = summary.byStatus.find((s: any) => s.status.includes('error'));
      expect(success.count).toBe(2);
      expect(error.count).toBe(1);
      expect(summary.successRate).toBe('50%');
    });
  });
});
