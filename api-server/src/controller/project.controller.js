import { z } from 'zod'
import { generateSlug } from 'random-word-slugs'
import Prisma from '../db/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'


const createProject = asyncHandler(async (req, res) => {
    const schema = z.object({
        name: toString(),
        gitURL: toString()
    })

    const safeParesResult = schema.safeParse(req.body)
    if (safeParesResult.error) return ApiError.send(res, 400, safeParesResult.error)


    const { name, gitURL } = safeParesResult.data;

    const project = await Prisma.project.create({
        data: {
            name,
            gitURL,
            subdomain: generateSlug()
        }
    })

    return res.status(200).json(new ApiResponse(201, "Create project Successfull", project))

})

export {
    createProject
}