import Razorpay from "razorpay";
import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createSubscription = asyncHandler(async (req, res) => {
  const planId = process.env.RAZORPAY_PLAN_ID; // from Razorpay dashboard

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: 12,
  });

  await Prisma.subscription.create({
    data: {
      userId: req.user.id,
      razorpaySubId: subscription.id,
      status: "ACTIVE",
    },
  });

  return res.status(201).json(new ApiResponse(201, "Subscription created", subscription));
});

export { createSubscription };
