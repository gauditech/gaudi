-- CreateTable
CREATE TABLE "org" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "optout" TEXT,

    CONSTRAINT "org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orgmembership" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "orgmembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL,
    "org_id" INTEGER NOT NULL,

    CONSTRAINT "repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "repo_id" INTEGER NOT NULL,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userauthlocal" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "userauthlocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "useraccesstoken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "expirydate" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "useraccesstoken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_id_key" ON "org"("id");

-- CreateIndex
CREATE UNIQUE INDEX "org_slug_key" ON "org"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "orgmembership_id_key" ON "orgmembership"("id");

-- CreateIndex
CREATE UNIQUE INDEX "repo_id_key" ON "repo"("id");

-- CreateIndex
CREATE UNIQUE INDEX "repo_slug_key" ON "repo"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "issue_id_key" ON "issue"("id");

-- CreateIndex
CREATE UNIQUE INDEX "user_id_key" ON "user"("id");

-- CreateIndex
CREATE UNIQUE INDEX "userauthlocal_id_key" ON "userauthlocal"("id");

-- CreateIndex
CREATE UNIQUE INDEX "userauthlocal_username_key" ON "userauthlocal"("username");

-- CreateIndex
CREATE UNIQUE INDEX "useraccesstoken_id_key" ON "useraccesstoken"("id");

-- CreateIndex
CREATE UNIQUE INDEX "useraccesstoken_token_key" ON "useraccesstoken"("token");

-- AddForeignKey
ALTER TABLE "orgmembership" ADD CONSTRAINT "orgmembership_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orgmembership" ADD CONSTRAINT "orgmembership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo" ADD CONSTRAINT "repo_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userauthlocal" ADD CONSTRAINT "userauthlocal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "useraccesstoken" ADD CONSTRAINT "useraccesstoken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
