/**
 * Jest global type declarations
 * This file adds typings for Jest globals to reduce TypeScript errors in test files
 */

import '@jest/globals';

// Declare global Jest types explicitly to help TypeScript
declare global {
  // Jest testing functions
  const describe: typeof import('@jest/globals').describe;
  const it: typeof import('@jest/globals').it;
  const test: typeof import('@jest/globals').test;
  const expect: typeof import('@jest/globals').expect;
  const beforeAll: typeof import('@jest/globals').beforeAll;
  const beforeEach: typeof import('@jest/globals').beforeEach;
  const afterAll: typeof import('@jest/globals').afterAll;
  const afterEach: typeof import('@jest/globals').afterEach;
  
  // Jest mock functionality
  const jest: typeof import('@jest/globals').jest;
  
  // Additional common helpers
  namespace jest {
    interface Mock<T = any, Y extends any[] = any[]> extends Function {
      new (...args: Y): T;
      (...args: Y): T;
      mockImplementation(fn: (...args: Y) => T): this;
      mockImplementationOnce(fn: (...args: Y) => T): this;
      mockReturnValue(value: T): this;
      mockReturnValueOnce(value: T): this;
      mockResolvedValue(value: T): this;
      mockResolvedValueOnce(value: T): this;
      mockRejectedValue(value: any): this;
      mockRejectedValueOnce(value: any): this;
      mockClear(): this;
      mockReset(): this;
      mockRestore(): this;
      mockName(name: string): this;
      getMockName(): string;
      mock: {
        calls: Y[];
        instances: T[];
        contexts: any[];
        lastCall: Y;
        results: Array<{ type: string; value: T }>;
      };
    }
    
    function fn<T = any, Y extends any[] = any[]>(): Mock<T, Y>;
    function fn<T = any, Y extends any[] = any[]>(implementation: (...args: Y) => T): Mock<T, Y>;
    
    function spyOn<T extends object, M extends keyof T>(
      object: T,
      method: M & string
    ): Mock<Required<T>[M]>;
    
    function mocked<T>(item: T, deep?: boolean): jest.Mocked<T>;
  }
}

export {};
