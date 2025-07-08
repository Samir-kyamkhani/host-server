import { z } from "zod";
import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { comparePassword, hashPassword } from "../utils/utils.js";

const registerUser = asyncHandler(async (req, res) => {
  const schema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    password: z.string().min(6),
  });

  const { firstName, lastName, email, password } = schema.parse(req.body);

  const existing = await Prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError.send(res, 409, "User already exists");

  const hashed = await hashPassword(password);
  const user = await Prisma.user.create({
    data: { firstName, lastName, email, password: hashed },
  });

  return res.status(201).json(new ApiResponse(201, "User created", user));
});

const loginUser = asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const { email, password } = schema.parse(req.body);

  const user = await Prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError.send(res, 401, "Invalid credentials");

  const match = await comparePassword(password, user.password);
  if (!match) throw new ApiError.send(res, 401, "Invalid credentials");

  const token = generateAccessToken(user.id, user.email);

  return res.json(new ApiResponse(200, "Login successful", { token }));
});

export { registerUser, loginUser };
