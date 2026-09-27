-- AlterEnum
ALTER TYPE "MatchEventType" ADD VALUE 'penalty_goal';
ALTER TYPE "MatchEventType" ADD VALUE 'penalty_won';

-- AlterTable
ALTER TABLE "MatchPlayerStat" ADD COLUMN     "penaltyGoals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "penaltiesWon" INTEGER NOT NULL DEFAULT 0;
