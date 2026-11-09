export type {
  ProjectionInputV1,
  ProjectionResultV1,
  ProjectionRunDto,
  ScenarioDto,
  BasicProjectionInput,
  AdvancedProjectionInput,
  ScenarioListDto,
  ProjectionRunListDto,
  CreateBasicProjectionRunRequest,
  CreateScenarioRequest,
  CreateAdvancedProjectionRunRequest,
} from "@joint/contracts";

export {
  roundHalfUp,
  monthlyCompoundingFactor,
  monthlyFeeRetentionFactor,
  inflationFactorAtMonth,
  SCALE,
} from "./math.js";

export { canonicalJson, hashProjectionInput } from "./hash.js";

export {
  calculateProjection,
  type WarningCode,
  type ProjectionOptions,
} from "./calculator.js";
