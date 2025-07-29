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
    try {
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
      if (!accessToken) {
        return ApiError.send(res, 401, "Invalid GitHub code");
      }

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
        if (!primaryEmailObj) {
          return ApiError.send(
            res,
            400,
            "GitHub email not available or not verified"
          );
        }

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
        const fullName = githubUser.name || email.split("@")[0];

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
            githubAccessToken: accessToken,
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
        .json(ApiResponse.success(
          { user: { id: user.id, email: user.email } },
          "GitHub signup successful"
        ));
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      return ApiError.send(res, 500, "GitHub authentication failed");
    }
  }

  // Fallback: regular email/password signup
  const schema = z.object({
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    return ApiError.send(res, 400, "Validation failed", result.error.flatten().fieldErrors);
  }

  const { fullName, email, password } = result.data;

  const existing = await Prisma.user.findUnique({ where: { email } });
  if (existing) {
    return ApiError.send(res, 409, "User already exists");
  }

  const hashed = await hashPassword(password);

  let baseUsername = email.split("@")[0].toLowerCase();
  let username = baseUsername;
  let counter = 1;
  while (await Prisma.user.findUnique({ where: { username } })) {
    username = `${baseUsername}${counter++}`;
  }

  const user = await Prisma.user.create({
    data: {
      fullName,
      username,
      email,
      password: hashed,
      provider: "email",
    },
  });

  return res.status(201).json(
    ApiResponse.success(
      { user: { id: user.id, email: user.email } },
      "User created successfully",
      201
    )
  );
});

const loginUser = asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    return ApiError.send(res, 400, "Validation failed", result.error.flatten().fieldErrors);
  }

  const { email, password } = result.data;

  const user = await Prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, provider: true },
  });

  if (!user) {
    return ApiError.send(res, 401, "Invalid credentials");
  }

  if (!user.password) {
    return ApiError.send(res, 400, "Please log in with GitHub");
  }

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    return ApiError.send(res, 401, "Invalid credentials");
  }

  const accessToken = generateAccessToken(user.id, user.email);

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      ApiResponse.success(
        { user: { id: user.id, email: user.email } },
        "Login successful"
      )
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
    .json(ApiResponse.success(dbUser, "Current user fetched successfully"));
});

const logoutUser = asyncHandler(async (req, res) => {
  return res
    .clearCookie("accessToken", cookieOptions)
    .status(200)
    .json(ApiResponse.success(null, "Logout successful"));
});

const githubConnect = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return ApiError.send(res, 400, "GitHub code is required");
  }

  const existingUser = await Prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!existingUser) {
    return ApiError.send(res, 404, "User not found");
  }

  try {
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
    if (!accessToken) {
      return ApiError.send(res, 401, "Invalid GitHub code");
    }

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
      .json(ApiResponse.success(null, "GitHub account linked successfully"));
  } catch (error) {
    console.error("GitHub connection error:", error);
    return ApiError.send(res, 500, "Failed to connect GitHub account");
  }
});

export { registerUser, loginUser, getCurrentUser, logoutUser, githubConnect };
