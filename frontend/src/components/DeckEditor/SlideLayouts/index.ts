/**
 * Layout registry for PitchSlide.layout enum values.
 * Each component receives `LayoutProps` and renders into a 1280x720 design frame.
 */
import type { ComponentType } from "react";
import type { PitchSlide } from "../../../types/agents";
import type { LayoutProps } from "./layoutShared";
import { TitleLayout } from "./TitleLayout";
import { ProblemLayout } from "./ProblemLayout";
import { SolutionLayout } from "./SolutionLayout";
import { MarketLayout } from "./MarketLayout";
import { BusinessModelLayout } from "./BusinessModelLayout";
import { TractionLayout } from "./TractionLayout";
import { CompetitionLayout } from "./CompetitionLayout";
import { GTMLayout } from "./GTMLayout";
import { FinancialsLayout } from "./FinancialsLayout";
import { TeamLayout } from "./TeamLayout";
import { AskLayout } from "./AskLayout";
import { ContactLayout } from "./ContactLayout";

export const LAYOUT_REGISTRY: Record<PitchSlide["layout"], ComponentType<LayoutProps>> = {
  title: TitleLayout,
  problem: ProblemLayout,
  solution: SolutionLayout,
  market: MarketLayout,
  business_model: BusinessModelLayout,
  traction: TractionLayout,
  competition: CompetitionLayout,
  gtm: GTMLayout,
  financials: FinancialsLayout,
  team: TeamLayout,
  ask: AskLayout,
  contact: ContactLayout,
};

export type { LayoutProps };
export {
  TitleLayout,
  ProblemLayout,
  SolutionLayout,
  MarketLayout,
  BusinessModelLayout,
  TractionLayout,
  CompetitionLayout,
  GTMLayout,
  FinancialsLayout,
  TeamLayout,
  AskLayout,
  ContactLayout,
};
