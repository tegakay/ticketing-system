-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('on_sale', 'sold_out', 'cancelled');

-- CreateEnum
CREATE TYPE "SeatTier" AS ENUM ('floor', 'premium', 'general');

-- CreateEnum
CREATE TYPE "SeatStatusEnum" AS ENUM ('available', 'reserved', 'sold');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'on_sale',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("venue_id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "seat_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tier" "SeatTier" NOT NULL,
    "base_price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("seat_id")
);

-- CreateTable
CREATE TABLE "SeatStatus" (
    "seat_status_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "status" "SeatStatusEnum" NOT NULL,
    "reserved_by" TEXT,
    "reserved_until" TIMESTAMP(3),
    "order_id" TEXT,

    CONSTRAINT "SeatStatus_pkey" PRIMARY KEY ("seat_status_id")
);

-- CreateTable
CREATE TABLE "Order" (
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "seat_ids" TEXT[],
    "total_price" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "payment_id" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "Performer" (
    "performer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Performer_pkey" PRIMARY KEY ("performer_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
