import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import axios from "axios";

const fetchGitHubRepos = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return ApiError.send(res, 401, "Unauthorized");
  }

  const user = await Prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      githubAccessToken: true,
    },
  });

  if (!user || !user.githubAccessToken) {
    return ApiError.send(res, 400, "GitHub access token not found for user");
  }

  try {
    const { data: githubRepos } = await axios.get(
      "https://api.github.com/user/repos",
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
        },
        params: {
          per_page: 100,
          sort: "updated",
          direction: "desc",
        },
      }
    );

    return res.status(200).json(
      ApiResponse.success(githubRepos, "GitHub repositories fetched successfully")
    );
  } catch (error) {
    console.error("GitHub API error:", error);
    return ApiError.send(res, 500, "Failed to fetch GitHub repositories");
  }
});

export { fetchGitHubRepos };
