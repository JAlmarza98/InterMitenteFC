-- AlterEnum
ALTER TYPE "MatchEventType" ADD VALUE 'key_action';
ALTER TYPE "MatchEventType" ADD VALUE 'key_error';

-- AlterTable
ALTER TABLE "MatchPlayerStat" ADD COLUMN     "keyActions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "keyErrors" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MatchTopPlayer" (
    "matchId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "MatchTopPlayer_pkey" PRIMARY KEY ("matchId","rank"),
    -- Not expressible in the Prisma schema: only gold, silver and bronze.
    CONSTRAINT "MatchTopPlayer_rank_check" CHECK ("rank" BETWEEN 1 AND 3)
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchTopPlayer_matchId_playerId_key" ON "MatchTopPlayer"("matchId", "playerId");

-- AddForeignKey
ALTER TABLE "MatchTopPlayer" ADD CONSTRAINT "MatchTopPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTopPlayer" ADD CONSTRAINT "MatchTopPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
