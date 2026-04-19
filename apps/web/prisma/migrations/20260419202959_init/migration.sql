-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApplyJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ruleInputJson" TEXT NOT NULL,
    "summaryJson" TEXT,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ApplyJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GoogleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "oldSteps" INTEGER NOT NULL,
    "newSteps" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayChange_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ApplyJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SnapshotDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnapshotDay_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ApplyJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_googleUserId_key" ON "GoogleAccount"("googleUserId");
