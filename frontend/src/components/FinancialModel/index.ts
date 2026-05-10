/**
 * FinancialModel barrel — top-level editor + sub-components.
 *
 * Default export is the editor itself so `React.lazy(() => import("./FinancialModel"))`
 * resolves to the right component without a `.then` shim.
 */
export { FinancialModel as default } from "./FinancialModel";
export { FinancialModel } from "./FinancialModel";
export type { FinancialModelProps } from "./FinancialModel";

export { ScenarioSliders } from "./ScenarioSliders";
export type { ScenarioSlidersProps } from "./ScenarioSliders";

export { ProjectionChart } from "./ProjectionChart";
export type { ProjectionChartProps } from "./ProjectionChart";

export { KeyMetricCards } from "./KeyMetricCards";
export type { KeyMetricCardsProps } from "./KeyMetricCards";

export { PnLTable } from "./PnLTable";
export type { PnLTableProps } from "./PnLTable";

export { AssumptionsPanel } from "./AssumptionsPanel";
export type { AssumptionsPanelProps } from "./AssumptionsPanel";

export { SensitivityTable } from "./SensitivityTable";
export type { SensitivityTableProps } from "./SensitivityTable";

export { PresetChips } from "./PresetChips";
export type { PresetChipsProps } from "./PresetChips";
