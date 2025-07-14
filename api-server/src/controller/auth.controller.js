import { z } from "zod";
import Prisma from "../db/db.js";
import axios from "axios";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  comparePassword,
  hashPassword,
  generateAccessToken,
} from "../utils/utils.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax", //  Prevent CSRF
  path: "/", //  Available across routes
  maxAge: 1000 * 60 * 60 * 24 * 7, // Optional: 7 days
};
const registerUser = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (code) {
    // Exchange code for GitHub access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } }
    );

    if (tokenRes.data.error) {
      return ApiError.send(
        res,
        401,
        tokenRes.data.error_description || "Invalid GitHub code"
      );
    }

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) return ApiError.send(res, 401, "Invalid GitHub code");

    // Fetch GitHub user profile
    const { data: githubUser } = await axios.get(
      "https://api.github.com/user",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let email = githubUser.email;

    // If email not public, fetch verified primary email
    if (!email) {
      const { data: emails } = await axios.get(
        "https://api.github.com/user/emails",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const primaryEmailObj = emails.find((e) => e.primary && e.verified);
      if (!primaryEmailObj)
        return ApiError.send(
          res,
          400,
          "GitHub email not available or not verified"
        );

      email = primaryEmailObj.email;
    }



    // Find user by providerId or by email
    let user = await Prisma.user.findFirst({
      where: {
        provider: "github",
        providerId: githubUser.id.toString(),
      },
    });

    if (!user) {
      user = await Prisma.user.findUnique({ where: { email } });
    }

    // If user doesn't exist, create new
    if (!user) {
      const fullName = email.split("@")[0];

      // Generate a unique username
      let baseUsername = email.split("@")[0].toLowerCase();
      let username = baseUsername;
      let counter = 1;
      while (await Prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${counter++}`;
      }

      user = await Prisma.user.create({
        data: {
          fullName,
          username,
          email,
          password: "", // empty since OAuth user
          provider: "github",
          providerId: githubUser.id.toString(),
          githubAccessToken: accessToken, // Save the access token with correct field name
        },
      });
    } else {
      // Update existing user with latest accessToken
      await Prisma.user.update({
        where: { id: user.id },
        data: { githubAccessToken: accessToken },
      });
    }

    // Generate your app's JWT token for session
    const token = generateAccessToken(user.id, user.email);

    // Return user token and repos fetched from GitHub
    return res
      .status(200)
      .cookie("accessToken", token, cookieOptions)
      .json(new ApiResponse(200, "GitHub signup successful"));
  }

  // Fallback: regular email/password signup
  const schema = z.object({
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email(),
    password: z.string().min(6),
  });

  const { fullName, email, password } = schema.parse(req.body);

  const existing = await Prisma.user.findUnique({ where: { email } });
  if (existing) return ApiError.send(res, 409, "User already exists");

  const hashed = await hashPassword(password);

  let baseUsername = email.split("@")[0].toLowerCase();
  let username = baseUsername;
  let counter = 1;
  while (await Prisma.user.findUnique({ where: { username } })) {
    username = `${baseUsername}${counter++}`;
  }

  await Prisma.user.create({
    data: {
      fullName,
      username,
      email,
      password: hashed,
      provider: "email",
    },
  });
  return res.status(201).json(new ApiResponse(201, "User created"));
});
const loginUser = asyncHandler(async (req, res) => {

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const { email, password } = schema.parse(req.body);


  const user = await Prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, provider: true },
  });

  if (!user) throw new ApiError(401, "Invalid credentials");


  if (!user.password) {
    throw new ApiError(400, "Please log in with GitHub");
  }


  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");


  const accessToken = generateAccessToken(user.id, user.email);

  res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      new ApiResponse(200, {
        message: "Login successful",
        user: { id: user.id, email: user.email },
      }),
    );
});


const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return ApiError.send(res, 401, "Unauthorized");
  }

  const dbUser = await Prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      username: true,
      githubAccessToken: true,
    },
  });

  if (!dbUser) {
    return ApiError.send(res, 404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "Current user fatched.", dbUser));
});

const logoutUser = asyncHandler(async (req, res) => {
  return res
    .clearCookie("accessToken", cookieOptions)
    .status(200)
    .json(new ApiResponse(200, "Logout successful"));
});

const githubConnect = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const existingUser = await Prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!existingUser) return ApiError.send(res, 404, "User not found");

  const tokenRes = await axios.post(
    "https://github.com/login/oauth/access_token",
    {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    },
    { headers: { Accept: "application/json" } }
  );

  const accessToken = tokenRes.data.access_token;
  if (!accessToken) return ApiError.send(res, 401, "Invalid GitHub code");

  const { data: githubUser } = await axios.get("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  await Prisma.user.update({
    where: { id: existingUser.id },
    data: {
      providerId: githubUser.id.toString(),
      githubAccessToken: accessToken,
      provider: existingUser.provider?.includes("github")
        ? existingUser.provider
        : `${existingUser.provider || "email"}+github`,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, "GitHub account linked successfully"));
});


export { registerUser, loginUser, getCurrentUser, logoutUser, githubConnect };
