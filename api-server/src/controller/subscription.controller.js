import Razorpay from "razorpay";
import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createSubscription = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const userId = req.user.id;

  if (!planId) {
    return ApiError.send(res, 400, "Plan ID is required");
  }

  try {
    // Check if user already has an active subscription
    const existingSubscription = await Prisma.subscription.findFirst({
      where: { 
        userId,
        status: "ACTIVE"
      }
    });

    if (existingSubscription) {
      return ApiError.send(res, 409, "User already has an active subscription");
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
    });

    const dbSubscription = await Prisma.subscription.create({
      data: {
        userId,
        razorpayId: subscription.id,
        plan: "PRO", // You might want to map planId to plan type
        status: "ACTIVE",
      },
    });

    return res.status(201).json(
      ApiResponse.success(
        {
          subscription: dbSubscription,
          razorpaySubscription: subscription
        },
        "Subscription created successfully",
        201
      )
    );
  } catch (error) {
    console.error("Razorpay subscription error:", error);
    return ApiError.send(res, 500, "Failed to create subscription");
  }
});

const getSubscription = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const subscription = await Prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  if (!subscription) {
    return ApiError.send(res, 404, "No subscription found");
  }

  return res.json(
    ApiResponse.success(subscription, "Subscription fetched successfully")
  );
});

export { createSubscription, getSubscription };
