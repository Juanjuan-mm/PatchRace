export { TASK_CONTRACT_VERSION } from "./version.js";
export {
  initializeManualSuite,
  type InitializedManualSuite,
  type InitializeManualSuiteOptions,
} from "./init.js";
export { TaskCommandService } from "./service.js";
export {
  runTaskCommandPhase,
  type RunTaskCommandPhaseOptions,
} from "./grader.js";
export {
  evaluateTaskAssertions,
  type EvaluateTaskAssertionsOptions,
} from "./assertions.js";
export {
  runHiddenVerifier,
  type RunHiddenVerifierOptions,
} from "./hidden-verifier.js";
export {
  mineGitHistory,
  serializeMinedCandidate,
  TASK_MINER_VERSION,
  type MinedTaskCandidate,
  type MineGitHistoryOptions,
} from "./miner.js";
export {
  fetchGitHubMetadata,
  type FetchGitHubMetadataOptions,
} from "./github.js";
export {
  assertSplitAccess,
  createOptimizationSplitView,
  createTaskSplit,
  openFinalHoldout,
  verifyTaskSplit,
  type CreateTaskSplitOptions,
} from "./split.js";
export {
  createTeachingEvidenceView,
  createTeachingProtocolLedger,
  openTeachingFinalHoldout,
  recordTeachingHoldoutOutcome,
} from "./teaching-protocol.js";
export {
  checkTaskValidity,
  type CheckTaskValidityOptions,
} from "./validity.js";
export {
  checkGraderIntegrity,
  type CheckGraderIntegrityOptions,
} from "./integrity.js";
export {
  calculateRepeatedRunStatistics,
  type CalculateRepeatedRunStatisticsOptions,
} from "./statistics.js";
export {
  loadTask,
  serializeTask,
  validateTask,
  type LoadTaskOptions,
  type LoadedTask,
  type TaskValidationIssue,
} from "./task.js";
export type {
  ContentHash,
  TaskAssertionV1,
  TaskAssetV1,
  TaskCommandV1,
  TaskSplit,
  TaskV1,
} from "@patchrace/contracts";
