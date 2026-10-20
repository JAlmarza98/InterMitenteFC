-- CreateTable
CREATE TABLE "MatchFormation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchFormation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchFormationSlot" (
    "id" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "MatchFormationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchFormationSub" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "MatchFormationSub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchFormation_matchId_key" ON "MatchFormation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFormationSlot_formationId_slotKey_key" ON "MatchFormationSlot"("formationId", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFormationSlot_formationId_playerId_key" ON "MatchFormationSlot"("formationId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFormationSub_slotId_playerId_key" ON "MatchFormationSub"("slotId", "playerId");

-- AddForeignKey
ALTER TABLE "MatchFormation" ADD CONSTRAINT "MatchFormation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFormationSlot" ADD CONSTRAINT "MatchFormationSlot_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "MatchFormation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFormationSlot" ADD CONSTRAINT "MatchFormationSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFormationSub" ADD CONSTRAINT "MatchFormationSub_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MatchFormationSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFormationSub" ADD CONSTRAINT "MatchFormationSub_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
