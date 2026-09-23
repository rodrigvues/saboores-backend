import { centsToAmount, goalPercent } from "../services/eventGoal.engine.js";

export type EventGoalDto = {
  name: string;
  targetAmount: string;
  raisedAmount: string;
  percent: number;
  reached: boolean;
  reachedAt: Date | null;
};

type EventGoalRecord = {
  name: string;
  targetAmountCents: number;
  reachedAt: Date | null;
};

export function toEventGoalDto(goal: EventGoalRecord, raisedCents: number): EventGoalDto {
  const reached = goal.reachedAt !== null;
  return {
    name: goal.name,
    targetAmount: centsToAmount(goal.targetAmountCents),
    raisedAmount: centsToAmount(raisedCents),
    percent: goalPercent(raisedCents, goal.targetAmountCents, reached),
    reached,
    reachedAt: goal.reachedAt,
  };
}
