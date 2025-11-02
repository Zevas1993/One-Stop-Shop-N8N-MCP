/**
 * Trace Processor
 * Converts execution traces to reinforcement learning training format
 * Preprocesses traces for credit assignment and policy learning
 */

import { logger } from '../utils/logger';
import { ExecutionTrace } from './trace-collector';

/**
 * RL training sample: State, Action, Reward, Next State
 */
export interface RLTrainingSample {
  sampleId: string;
  episode: number;
  stepInEpisode: number;

  // State representation
  state: {
    queryEmbedding?: number[]; // Placeholder for query vector
    queryFeatures: {
      length: number;
      hasTechnicalTerms: boolean;
      hasServiceMentions: boolean;
      hasNodeMentions: boolean;
    };
    userProfile?: {
      expertise: 'beginner' | 'intermediate' | 'expert';
    };
    context?: string[];
  };

  // Action taken
  action: {
    intent: string;
    strategy: string;
    searchType: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
  };

  // Immediate reward
  reward: {
    immediate: number;
    components: {
      quality: number;
      efficiency: number;
      exploration?: number;
    };
  };

  // Result state (for TD learning)
  resultState: {
    resultCount: number;
    qualityScore: number;
    executionTime: number;
  };

  // Metadata
  metadata: {
    traceId: string;
    timestamp: number;
    success: boolean;
    userSatisfaction?: number;
  };
}

/**
 * Episode: Collection of related traces (e.g., one conversation)
 */
export interface RLEpisode {
  episodeId: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  steps: RLTrainingSample[];
  totalReward: number;
  episodeLength: number;
  successCount: number;
  metadata: {
    userExpertise?: string;
    conversationLength?: number;
  };
}

/**
 * Training batch: Multiple episodes for batch learning
 */
export interface RLTrainingBatch {
  batchId: string;
  episodes: RLEpisode[];
  totalSamples: number;
  batchReward: number; // Sum of all rewards
  batchSuccessRate: number;
  metadata: {
    createdAt: number;
    processingTime: number;
    intentDistribution: Record<string, number>;
    strategyDistribution: Record<string, number>;
  };
}

/**
 * Trace Processor - Converts traces to RL training format
 */
export class TraceProcessor {
  private episodes: Map<string, RLEpisode> = new Map();
  private samples: Map<string, RLTrainingSample> = new Map();

  constructor() {
    logger.info('[TraceProcessor] Initialized');
  }

  /**
   * Process a single trace into RL training sample
   */
  processTrace(trace: ExecutionTrace, episodeId: string): RLTrainingSample {
    const sampleId = `sample-${trace.traceId}`;

    // Get or create episode
    let episode = this.episodes.get(episodeId);
    if (!episode) {
      episode = {
        episodeId,
        sessionId: trace.sessionId,
        startTime: trace.timestamp,
        endTime: Date.now(),
        steps: [],
        totalReward: 0,
        episodeLength: 0,
        successCount: 0,
        metadata: {
          userExpertise: trace.metadata.userExpertise,
        },
      };
      this.episodes.set(episodeId, episode);
    }

    // Create RL training sample
    const sample: RLTrainingSample = {
      sampleId,
      episode: 0, // Will be updated when batch is created
      stepInEpisode: episode.steps.length,

      state: {
        queryFeatures: trace.observation.queryFeatures,
        userProfile: trace.observation.context?.userProfile,
        context: trace.observation.context?.conversationHistory,
      },

      action: {
        intent: trace.action.intent,
        strategy: trace.action.strategy,
        searchType: trace.action.parameters.searchType || 'embedding',
      },

      reward: {
        immediate: trace.reward.immediate,
        components: {
          quality: trace.reward.components.qualityReward,
          efficiency: trace.reward.components.efficiencyReward,
          exploration: trace.reward.components.explorationBonus,
        },
      },

      resultState: {
        resultCount: trace.result.resultCount,
        qualityScore: trace.result.qualityScore,
        executionTime: trace.result.executionTimeMs,
      },

      metadata: {
        traceId: trace.traceId,
        timestamp: trace.timestamp,
        success: trace.success,
        userSatisfaction: trace.metadata.endUserSatisfaction?.rating,
      },
    };

    // Add to episode
    episode.steps.push(sample);
    episode.totalReward += trace.reward.immediate;
    if (trace.success) {
      episode.successCount++;
    }
    episode.episodeLength++;
    episode.endTime = Date.now();

    // Store sample
    this.samples.set(sampleId, sample);

    logger.debug('[TraceProcessor] Trace processed', {
      sampleId,
      episodeId,
      reward: trace.reward.immediate.toFixed(3),
    });

    return sample;
  }

  /**
   * Process batch of traces
   */
  processBatch(traces: ExecutionTrace[], episodeId: string): RLEpisode {
    logger.info('[TraceProcessor] Processing batch', {
      traceCount: traces.length,
      episodeId,
    });

    for (const trace of traces) {
      this.processTrace(trace, episodeId);
    }

    const episode = this.episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found after processing`);
    }

    return episode;
  }

  /**
   * Create training batch from episodes
   */
  createTrainingBatch(episodeIds: string[], batchName?: string): RLTrainingBatch {
    const batchId = batchName || `batch-${Date.now()}`;
    const startTime = Date.now();

    const episodes: RLEpisode[] = [];
    let totalSamples = 0;
    let totalReward = 0;
    let successCount = 0;
    let totalSteps = 0;

    const intentDistribution: Record<string, number> = {};
    const strategyDistribution: Record<string, number> = {};

    for (const episodeId of episodeIds) {
      const episode = this.episodes.get(episodeId);
      if (!episode) {
        logger.warn('[TraceProcessor] Episode not found', { episodeId });
        continue;
      }

      episodes.push(episode);
      totalSamples += episode.steps.length;
      totalReward += episode.totalReward;
      successCount += episode.successCount;
      totalSteps += episode.episodeLength;

      // Track distributions
      for (const step of episode.steps) {
        intentDistribution[step.action.intent] = (intentDistribution[step.action.intent] || 0) + 1;
        strategyDistribution[step.action.strategy] = (strategyDistribution[step.action.strategy] || 0) + 1;
      }
    }

    const processingTime = Date.now() - startTime;
    const batchSuccessRate = totalSteps > 0 ? successCount / totalSteps : 0;

    const batch: RLTrainingBatch = {
      batchId,
      episodes,
      totalSamples,
      batchReward: totalReward,
      batchSuccessRate,
      metadata: {
        createdAt: Date.now(),
        processingTime,
        intentDistribution,
        strategyDistribution,
      },
    };

    logger.info('[TraceProcessor] Training batch created', {
      batchId,
      episodeCount: episodes.length,
      totalSamples,
      totalReward: totalReward.toFixed(3),
      successRate: (batchSuccessRate * 100).toFixed(1),
    });

    return batch;
  }

  /**
   * Get episode by ID
   */
  getEpisode(episodeId: string): RLEpisode | undefined {
    return this.episodes.get(episodeId);
  }

  /**
   * Get sample by ID
   */
  getSample(sampleId: string): RLTrainingSample | undefined {
    return this.samples.get(sampleId);
  }

  /**
   * Get all episodes
   */
  getAllEpisodes(): RLEpisode[] {
    return Array.from(this.episodes.values());
  }

  /**
   * Get high-value episodes (for supervised learning)
   */
  getHighValueEpisodes(threshold: number = 0.7): RLEpisode[] {
    return Array.from(this.episodes.values()).filter(
      (ep) => ep.successCount / ep.episodeLength >= threshold
    );
  }

  /**
   * Get low-value episodes (for negative examples)
   */
  getLowValueEpisodes(threshold: number = 0.3): RLEpisode[] {
    return Array.from(this.episodes.values()).filter(
      (ep) => ep.successCount / ep.episodeLength <= threshold
    );
  }

  /**
   * Export training data in JSON format
   */
  exportTrainingData(
    episodeIds?: string[]
  ): {
    format: string;
    version: string;
    episodes: RLEpisode[];
    totalSamples: number;
    statistics: {
      averageEpisodeReward: number;
      averageEpisodeLength: number;
      overallSuccessRate: number;
    };
  } {
    const targetEpisodes = episodeIds
      ? episodeIds.map((id) => this.episodes.get(id)).filter((ep) => !!ep) as RLEpisode[]
      : Array.from(this.episodes.values());

    if (targetEpisodes.length === 0) {
      throw new Error('No episodes to export');
    }

    const totalSamples = targetEpisodes.reduce((sum, ep) => sum + ep.steps.length, 0);
    const totalReward = targetEpisodes.reduce((sum, ep) => sum + ep.totalReward, 0);
    const totalSuccess = targetEpisodes.reduce((sum, ep) => sum + ep.successCount, 0);
    const totalSteps = targetEpisodes.reduce((sum, ep) => sum + ep.episodeLength, 0);

    return {
      format: 'rl-training-data',
      version: '1.0',
      episodes: targetEpisodes,
      totalSamples,
      statistics: {
        averageEpisodeReward: totalReward / targetEpisodes.length,
        averageEpisodeLength: totalSteps / targetEpisodes.length,
        overallSuccessRate: totalSuccess / totalSteps,
      },
    };
  }

  /**
   * Export training data as CSV (for ML tools)
   */
  exportTrainingDataAsCSV(episodeIds?: string[]): string {
    const targetEpisodes = episodeIds
      ? episodeIds.map((id) => this.episodes.get(id)).filter((ep) => !!ep) as RLEpisode[]
      : Array.from(this.episodes.values());

    const header = [
      'sampleId',
      'episodeId',
      'stepInEpisode',
      'queryLength',
      'intent',
      'strategy',
      'resultCount',
      'qualityScore',
      'reward',
      'executionTime',
      'success',
    ].join(',');

    const rows: string[] = [];
    for (const episode of targetEpisodes) {
      for (const sample of episode.steps) {
        rows.push(
          [
            sample.sampleId,
            episode.episodeId,
            sample.stepInEpisode,
            sample.state.queryFeatures.length,
            sample.action.intent,
            sample.action.strategy,
            sample.resultState.resultCount,
            sample.resultState.qualityScore.toFixed(3),
            sample.reward.immediate.toFixed(3),
            sample.resultState.executionTime,
            sample.metadata.success,
          ].join(',')
        );
      }
    }

    return [header, ...rows].join('\n');
  }

  /**
   * Clear processed data
   */
  clear(): void {
    this.episodes.clear();
    this.samples.clear();
    logger.info('[TraceProcessor] All data cleared');
  }

  /**
   * Get processor statistics
   */
  getStatistics(): {
    episodeCount: number;
    sampleCount: number;
    totalReward: number;
    overallSuccessRate: number;
    averageEpisodeLength: number;
  } {
    const episodes = Array.from(this.episodes.values());
    const totalSamples = episodes.reduce((sum, ep) => sum + ep.steps.length, 0);
    const totalReward = episodes.reduce((sum, ep) => sum + ep.totalReward, 0);
    const totalSuccess = episodes.reduce((sum, ep) => sum + ep.successCount, 0);
    const totalSteps = episodes.reduce((sum, ep) => sum + ep.episodeLength, 0);

    return {
      episodeCount: episodes.length,
      sampleCount: totalSamples,
      totalReward,
      overallSuccessRate: totalSteps > 0 ? totalSuccess / totalSteps : 0,
      averageEpisodeLength: episodes.length > 0 ? totalSteps / episodes.length : 0,
    };
  }
}

/**
 * Factory function to create trace processor
 */
export function createTraceProcessor(): TraceProcessor {
  return new TraceProcessor();
}
